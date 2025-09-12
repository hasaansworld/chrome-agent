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
    // Use async/await pattern for better error handling
    (async () => {
      try {
        let screenshot = null;

        // Try to capture screenshot, but don't fail if it doesn't work
        let screenshotStatus = "not_attempted";
        let screenshotTime = 0;
        try {
          const tabId = request.tabId || (sender.tab && sender.tab.id);
          if (tabId) {
            console.log(
              "Attempting to capture screenshot for tab:",
              tabId,
              "from request.tabId:",
              request.tabId
            );

            // Check if tab URL is accessible for screenshots
            const tab = await chrome.tabs.get(tabId);
            if (
              !tab.url ||
              tab.url.startsWith("chrome://") ||
              tab.url.startsWith("chrome-extension://") ||
              tab.url.startsWith("moz-extension://") ||
              tab.url === ""
            ) {
              console.log("Tab URL not accessible for screenshots:", tab.url);
              screenshotStatus = "restricted_url";
              screenshotTime = 0;
            } else {
              // Time the screenshot capture
              const screenshotStart = performance.now();
              screenshot = await captureTabScreenshot(tabId);
              screenshotTime = Math.round(performance.now() - screenshotStart);

              console.log(
                "Screenshot captured successfully, length:",
                screenshot ? screenshot.length : "null",
                "Time:",
                screenshotTime + "ms"
              );
              screenshotStatus = "success";
            }
          } else {
            console.log(
              "No tab ID available for screenshot (sender.tab:",
              sender.tab,
              "request.tabId:",
              request.tabId,
              ")"
            );
            screenshotStatus = "no_tab";
          }
        } catch (screenshotError) {
          console.error("Screenshot capture failed:", screenshotError);
          screenshotStatus = "failed";
          screenshotTime = 0;
        }

        // Call OpenAI API with or without screenshot
        const apiStart = performance.now();
        const response = await callOpenAIAPI(
          request.message,
          request.elements || [],
          request.conversationHistory || [],
          request.model || "gpt-4o-2024-11-20",
          screenshot
        );
        const apiTime = Math.round(performance.now() - apiStart);

        console.log(
          "Sending response with screenshotStatus:",
          screenshotStatus,
          "Timings - Screenshot:",
          screenshotTime + "ms",
          "API:",
          apiTime + "ms"
        );
        sendResponse({
          success: true,
          response,
          screenshotStatus,
          screenshotData: screenshot, // Include the actual screenshot data
          timings: { screenshot: screenshotTime, api: apiTime },
        });
      } catch (error) {
        console.error("Error in API call:", error);
        sendResponse({
          success: false,
          error: error.message || "Unknown error occurred",
        });
      }
    })();

    return true; // Keep the message channel open for async response
  }
});

async function captureTabScreenshot(tabId) {
  try {
    console.log("Attempting to capture screenshot for tab:", tabId);

    // Make sure the tab exists and is active
    const tab = await chrome.tabs.get(tabId);
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }

    console.log(
      "Tab found:",
      tab.url,
      "Active:",
      tab.active,
      "WindowId:",
      tab.windowId
    );

    // Make sure the tab AND window are focused
    if (!tab.active) {
      console.log("Tab not active, activating and focusing window");

      // Focus the window first
      await chrome.windows.update(tab.windowId, { focused: true });

      // Then activate the tab
      await chrome.tabs.update(tabId, { active: true });

      // Get updated tab info
      const updatedTab = await chrome.tabs.get(tabId);
      console.log("Updated tab active status:", updatedTab.active);

      // Double-check window focus
      const window = await chrome.windows.get(tab.windowId);
      console.log("Window focused:", window.focused);
    } else {
      // Even if tab is active, make sure window is focused
      const window = await chrome.windows.get(tab.windowId);
      if (!window.focused) {
        console.log("Window not focused, focusing it");
        await chrome.windows.update(tab.windowId, { focused: true });
      }
    }

    try {
      // Try to capture from the specific window that contains our tab
      const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "png",
        quality: 90,
      });

      console.log(
        "Screenshot captured successfully, length:",
        screenshot.length
      );
      return screenshot;
    } catch (permissionError) {
      if (permissionError.message.includes("permission")) {
        console.log("Permission error, trying alternative approach");

        // Try capturing from current window (null parameter)
        const screenshot = await chrome.tabs.captureVisibleTab(null, {
          format: "png",
          quality: 90,
        });

        console.log(
          "Screenshot captured with fallback method, length:",
          screenshot.length
        );
        return screenshot;
      } else {
        throw permissionError;
      }
    }
  } catch (error) {
    console.error("Error capturing screenshot:", error);
    throw error;
  }
}

