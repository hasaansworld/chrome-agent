// Background script for Chat Assistant
chrome.action.onClicked.addListener(async (tab) => {
  // Open the sidebar panel
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error("Error opening sidebar:", error);
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "callClaudeAPI") {
    callGroqAPI(
      request.message, 
      request.elements || [], 
      request.conversationHistory || [], 
      request.model || 'meta-llama/llama-4-maverick-17b-128e-instruct'
    )
      .then((response) => {
        sendResponse({ success: true, response });
      })
      .catch((error) => {
        console.error("Error calling Groq API:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep the message channel open for async response
  }
});

async function callGroqAPI(message, elements = [], conversationHistory = [], model = 'meta-llama/llama-4-maverick-17b-128e-instruct') {
  const API_KEY = "REMOVED_GROQ_KEY";

  if (!API_KEY || API_KEY === "your-groq-api-key-here") {
    throw new Error(
      "Please configure your Groq API key in the extension code."
    );
  }

  // Create simplified element list for the prompt
  const elementsList = elements.map((el, index) => ({
    index: index,
    tagName: el.tagName,
    title: el.title,
    type: el.type,
    href: el.href,
    elementType: el.elementType
  }));

  const systemPrompt = `You are an autonomous web automation agent. You will be provided with task instructions and HTML DOM content. Your job is to analyze the current page state and determine the next action needed to complete the task.

TASK INSTRUCTIONS: Complete the user's request by clicking through the necessary elements step by step.

Available DOM elements:
${elementsList.map(el => `${el.index}: ${el.tagName}${el.type ? `[${el.type}]` : ''} - "${el.title}" (${el.elementType})`).join('\n')}

AGENT BEHAVIOR:
- Analyze the current page and determine what needs to be clicked next to progress toward the goal
- If you can identify the next logical step, click on the appropriate interactive element
- Continue until the task is complete or no further progress is possible
- Only click on "interactive" elements (buttons, links, inputs, etc), never "content" elements

ABSOLUTE JSON OUTPUT REQUIREMENT:
YOU MUST ALWAYS RESPOND WITH VALID JSON ONLY. NO TEXT BEFORE OR AFTER THE JSON. NO MARKDOWN. NO EXPLANATIONS OUTSIDE JSON.

EXACT JSON FORMAT REQUIRED:

To continue working (click next element):
{
  "action": "click",
  "elementIndex": <number>,
  "message": "Your explanation, reasoning, or any text goes here"
}

When task is complete or no further action possible:
{
  "action": "none", 
  "message": "Task completion status, reasoning, or any text goes here"
}

CRITICAL JSON RULES:
- Your ENTIRE response must be valid JSON that can be parsed
- NEVER write text outside the JSON structure
- NEVER use markdown formatting around the JSON
- ALL explanations, thoughts, reasoning must go in the "message" key
- Use "action": "click" to continue, "action": "none" to stop
- The "message" key is where ALL your text communication goes
- Do not prefix with "Here's the JSON:" or any other text
- Start your response directly with { and end with }

INVALID EXAMPLES (DO NOT DO THIS):
- "I need to click the button. {"action": "click"...}"
- Using markdown code blocks around JSON
- "Here is my response: {"action": "click"...}"

VALID EXAMPLE:
{"action": "click", "elementIndex": 5, "message": "I identified the login button and will click it to proceed with authentication"}`;

  // Build messages array: system prompt first, then conversation history, then current user message
  const messages = [
    {
      role: "system",
      content: systemPrompt,
    }
  ];

  // Add all conversation history except the last message (which should be the current user message)
  if (conversationHistory.length > 0) {
    // Add all but the last message from history (the last one is the current user message we just added)
    const historyMessages = conversationHistory.slice(0, -1);
    messages.push(...historyMessages);
  }

  // Always add the current user message at the end
  messages.push({
    role: "user",
    content: message,
  });

  const requestBody = {
    model: model,
    max_tokens: 1000,
    messages: messages,
  };

  console.log("=== GROQ API REQUEST DETAILS ===");
  console.log("URL:", "https://api.groq.com/openai/v1/chat/completions");
  console.log("API Key (first 10 chars):", API_KEY.substring(0, 10) + "...");
  console.log("Request Body:", JSON.stringify(requestBody, null, 2));
  console.log("=================================");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("=== FULL API ERROR DETAILS ===");
    console.error("Status:", response.status);
    console.error("Status Text:", response.statusText);
    console.error("Headers:", Object.fromEntries(response.headers.entries()));
    console.error("Response Body:", errorText);
    console.error("Request URL:", response.url);
    console.error("===============================");
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
