const express = require('express');
const cors = require('cors');
const { StateGraph, MessagesAnnotation, END } = require('@langchain/langgraph');
const { HumanMessage, AIMessage } = require('@langchain/core/messages');
const { tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { ToolNode } = require('@langchain/langgraph/prebuilt');
const { ChatGroq } = require('@langchain/groq');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Simple in-memory storage for sessions
const sessions = new Map();

// LangChain Web Agent Tools
const createWebTools = (sessionId) => [
  tool(
    async ({ elementIndex, reasoning }) => {
      console.log(`🔄 Server: Click tool called - Element ${elementIndex}: ${reasoning}`);
      return {
        success: true,
        action: 'click',
        elementIndex,
        reasoning,
        message: `Clicked element ${elementIndex}: ${reasoning}`
      };
    },
    {
      name: "click_element",
      description: "Click on a specific element by its index. Use this to interact with buttons, links, and other clickable elements.",
      schema: z.object({
        elementIndex: z.number().describe("The index of the element to click"),
        reasoning: z.string().describe("Why you are clicking this element and what you expect to happen")
      })
    }
  ),

  tool(
    async ({ elementIndex, text, reasoning }) => {
      console.log(`🔄 Server: Text entry tool called - Element ${elementIndex}: "${text}" - ${reasoning}`);
      return {
        success: true,
        action: 'enterText',
        elementIndex,
        text,
        reasoning,
        message: `Entered text "${text}" into element ${elementIndex}: ${reasoning}`
      };
    },
    {
      name: "enter_text",
      description: "Enter text into an input field, textarea, or editable element.",
      schema: z.object({
        elementIndex: z.number().describe("The index of the element to enter text into"),
        text: z.string().describe("The text to enter"),
        reasoning: z.string().describe("Why you are entering this text and what it accomplishes")
      })
    }
  ),

  tool(
    async ({ direction, amount, reasoning }) => {
      console.log(`🔄 Server: Scroll tool called - ${direction} by ${amount}px: ${reasoning}`);
      return {
        success: true,
        action: direction === 'horizontal' ? 'scrollX' : 'scrollY',
        amount,
        reasoning,
        message: `Scrolled ${direction} by ${amount}px: ${reasoning}`
      };
    },
    {
      name: "scroll_page",
      description: "Scroll the page to reveal more content or navigate to different sections.",
      schema: z.object({
        direction: z.enum(["vertical", "horizontal"]).describe("Direction to scroll"),
        amount: z.number().describe("Amount to scroll in pixels (positive for down/right, negative for up/left)"),
        reasoning: z.string().describe("Why you are scrolling and what you expect to find")
      })
    }
  ),

  tool(
    async ({ duration, reasoning }) => {
      console.log(`🔄 Server: Wait tool called - ${duration}ms: ${reasoning}`);
      return {
        success: true,
        action: 'wait',
        duration,
        reasoning,
        message: `Waiting ${duration}ms: ${reasoning}`
      };
    },
    {
      name: "wait",
      description: "Wait for a specified duration to allow page elements to load or animations to complete.",
      schema: z.object({
        duration: z.number().describe("Duration to wait in milliseconds"),
        reasoning: z.string().describe("Why you need to wait and what you expect to happen")
      })
    }
  ),

  tool(
    async ({ reasoning }) => {
      console.log(`🔄 Server: Task complete tool called: ${reasoning}`);
      return {
        success: true,
        action: 'none',
        reasoning,
        message: `Task completed: ${reasoning}`
      };
    },
    {
      name: "complete_task",
      description: "Mark the current task as completed when the objective has been achieved.",
      schema: z.object({
        reasoning: z.string().describe("Explanation of what was accomplished and why the task is complete")
      })
    }
  )
];

// Create LangGraph workflow
const createAgentWorkflow = () => {
  const tools = createWebTools();
  const toolNode = new ToolNode(tools);

  // Use Groq with GPT-OSS model
  const llm = new ChatGroq({
    modelName: "openai/gpt-oss-120b",
    temperature: 0.1,
    apiKey: process.env.GROQ_API_KEY
  }).bindTools(tools);

  const shouldContinue = (state) => {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];

    // Check if complete_task was called in the last tool call
    if (lastMessage?.tool_calls?.length) {
      const hasCompleteTask = lastMessage.tool_calls.some(call => call.name === 'complete_task');
      if (hasCompleteTask) {
        return END;
      }
      return "tools";
    }
    return END;
  };

  const callModel = async (state) => {
    const systemPrompt = `You are an advanced web automation agent. You help users complete tasks on web pages by using available tools.

Available tools:
- click_element: Click on buttons, links, and interactive elements
- enter_text: Enter text into forms and input fields
- scroll_page: Scroll to find content or navigate
- wait: Wait for page loads or dynamic content
- complete_task: Mark task as finished when objective is achieved

Instructions:
1. Analyze the user's request and the current page elements
2. Plan a sequence of actions to complete the task
3. Use tools one at a time, providing clear reasoning
4. CRITICAL: ALWAYS call complete_task when ANY progress is made - this is REQUIRED to end the workflow
5. If you take more than 8 actions, STOP and call complete_task immediately with whatever progress you've made
6. If you can't find the exact element, try your best attempt then call complete_task
7. If you repeat the same action twice, call complete_task instead of continuing
8. IMPORTANT: complete_task is mandatory - every workflow MUST end with this call

Current page elements will be provided in the user message. Use the element indices when clicking or entering text.`;

    const messages = [
      new HumanMessage(systemPrompt),
      ...state.messages
    ];

    const response = await llm.invoke(messages);
    return { messages: [response] };
  };

  const workflow = new StateGraph(MessagesAnnotation)
    .addNode("agent", callModel)
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinue, {
      tools: "tools",
      __end__: END
    })
    .addEdge("tools", "agent");

  return workflow.compile();
};