async function callOpenAIAPI(
  message,
  elements = [],
  conversationHistory = [],
  model = "gpt-4o-2024-11-20",
  screenshot = null
) {
  // Read API key from environment - Note: In Chrome extension, you would need to read from storage or inject it
  const API_KEY =
    "REMOVED_OPENAI_KEY";

  if (!API_KEY || API_KEY === "your-openai-api-key-here") {
    throw new Error(
      "Please configure your OpenAI API key in the extension code."
    );
  }

  console.log("=== OPENAI API CALL DEBUG ===");
  console.log("Elements count:", elements.length);
  console.log("Conversation history length:", conversationHistory.length);
  console.log("Model:", model);

  // Create simplified element list for the prompt
  const elementsList = elements.map((el, index) => ({
    index: index,
    tagName: el.tagName,
    title: el.title,
    type: el.type,
    href: el.href,
    elementType: el.elementType,
  }));

  const systemPrompt = `You are an autonomous web automation agent. You will be provided with task instructions, a screenshot of the current page, and HTML DOM content. Your job is to analyze the current page state and determine the next action needed to complete the task.

TASK INSTRUCTIONS: Complete the user's request by clicking through the necessary elements step by step.

VISUAL ANALYSIS: You will receive a screenshot of the current page that shows exactly what the user sees. 

CRITICAL: ALWAYS refer to the screenshot to understand the current UI state before making decisions:
- Look at what's actually visible on the page
- Check if elements are loaded, forms are filled, or content has changed
- Use the screenshot to verify the current state before taking the next action
- The screenshot shows the REAL current state - trust it over assumptions

Available DOM elements:
${elementsList
  .map(
    (el) =>
      `${el.index}: ${el.tagName}${el.type ? `[${el.type}]` : ""} - "${
        el.title
      }" (${el.elementType})`
  )
  .join("\n")}

AGENT BEHAVIOR:
- You are provided with both a SCREENSHOT and DOM elements that describe the current page state
- Use the screenshot to visually understand the page layout and current state
- Use the DOM element information to understand the page structure and available interactions
- Cross-reference the visual information with the DOM element list to make precise action decisions
- Analyze the current page and determine what action is needed next to progress toward the goal
- ** IMPORTANT: ALWAYS use the screenshot to verify if the previous action succeeded before continuing to the next action **
- Available actions: click elements, enter text, press Enter, scroll, manage tabs (open/switch/list)
- If you need to fill a form field, use "enterText" action with the appropriate text. Click the field to focusi it before entering text
- If you need to submit a form or trigger a search after entering text, use "pressEnter" action
- If you need to scroll to see more content, use "scrollX" or "scrollY" actions
- If you need to click something, use "click" action on interactive elements
- If clicking one element doesn't work, try adjacent or similar elements with related functionality
- If you need to open a new website, use "openTab" action with the URL
- If you need to see what tabs are available, use "getTabList" action
- If you need to switch between tabs, use "switchTab" action with the EXACT tab ID from the tab list
- When switching tabs, carefully match the domain and title to find the correct tab ID
- Example: if you want Google Sheets, look for "docs.google.com" domain, not "youtube.com"

PERSISTENCE AND DETERMINATION:
- You are HIGHLY PERSISTENT and will NOT give up easily on tasks
- If an action fails, ALWAYS try multiple alternative approaches before considering the task impossible
- EXHAUST ALL POSSIBILITIES before giving up - try at least 3-5 different strategies for each step
- When actions fail, systematically try these alternatives:
  * Scroll down/up to reveal more content that might be hidden
  * Look for navigation menus, search boxes, or alternative paths to reach your goal
  * Check if content is in a different tab or if you need to open a new tab
  * Look for expandable sections, dropdowns, or buttons that might reveal hidden content
  * Try different keywords or approaches if searching
  * Look for alternative UI patterns (hamburger menus, footer links, sidebar options)
  * Try keyboard shortcuts or Enter key on focused elements as click alternatives
  * Look for similar elements with different text or positioning
  * Check for elements that might be loaded dynamically after waiting
  * Try interacting with parent or child elements if the target element doesn't work
