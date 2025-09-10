// Background script for Chat Assistant
chrome.action.onClicked.addListener((tab) => {
  // Send message to content script to toggle sidebar
  chrome.tabs.sendMessage(tab.id, { action: "toggleSidebar" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(
        "Error sending message to content script:",
        chrome.runtime.lastError.message
      );
    }
  });
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "callClaudeAPI") {
    callGroqAPI(request.message, request.elements || [])
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

async function callGroqAPI(message, elements = []) {
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

  const systemPrompt = `You are a web automation assistant. The user will provide a request and you have access to interactive elements on the current page. 

Available elements:
${elementsList.map(el => `${el.index}: ${el.tagName}${el.type ? `[${el.type}]` : ''} - "${el.title}" (${el.elementType})`).join('\n')}

IMPORTANT: Only click on "interactive" elements (buttons, links, inputs, etc). Do NOT click on "content" elements (text, images, etc) as they are not clickable. Content elements are only shown for context.

ALWAYS respond with valid JSON in this exact format:

For click actions on interactive elements:
{"action": "click", "elementIndex": <number>, "message": "<your explanation/response>"}

For non-click responses or when user asks to click content elements:
{"action": "none", "message": "<your explanation/response>"}

Never include any text outside the JSON structure. Always include a "message" field with your response.`;

  const requestBody = {
    model: "meta-llama/llama-4-maverick-17b-128e-instruct",
    max_tokens: 1000,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: message,
      },
    ],
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
