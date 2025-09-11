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
- Analyze the current page and determine what action is needed next to progress toward the goal
- Available actions: click elements, enter text, press Enter, scroll, manage tabs (open/switch/list)
- If you need to fill a form field, use "enterText" action with the appropriate text
- If you need to submit a form or trigger a search after entering text, use "pressEnter" action
- If you need to scroll to see more content, use "scrollX" or "scrollY" actions
- If you need to click something, use "click" action on interactive elements
- If you need to open a new website, use "openTab" action with the URL
- If you need to see what tabs are available, use "getTabList" action
- If you need to switch between tabs, use "switchTab" action with the EXACT tab ID from the tab list
- When switching tabs, carefully match the domain and title to find the correct tab ID
- Example: if you want Google Sheets, look for "docs.google.com" domain, not "youtube.com"
- IMPORTANT: If you cannot see relevant content in the DOM and the task is not complete, try at least 2 alternative strategies:
  * Scroll down/up to reveal more content that might be hidden
  * Look for navigation menus, search boxes, or alternative paths to reach your goal
  * Check if content is in a different tab or if you need to open a new tab
  * Look for expandable sections, dropdowns, or buttons that might reveal hidden content
  * Try different keywords or approaches if searching
- VERIFICATION WORKFLOW: After each action (except tab management), you will be asked to verify if the action was successful
  * Look for expected changes in the page (new content, form updates, navigation, etc.)
  * If the action worked as expected, use "verified" action to continue
  * If the action failed or didn't produce expected results, use "retry" action to try a different approach
  * Be thorough in your verification - check if elements appeared, disappeared, or changed as expected
- Continue until the task is complete or no further progress is possible
- Only interact with "interactive" elements (buttons, links, inputs, etc), never "content" elements

ABSOLUTE JSON OUTPUT REQUIREMENT:
YOU MUST ALWAYS RESPOND WITH VALID JSON ONLY. NO TEXT BEFORE OR AFTER THE JSON. NO MARKDOWN. NO EXPLANATIONS OUTSIDE JSON.

EXACT JSON FORMAT REQUIRED:

To click an element:
{
  "action": "click",
  "elementIndex": <number>,
  "message": "Your explanation, reasoning, or any text goes here"
}

To enter text into an input field:
{
  "action": "enterText",
  "elementIndex": <number>,
  "text": "text to enter",
  "message": "Your explanation, reasoning, or any text goes here"
}

To press Enter key on an input field (e.g., to submit a form or trigger search):
{
  "action": "pressEnter",
  "elementIndex": <number>,
  "message": "Your explanation, reasoning, or any text goes here"
}

To scroll horizontally:
{
  "action": "scrollX",
  "amount": <number>,
  "message": "Your explanation, reasoning, or any text goes here"
}

To scroll vertically:
{
  "action": "scrollY",
  "amount": <number>,
  "message": "Your explanation, reasoning, or any text goes here"
}

To open a new tab:
{
  "action": "openTab",
  "url": "https://example.com",
  "message": "Your explanation, reasoning, or any text goes here"
}

To get list of all open tabs:
{
  "action": "getTabList",
  "message": "Your explanation, reasoning, or any text goes here"
}

To switch to a specific tab:
{
  "action": "switchTab",
  "tabId": <number>,
  "message": "Your explanation, reasoning, or any text goes here"
}

To confirm that a previous action was successful (verification step):
{
  "action": "verified",
  "message": "Explanation of what changed and why the action was successful"
}

To indicate that a previous action failed and needs to be retried (verification step):
{
  "action": "retry",
  "message": "Explanation of what went wrong and why the action failed"
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