- ONLY declare a task impossible after exhausting ALL reasonable alternatives
- Be creative and think of unconventional approaches when standard methods fail
- If you encounter errors, analyze them carefully and adjust your strategy accordingly
- Remember: Users are counting on you to complete their tasks - be resourceful and determined

EXECUTION FLOW:
- Take one action at a time based on the current page state
- After each action, you will see the next page state and can decide the next action
- You have to check the screenshot to see if previous action succeeded or not. If not retry it.
- Continue until the task is complete


ABSOLUTE JSON OUTPUT REQUIREMENT:
YOU MUST ALWAYS RESPOND WITH VALID JSON ONLY. NO TEXT BEFORE OR AFTER THE JSON. NO MARKDOWN. NO EXPLANATIONS OUTSIDE JSON.

EXACT JSON FORMAT REQUIRED:

To click an element:
{
  "action": "click",
  "elementIndex": <number>,
  "elementText": "Expected text content of the element",
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

TASK COMPLETION - WHEN TO STOP:
Use "action": "none" when the task is complete or no further action is needed.

{
  "action": "none", 
  "message": "Explain what was accomplished and why the task is complete"
}

IMPORTANT COMPLETION RULES:
- Use "action": "none" ONLY when the task is fully accomplished
- Examples of when to use "none":
  * Event successfully created in calendar
  * Form successfully submitted  
  * Search completed and results visible
  * Navigation to requested page completed
  * Information successfully found and displayed
- DO NOT use "verified", "retry", or any other action names - only the actions listed above

CRITICAL JSON RULES:
- Your ENTIRE response must be ONLY valid JSON that can be parsed
- NEVER write text outside the JSON structure  
- ABSOLUTELY NO markdown code blocks (triple backticks with json or triple backticks)
- NO backticks, no code blocks, no markdown formatting whatsoever
- ALL explanations, thoughts, reasoning must go in the "message" key
- Start response with { and end with } - nothing else
- Use "action": "click" to continue, "action": "none" to stop
- WRONG: wrapping JSON in code blocks with backticks
- CORRECT: {"action":"click","elementIndex":5,"message":"explanation"}
- The "message" key is where ALL your text communication goes
- Do not prefix with "Here's the JSON:" or any other text
- Start your response directly with { and end with }

INVALID EXAMPLES (DO NOT DO THIS):
- "I need to click the button. {"action": "click"...}"
- Using markdown code blocks around JSON
- "Here is my response: {"action": "click"...}"

VALID EXAMPLE:
{"action": "click", "elementIndex": 5, "elementText": "Login", "message": "I identified the login button and will click it to proceed with authentication"}`;

  // Build messages array: system prompt first, then conversation history, then current user message
  const messages = [
    {
      role: "system",
      content: systemPrompt,
    },
  ];

  // Add all conversation history except the last message (which should be the current user message)
  if (conversationHistory.length > 0) {
    // Add all but the last message from history (the last one is the current user message we just added)
    const historyMessages = conversationHistory.slice(0, -1);
    messages.push(...historyMessages);
  }

  // Add current user message with screenshot if available
  if (screenshot) {
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: message,
        },
        {
          type: "image_url",
          image_url: {
            url: screenshot,
            detail: "high",
          },
        },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: message,
    });
  }

  const requestBody = {
    model: model,
    max_tokens: 2000, // Increased token limit for better responses
    messages: messages,
  };

  console.log("=== OPENAI API REQUEST DETAILS ===");
  console.log("URL:", "https://api.openai.com/v1/chat/completions");
  console.log("API Key (first 10 chars):", API_KEY.substring(0, 10) + "...");
  console.log("Request Body:", JSON.stringify(requestBody, null, 2));
  console.log("===================================");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
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