// API Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'LangChain Agent Server is running' });
});

// Create new agent session
app.post('/agent/session', (req, res) => {
  const sessionId = Date.now().toString();
  sessions.set(sessionId, {
    messages: [],
    workflow: createAgentWorkflow()
  });

  console.log(`🆕 Created new agent session: ${sessionId}`);
  res.json({ sessionId, message: 'Agent session created' });
});

// Execute agent task
app.post('/agent/execute', async (req, res) => {
  try {
    const { sessionId, task, elements } = req.body;

    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(400).json({ error: 'Invalid or missing session ID' });
    }

    const session = sessions.get(sessionId);

    // Create context message with task and elements
    const elementsText = elements?.length ?
      `\n\nCurrent page elements:\n${elements.map((el, i) =>
        `${i}: ${el.tagName}${el.type ? `[${el.type}]` : ""} - "${el.title || 'No text'}" (${el.elementType})`
      ).join('\n')}` : '';

    const contextMessage = new HumanMessage(`Task: ${task}${elementsText}`);

    console.log(`🎯 Executing task for session ${sessionId}: "${task}"`);
    console.log(`📋 Elements provided: ${elements?.length || 0}`);

    const result = await session.workflow.invoke({
      messages: [contextMessage]
    }, {
      recursionLimit: 50
    });

    // Extract actions from tool calls in the conversation
    const actions = [];
    for (const message of result.messages) {
      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          actions.push({
            tool: toolCall.name,
            args: toolCall.args,
            id: toolCall.id
          });
        }
      }
    }

    const response = {
      success: true,
      sessionId,
      actions,
      messages: result.messages.map(msg => ({
        role: msg.constructor.name.includes('Human') ? 'user' : 'assistant',
        content: msg.content
      })),
      messageCount: result.messages.length
    };

    console.log(`✅ Task executed successfully. Actions: ${actions.length}`);
    res.json(response);

  } catch (error) {
    console.error('❌ Agent execution error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Agent execution failed'
    });
  }
});

// Get session status
app.get('/agent/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = sessions.get(sessionId);
  res.json({
    sessionId,
    messageCount: session.messages.length,
    status: 'active'
  });
});

// Clean up old sessions (run every hour)
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [sessionId, session] of sessions.entries()) {
    if (parseInt(sessionId) < oneHourAgo) {
      sessions.delete(sessionId);
      console.log(`🧹 Cleaned up old session: ${sessionId}`);
    }
  }
}, 60 * 60 * 1000);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 LangChain Agent Server running on http://localhost:${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  /health - Health check`);
  console.log(`   POST /agent/session - Create new agent session`);
  console.log(`   POST /agent/execute - Execute agent task`);
  console.log(`   GET  /agent/session/:id - Get session status`);
});

module.exports = app;