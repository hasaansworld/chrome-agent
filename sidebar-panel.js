// Sidebar Panel Script for Chrome Sidebar API
(function () {
  "use strict";

  let conversationHistory = [];
  let currentTabId = null;
  let isAgentRunning = false;

  // DOM elements
  const chatMessages = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-btn");
  const clearBtn = document.getElementById("clear-btn");
  const modelSelector = document.getElementById("model-selector");
  const boundingBoxToggle = document.getElementById("bounding-box-toggle");
  const status = document.getElementById("status");
  const currentUrl = document.getElementById("current-url");
  const screenshotSection = document.getElementById("screenshot-section");
  const screenshotImage = document.getElementById("screenshot-image");
  const screenshotToggle = document.getElementById("screenshot-toggle");

  // Initialize
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    setupEventListeners();
    getCurrentTabInfo();
    updateStatus("Ready");
  }

  function setupEventListeners() {
    sendBtn.addEventListener("click", handleSendMessage);
    clearBtn.addEventListener("click", clearChat);
    boundingBoxToggle.addEventListener("change", handleBoundingBoxToggle);
    screenshotToggle.addEventListener("click", handleScreenshotToggle);

    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    // Auto-resize textarea
    chatInput.addEventListener("input", () => {
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
    });

    // Click on screenshot to open in new tab
    screenshotImage.addEventListener("click", () => {
      if (screenshotImage.src && screenshotImage.src !== '') {
        window.open(screenshotImage.src, '_blank');
      }
    });
  }

  async function getCurrentTabInfo() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab) {
        currentTabId = tab.id;
        currentUrl.textContent = tab.url;
        updateStatus("Connected to tab");
      }
    } catch (error) {
      console.error("Error getting current tab:", error);
      updateStatus("Error connecting to tab");
    }
  }

  async function handleBoundingBoxToggle() {
    if (!currentTabId) {
      await getCurrentTabInfo();
      if (!currentTabId) {
        return;
      }
    }

    if (boundingBoxToggle.checked) {
      chrome.tabs.sendMessage(currentTabId, { action: "showBoundingBoxes" });
    } else {
      chrome.tabs.sendMessage(currentTabId, { action: "clearBoundingBoxes" });
    }
  }

  function handleScreenshotToggle() {
    const isVisible = screenshotSection.style.display !== "none";
    
    if (isVisible) {
      screenshotSection.style.display = "none";
      screenshotToggle.textContent = "Show";
    } else {
      screenshotSection.style.display = "block";
      screenshotToggle.textContent = "Hide";
    }
  }

  function displayScreenshot(screenshotData) {
    if (screenshotData) {
      screenshotImage.src = screenshotData;
      screenshotSection.style.display = "block";
      screenshotToggle.textContent = "Hide";
    }
  }


  async function validateElementText(currentTabId, actionData, originalElements) {
    // If no elementText provided by LLM, skip validation
    if (!actionData.elementText) {
      return { isValid: true };
    }

    try {
      // Get fresh elements from the page
      const elementsData = await getElementsFromTab(currentTabId);
      if (!elementsData || !elementsData.data || !elementsData.data.elements) {
        return { 
          isValid: false, 
          errorMessage: "❌ Could not extract elements for validation" 
        };
      }

      const currentElements = elementsData.data.elements;
      const targetIndex = actionData.elementIndex;
      const expectedText = actionData.elementText.toLowerCase().trim();

      // Check if target index exists
      if (targetIndex < 0 || targetIndex >= currentElements.length) {
        return {
          isValid: false,
          errorMessage: `❌ Element index ${targetIndex} out of range (0-${currentElements.length - 1})`
        };
      }

      const targetElement = currentElements[targetIndex];
      const actualText = (targetElement.title || "").toLowerCase().trim();

      // Check if text matches (starts with expected text)
      if (actualText.startsWith(expectedText) || expectedText.startsWith(actualText)) {
        return { isValid: true };
      }

      // Text doesn't match - find alternative elements with matching text
      const matchingElements = [];
      currentElements.forEach((element, index) => {
        const elementText = (element.title || "").toLowerCase().trim();
        if (elementText.startsWith(expectedText) || expectedText.startsWith(elementText)) {
          matchingElements.push({ index, text: element.title, tagName: element.tagName });
        }
      });

      let errorMessage = `❌ Element text mismatch at index ${targetIndex}:\n`;
      errorMessage += `   Expected: "${actionData.elementText}"\n`;
      errorMessage += `   Found: "${targetElement.title}"\n`;
      
      if (matchingElements.length > 0) {
        errorMessage += `   Did you mean to click one of these instead?\n`;
        matchingElements.forEach(match => {
          errorMessage += `   • Index ${match.index}: ${match.tagName} - "${match.text}"\n`;
        });
      } else {
        errorMessage += `   No elements found with similar text.`;
      }

      return {
        isValid: false,
        errorMessage: errorMessage
      };

    } catch (error) {
      return {
        isValid: false,
        errorMessage: `❌ Validation error: ${error.message}`
      };
    }
  }

  async function handleSendMessage() {
    const message = chatInput.value.trim();
    if (!message || isAgentRunning) return;

    if (!currentTabId) {
      await getCurrentTabInfo();
      if (!currentTabId) {
        addMessage("system", "Please navigate to a webpage first.");
        return;
      }
    }

    // Clear input and disable controls
    chatInput.value = "";
    chatInput.style.height = "auto";
    setControlsEnabled(false);
    isAgentRunning = true;

    // Add user message
    addMessage("user", message);

    // Add initial user message to conversation history
    conversationHistory.push({
      role: "user",
      content: message,
    });

    updateStatus("Running automation...");

    try {
      await executeNextAction(message, 1);
    } catch (error) {
      console.error("Agent error:", error);
      addMessage("system", `❌ Agent error: ${error.message}`);
    } finally {
      setControlsEnabled(true);
      isAgentRunning = false;
      updateStatus("Ready");
    }
  }

  function getActionDelay(action) {
    return 0; // No delays between actions
  }

  async function executeAction(actionData, currentTabId, originalElements) {
    try {
      if (
        actionData.action === "click" &&
        actionData.elementIndex !== undefined
      ) {
        // Validate element text before clicking
        const validationResult = await validateElementText(currentTabId, actionData, originalElements);
        if (!validationResult.isValid) {
          addMessage("system", validationResult.errorMessage);
          
          // Add validation failure to conversation history for LLM feedback
          conversationHistory.push({
            role: "system",
            content: `VALIDATION FAILED: ${validationResult.errorMessage}`
          });
          
          return false;
        }

        const result = await executeClickInTab(
          currentTabId,
          actionData.elementIndex,
          originalElements
        );
        if (result.success) {
          addMessage("system", `✓ Clicked element: ${result.message}`);
          return true;
        } else {
          addMessage("system", `❌ Click failed: ${result.error}`);
          return false;
        }
      } else if (
        actionData.action === "enterText" &&
        actionData.elementIndex !== undefined &&
        actionData.text
      ) {
        const result = await enterTextInTab(
          currentTabId,
          actionData.elementIndex,
          actionData.text
        );
        if (result.success) {
          addMessage("system", `✓ Entered text: ${result.message}`);
          return true;
        } else {
          addMessage("system", `❌ Text entry failed: ${result.error}`);
          return false;
        }
      } else if (
        actionData.action === "scrollY" &&
        actionData.amount !== undefined
      ) {
        const result = await scrollInTab(
          currentTabId,
          "scrollY",
          actionData.amount
        );
        if (result.success) {
          addMessage("system", `✓ Scrolled vertically: ${result.message}`);
          return true;
        } else {
          addMessage("system", `❌ Scroll failed: ${result.error}`);
          return false;
        }
      } else if (
        actionData.action === "scrollX" &&
        actionData.amount !== undefined
      ) {
        const result = await scrollInTab(
          currentTabId,
          "scrollX",
          actionData.amount
        );
        if (result.success) {
          addMessage("system", `✓ Scrolled horizontally: ${result.message}`);
          return true;
        } else {
          addMessage("system", `❌ Scroll failed: ${result.error}`);
          return false;
        }
      } else if (
        actionData.action === "pressEnter" &&
        actionData.elementIndex !== undefined
      ) {
        const result = await pressEnterInTab(
          currentTabId,
          actionData.elementIndex
        );
        if (result.success) {
          addMessage("system", `✓ Pressed Enter: ${result.message}`);
          return true;
        } else {
          addMessage("system", `❌ Press Enter failed: ${result.error}`);
          return false;
        }
      } else if (actionData.action === "openTab" && actionData.url) {
        const tabResult = await openNewTab(actionData.url);
        if (tabResult.success) {
          addMessage("system", `✓ Opened new tab: ${tabResult.message}`);
          currentTabId = tabResult.tabId;
          return true;
        } else {
          addMessage("system", `❌ Failed to open tab: ${tabResult.error}`);
          return false;
        }
      } else if (actionData.action === "switchTab" && actionData.tabId) {
        const switchResult = await switchToTab(actionData.tabId);
        if (switchResult.success) {
          addMessage("system", `✓ Switched to tab: ${switchResult.message}`);
          currentTabId = actionData.tabId;
          await getCurrentTabInfo();
          return true;
        } else {
          addMessage(
            "system",
            `❌ Failed to switch tab: ${switchResult.error}`
          );
          return false;
        }
      } else if (actionData.action === "getTabList") {
        const tabs = await getTabList();
        if (tabs.success) {
          addMessage(
            "system",
            `✓ Retrieved tab list:\n${tabs.tabList
              .map((tab) => `${tab.id}: ${tab.title} (${tab.url})`)
              .join("\n")}`
          );
          return true;
        } else {
          addMessage("system", `❌ Failed to get tab list: ${tabs.error}`);
          return false;
        }
      } else {
        addMessage(
          "system",
          `❌ Invalid action: ${JSON.stringify(actionData)}`
        );
        return false;
      }
    } catch (error) {
      addMessage("system", `❌ Action execution error: ${error.message}`);
      return false;
    }
  }

  async function performVerification(
    actionExecuted,
    currentTabId,
    modelSelector
  ) {
    try {
      // No delay for DOM updates

      // Get fresh elements after the action
      const elementsData = await getElementsFromTab(currentTabId);

      if (!elementsData || !elementsData.data || !elementsData.data.elements) {
        return {
          success: false,
          error: "Could not extract elements for verification",
        };
      }

      const verificationPrompt = `VERIFICATION STEP: You just executed: ${JSON.stringify(
        actionExecuted
      )}. 

      IMPORTANT: Look ONLY at the current DOM elements to verify if the action worked. Ignore any previous expectations or assumptions.
      
      For CLICK actions, check if:
      - New elements appeared (modals, pages, forms, buttons, content)
      - Page navigation occurred (URL changed, new page loaded)
      - UI state changed (buttons enabled/disabled, content updated)
      - Error messages appeared
      
      For TEXT ENTRY actions, check if:
      - The text actually appears in the target input field
      - Form validation messages appeared
      - Auto-complete or suggestions showed up
      
      For SCROLL actions, check if:
      - New content became visible
      - Page position changed as expected
      - Loading indicators appeared for dynamic content
      
      For PRESS ENTER actions, check if:
      - Form was submitted or search was executed
      - New page loaded or content appeared
      - Navigation occurred
      
      Based on what you can observe in the current DOM, respond with:
      - {"action": "verified", "message": "Action successful because..."} if it worked
      - {"action": "retry", "message": "Action failed because..."} if it failed
      - {"action": "complete", "message": "Action complete, stop now"} if the goal is fully achieved and no further actions needed
      
      Use "complete" when the specific goal has been accomplished and the agent should stop working on this task.
      Use "verified" when the action worked but more steps are needed to complete the overall goal.
      
      DO NOT assume success - only verify based on actual observable changes in the DOM.`;

      addMessage("system", "🔍 Verifying the action result...");

      const selectedModel = modelSelector.value;
      let response;
      try {
        response = await callGroqAPI(
          verificationPrompt,
          elementsData.data.elements,
          [], // No conversation history for verification to avoid bias
          selectedModel
        );
      } catch (error) {
        return {
          success: false,
          error: `Verification API Error: ${error.message}`,
        };
      }

      let verificationResponse;
      try {
        verificationResponse = JSON.parse(response);
      } catch (parseError) {
        return {
          success: false,
          error: `Could not parse verification response: ${response}`,
        };
      }

      if (!verificationResponse.message) {
        return {
          success: false,
          error: "Verification response missing required message field",
        };
      }

      const displayMessage = Array.isArray(verificationResponse.message)
        ? verificationResponse.message.join("\n")
        : verificationResponse.message;

      addMessage("assistant", displayMessage);

      if (verificationResponse.action === "verified") {
        addMessage(
          "system",
          `✅ Verification successful: ${verificationResponse.message}`
        );
        return {
          success: true,
          verified: true,
          message: verificationResponse.message,
        };
      } else if (verificationResponse.action === "complete") {
        addMessage(
          "system",
          `🎉 Task completed: ${verificationResponse.message}`
        );
        return {
          success: true,
          verified: true,
          completed: true,
          message: verificationResponse.message,
        };
      } else if (verificationResponse.action === "retry") {
        addMessage(
          "system",
          `⚠️ Action needs retry: ${verificationResponse.message}`
        );
        return {
          success: true,
          verified: false,
          message: verificationResponse.message,
        };
      } else {
        return {
          success: false,
          error:
            "Invalid verification response. Expected 'verified', 'complete', or 'retry' action.",
        };
      }
    } catch (error) {
      return { success: false, error: `Verification error: ${error.message}` };
    }
  }

  // OLD COMPLEX SYSTEM - COMMENTED OUT
  /*
  async function runAutonomousAgent(initialMessage) {
    addMessage("system", `🤖 Starting autonomous agent for: "${initialMessage}"`);

    // Step 1: Break down the initial message into individual tasks
    addMessage("system", "🔍 Breaking down the request into individual tasks...");
    const tasks = await breakDownIntoTasks(initialMessage);
    
    if (!tasks || tasks.length === 0) {
      addMessage("system", "❌ Could not break down the request into tasks");
      return;
    }

    addMessage("system", `📋 Found ${tasks.length} tasks to execute:`);
    tasks.forEach((task, index) => {
      addMessage("system", `   ${index + 1}. ${task}`);
    });

    // Step 2: Execute each task sequentially
    for (let i = 0; i < tasks.length; i++) {
      const currentTask = tasks[i];
      const taskNumber = i + 1;
      
      addMessage("system", `\n🎯 Starting Task ${taskNumber}/${tasks.length}: "${currentTask}"`);
      
      const taskCompleted = await executeIndividualTask(currentTask, taskNumber);
      
      if (taskCompleted) {
        addMessage("system", `✅ Task ${taskNumber} completed successfully`);
      } else {
        addMessage("system", `⚠️ Task ${taskNumber} could not be completed, moving to next task`);
      }
      
      // No delay between tasks
    }

    addMessage("system", "🎉 All tasks have been processed!");
  }

  async function breakDownIntoTasks(initialMessage) {
    const taskBreakdownPrompt = `Break down this user request into individual, sequential tasks using VERY SPECIFIC action-oriented language.

User request: "${initialMessage}"

CRITICAL REQUIREMENTS:
1. Use SPECIFIC action verbs that match available actions: "click", "enter text", "press enter", "scroll", "open new tab", "switch to tab"
2. Include exact URLs when opening new websites
3. Specify exact text to enter in fields
4. Be granular - one clear action per task
5. Use precise language that directly translates to executable actions

Available actions you can specify:
- "click on [specific element description]"  
- "enter text '[exact text]' in [field description]"
- "press enter in [field description]" 
- "scroll down to see more content"
- "open new tab with URL [exact URL]"
- "switch to tab containing [domain/title]"
- "get list of open tabs"

Respond with JSON: {"tasks": ["task 1", "task 2", "task 3", ...]}

Examples:
Input: "create a calendar event for lunch tomorrow at 12pm"
Output: {"tasks": ["open new tab with URL https://calendar.google.com", "click on create new event button", "enter text 'Lunch' in event title field", "click on date picker", "select tomorrow's date", "click on time field", "enter text '12:00 PM' in time field", "click save event button"]}

Input: "search for restaurants on Google"
Output: {"tasks": ["open new tab with URL https://google.com", "click on search box", "enter text 'restaurants near me' in search box", "press enter in search box"]}

Input: "send an email to john@example.com saying hello"  
Output: {"tasks": ["open new tab with URL https://gmail.com", "click compose new email button", "enter text 'john@example.com' in recipient field", "click in subject field", "enter text 'Hello' in subject field", "click in message body", "enter text 'Hello!' in message body", "click send button"]}`;

    try {
      const selectedModel = modelSelector.value;
      const response = await callGroqAPI(taskBreakdownPrompt, [], [], selectedModel);
      
      let result;
      try {
        result = JSON.parse(response);
      } catch (parseError) {
        addMessage("system", "❌ Could not parse task breakdown response");
        return null;
      }
      
      return result.tasks || null;
    } catch (error) {
      addMessage("system", `❌ Error breaking down tasks: ${error.message}`);
      return null;
    }
  }
  */

  // SIMPLIFIED EXECUTION SYSTEM - ONLY THIS FUNCTION IS USED NOW
  async function executeNextAction(originalTask, stepCount) {
    const maxSteps = 20;

    if (stepCount > maxSteps) {
      addMessage(
        "system",
        `⚠️ Reached maximum steps (${maxSteps}), stopping execution`
      );
      return;
    }

    try {
      addMessage(
        "system",
        `🔍 Step ${stepCount}: Analyzing current page state...`
      );
      addMessage("system", `📋 Using tab ID: ${currentTabId}`);

      // Get fresh DOM elements and screenshot
      const elementsData = await getElementsFromTab(currentTabId);
      if (!elementsData || !elementsData.data || !elementsData.data.elements) {
        addMessage("system", "❌ Could not extract elements from the page");
        return;
      }

      // Simple context message
      const contextMessage =
        stepCount === 1
          ? `Task: "${originalTask}". Look at the current page and determine what action to take first to accomplish this task.`
          : `Continue with task: "${originalTask}". Step ${stepCount}. Look at the current page state and determine what action to take next.`;

      // Call LLM with current state
      const selectedModel = modelSelector.value;

      // Add current message to conversation history BEFORE API call
      conversationHistory.push({
        role: "user",
        content: contextMessage,
      });

      // Debug: Log conversation history
      console.log("Conversation history before API call:", conversationHistory);
      addMessage(
        "system",
        `📝 Conversation history has ${conversationHistory.length} messages`
      );

      const response = await callGroqAPI(
        contextMessage,
        elementsData.data.elements,
        conversationHistory,
        selectedModel
      );

      let actionData;
      try {
        actionData = JSON.parse(response);
      } catch (parseError) {
        console.log("JSON Parse Error:", parseError);
        console.log("Raw response:", response);

        // Try to extract JSON from response if it's wrapped in text
        let cleanedResponse = response.trim();

        // Remove markdown code blocks if present
        const backtick = "`";
        const codeBlockStart = backtick + backtick + backtick;

        if (cleanedResponse.includes(codeBlockStart + "json")) {
          // Extract content between ```json and ```
          const startPattern = codeBlockStart + "json";
          const endPattern = codeBlockStart;

          const startIndex = cleanedResponse.indexOf(startPattern);
          if (startIndex !== -1) {
            const contentStart = startIndex + startPattern.length;
            const endIndex = cleanedResponse.indexOf(endPattern, contentStart);

            if (endIndex !== -1) {
              cleanedResponse = cleanedResponse
                .substring(contentStart, endIndex)
                .trim();
            } else {
              // Fallback: just remove the starting marker
              cleanedResponse = cleanedResponse.substring(contentStart).trim();
            }
          }
        } else if (cleanedResponse.includes(codeBlockStart)) {
          // Extract content between ``` blocks
          const firstStart = cleanedResponse.indexOf(codeBlockStart);
          if (firstStart !== -1) {
            const contentStart = cleanedResponse.indexOf("\n", firstStart) + 1;
            const endIndex = cleanedResponse.indexOf(
              codeBlockStart,
              contentStart
            );

            if (endIndex !== -1 && contentStart > 0) {
              cleanedResponse = cleanedResponse
                .substring(contentStart, endIndex)
                .trim();
            } else {
              // Fallback: remove first code block marker and everything after last one
              cleanedResponse = cleanedResponse
                .substring(contentStart || firstStart + 3)
                .trim();
            }
          }
        }

        cleanedResponse = cleanedResponse.trim();
        console.log("Cleaned response:", cleanedResponse);

        // Try to parse the cleaned response
        try {
          actionData = JSON.parse(cleanedResponse);
          addMessage("system", "✅ Recovered JSON from wrapped response");
        } catch (secondError) {
          // Try to find JSON object in the text as last resort
          const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              actionData = JSON.parse(jsonMatch[0]);
              addMessage("system", "✅ Extracted JSON object from text");
            } catch (thirdError) {
              addMessage(
                "system",
                `❌ Invalid JSON even after cleanup: ${cleanedResponse.substring(
                  0,
                  200
                )}...`
              );
              addMessage("system", `Parse error: ${secondError.message}`);
              return;
            }
          } else {
            addMessage(
              "system",
              `❌ No JSON found in response: ${response.substring(0, 200)}...`
            );
            addMessage("system", `Parse error: ${parseError.message}`);
            return;
          }
        }
      }

      // Add assistant response to conversation history AFTER getting response
      conversationHistory.push({
        role: "assistant",
        content: response,
      });

      // Display what the agent decided to do
      addMessage("assistant", actionData.message || "Taking action...");

      // Check if task is complete
      if (actionData.action === "none") {
        addMessage("system", `✅ Task completed: ${actionData.message}`);
        return;
      }

      // Execute the action
      const actionSuccess = await executeAction(actionData, currentTabId, elementsData.data.elements);

      if (actionSuccess) {
        addMessage("system", "✅ Action completed successfully");

        // Minimal wait for DOM updates (only for click/input actions that change the page)
        if (
          actionData.action === "click" ||
          actionData.action === "enterText" ||
          actionData.action === "pressEnter"
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } else {
        addMessage("system", "❌ Action failed, but continuing...");
      }

      // Recursively call for next action - this is key!
      await executeNextAction(originalTask, stepCount + 1);
    } catch (error) {
      console.error("Step execution failed:", error);
      addMessage("system", `❌ Step ${stepCount} error: ${error.message}`);
    }
  }

  // OLD COMPLEX FUNCTIONS - COMMENTED OUT
  /*
  async function executeIndividualTask(taskMessage, taskNumber) {
    let stepCount = 0;
    const maxSteps = 8; // Reduced steps per individual task to prevent loops
    
    // Track conversation for this individual task
    const taskConversationHistory = [];

    // Replace while loop with single recursive call
    return await executeTaskStepRecursively(taskMessage, taskNumber, 1, 15, []);
  }

  async function executeTaskStepRecursively(taskMessage, taskNumber, stepCount, maxSteps, taskConversationHistory) {
    if (stepCount > maxSteps) {
      addMessage("system", `   ⚠️ Task ${taskNumber} reached maximum steps (${maxSteps}), considering incomplete`);
      return false;
    }

    try {
      addMessage("system", `   Step ${stepCount}/${maxSteps}: Getting page state and determining next action...`);
        
        // Get fresh DOM elements
        const elementsData = await getElementsFromTab(currentTabId);
        if (!elementsData || !elementsData.data || !elementsData.data.elements) {
          addMessage("system", "   ❌ Could not extract elements from the page, trying again...");
          return await executeTaskStepRecursively(taskMessage, taskNumber, stepCount + 1, maxSteps, taskConversationHistory);
        }

        // Clean user message for context
        const userContextMessage = `Task ${taskNumber}: "${taskMessage}". Step ${stepCount}. What action should I take next?`;
        
        // Full prompt for the API call
        const fullPrompt = `Task: "${taskMessage}". Step ${stepCount} of ${maxSteps}.

Look at the current page state and determine what action to take next to accomplish this specific task.

STEP LIMIT WARNING: You are on step ${stepCount} of ${maxSteps} maximum steps. If you're approaching the limit, prioritize completion over perfection.

CRITICAL TASK COMPLETION RULES:
Use "action": "none" when:
- The specific task appears to be completed
- You've made reasonable attempts and no further obvious actions are available  
- You're on step ${stepCount >= maxSteps - 1 ? maxSteps - 1 : stepCount} or higher (approaching the limit)

Task completion criteria:
1. The expected outcome is visible in the page OR reasonable attempts have been made
2. Forms have been submitted OR text has been entered as requested  
3. Navigation has occurred OR the requested action has been attempted
4. If you've tried multiple approaches and nothing seems to work, it's okay to complete the task

IMPORTANT: Don't get stuck in infinite loops. After 3-5 reasonable attempts, consider the task done.

SEARCH QUERY SUBMISSION RULE:
ALWAYS use "pressEnter" action after entering text into search boxes or input fields to submit the search. Never rely on clicking search buttons - always use the Enter key.

If no clear next action is available, use "action": "none" to complete the task.

Otherwise, choose the most appropriate action to continue progress on this task.

Respond with JSON using one of these formats:

Click: {"action": "click", "elementIndex": 123, "message": "explanation"}
Enter text: {"action": "enterText", "elementIndex": 123, "text": "text to enter", "message": "explanation"}  
Press Enter: {"action": "pressEnter", "elementIndex": 123, "message": "explanation"}
Scroll: {"action": "scrollY", "amount": 300, "message": "explanation"}
Open tab: {"action": "openTab", "url": "https://example.com", "message": "explanation"}
Switch tab: {"action": "switchTab", "tabId": 123, "message": "explanation"}
Get tabs: {"action": "getTabList", "message": "explanation"}
Task complete (ONLY if 100% certain): {"action": "none", "message": "task completed successfully - [describe what you can see that proves completion]"}`;

        addMessage("user", userContextMessage);
        
        // Add user message to task conversation history
        taskConversationHistory.push({ role: "user", content: userContextMessage });

        // Get model response with task conversation history and screenshot
        const selectedModel = modelSelector.value;
        const response = await callGroqAPI(
          fullPrompt,
          elementsData.data.elements,
          taskConversationHistory, // Include task conversation history
          selectedModel
        );

        let jsonResponse;
        try {
          jsonResponse = JSON.parse(response);
        } catch (parseError) {
          addMessage("system", `   ❌ Invalid JSON response, retrying...`);
          return await executeTaskStepRecursively(taskMessage, taskNumber, stepCount + 1, maxSteps, taskConversationHistory);
        }

        // Add assistant response to task conversation history
        taskConversationHistory.push({ role: "assistant", content: response });
        addMessage("assistant", jsonResponse.message || "Taking action...");

        // Check if task is complete
        if (jsonResponse.action === "none") {
          addMessage("system", `   🎉 Task completed: ${jsonResponse.message}`);
          return true;
        }

        // Execute the action
        const actionSuccess = await executeAction(jsonResponse, currentTabId);
        
        if (actionSuccess) {
          addMessage("system", "   ✅ Action completed successfully");
          // Wait for page updates
          const delay = getActionDelay(jsonResponse.action);
          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } else {
          addMessage("system", "   ❌ Action failed, trying alternative approach");
        }
        
        // Recursively continue to next step regardless of action success/failure
        return await executeTaskStepRecursively(taskMessage, taskNumber, stepCount + 1, maxSteps, taskConversationHistory);

      } catch (error) {
        console.error("Recursive task step failed:", error);
        addMessage("system", `   ❌ Step ${stepCount} error: ${error.message}`);
        
        // Try one more time with next step
        if (stepCount < maxSteps) {
          return await executeTaskStepRecursively(taskMessage, taskNumber, stepCount + 1, maxSteps, taskConversationHistory);
        }
        
        return false;
      }
  }

  // OLD FUNCTION - REPLACED WITH RECURSIVE VERSION ABOVE
  /*
  async function executeActionStep(
    taskMessage,
    stepCount,
    maxSteps,
    lastActionResult = null
  ) {
    if (stepCount >= maxSteps) {
      addMessage(
        "system",
        `⚠️ Agent reached maximum steps (${maxSteps}), stopping for safety`
      );
      return;
    }

    stepCount++;

    try {
      // ALWAYS get fresh DOM before any action
      addMessage("system", "🔄 Getting fresh page state for action...");
      const elementsData = await getElementsFromTab(currentTabId);

      if (!elementsData || !elementsData.data || !elementsData.data.elements) {
        addMessage("system", "❌ Could not extract elements from the page");
        return;
      }

      // Build context message for action step
      let contextMessage;
      if (stepCount === 1) {
        contextMessage = `Task: ${taskMessage}. Analyze the current page state and determine what to do first.`;
      } else if (
        lastActionResult &&
        lastActionResult !== "retry" &&
        typeof lastActionResult === "string"
      ) {
        // This is guidance from verification about what to do next
        contextMessage = `Task: ${taskMessage}. Based on verification, the next step should be: ${lastActionResult}. Analyze the current page state and determine the appropriate action to accomplish this.`;
      } else if (lastActionResult === "retry") {
        contextMessage = `Task: ${taskMessage}. The previous action verification failed. Analyze the current page state and try a different approach.`;
      } else {
        contextMessage = `Continue with task: ${taskMessage}. You have completed ${Math.floor(
          (stepCount - 1) / 2
        )} verified actions. Analyze the current page state and determine what to do next.`;
      }

      addMessage("user", contextMessage);
      conversationHistory.push({ role: "user", content: contextMessage });

      const selectedModel = modelSelector.value;
      const response = await callGroqAPI(
        contextMessage,
        elementsData.data.elements,
        conversationHistory,
        selectedModel
      );

      let jsonResponse;
      try {
        jsonResponse = JSON.parse(response);
      } catch (parseError) {
        addMessage(
          "system",
          `❌ Invalid JSON response: ${response.substring(0, 200)}...`
        );
        return;
      }

      conversationHistory.push({ role: "assistant", content: response });
      addMessage("assistant", jsonResponse.message || "No message provided");

      // Handle the action
      if (jsonResponse.action === "none") {
        addMessage("system", `🎯 Task completed: ${jsonResponse.message}`);
        return;
      }

      // Execute the action
      const actionSuccess = await executeAction(jsonResponse, currentTabId);
      if (!actionSuccess) {
        addMessage(
          "system",
          "❌ Action execution failed, trying different approach"
        );
        // Retry with same step count (don't increment)
        await executeActionStep(taskMessage, stepCount - 1, maxSteps, "retry");
        return;
      }

      // No delay for page updates

      // Now call verification step
      await executeVerificationStep(
        taskMessage,
        stepCount,
        maxSteps,
        jsonResponse
      );
    } catch (error) {
      console.error("Action step failed:", error);
      addMessage("system", `❌ Agent error: ${error.message}`);
      return;
    }
  }
  */

  // OLD FUNCTION - ALSO COMMENTING OUT VERIFICATION STEP
  /*
  async function executeVerificationStep(
    taskMessage,
    stepCount,
    maxSteps,
    lastAction
  ) {
    try {
      // ALWAYS get fresh DOM before verification
      addMessage("system", "🔄 Getting fresh page state for verification...");
      const elementsData = await getElementsFromTab(currentTabId);

      if (!elementsData || !elementsData.data || !elementsData.data.elements) {
        addMessage("system", "❌ Could not extract elements for verification");
        return;
      }

      // Build verification context message
      const contextMessage = `THIS IS A VERIFICATION STEP - DO NOT SUGGEST NEW ACTIONS TO EXECUTE.

You just executed: ${JSON.stringify(lastAction)}

Your job is to VERIFY if that action worked by looking at the current DOM elements.

VERIFICATION ONLY - RESPOND WITH ONE OF THESE TWO FORMATS:

If the previous action succeeded and more steps needed:
{"action": "verified", "result": "action succeeded, now do [describe next step]"}

If the previous action succeeded and goal is complete:
{"action": "complete", "result": "action complete, stop now"}

If the previous action failed:
{"action": "retry", "result": "the [action] did not occur, retry"}

EXAMPLES:
Continue: {"action": "verified", "result": "action succeeded, now do click the create new event button"}
Complete: {"action": "complete", "result": "action complete, stop now"}
Failure: {"action": "retry", "result": "the navigation did not occur, retry"}

DO NOT use "click", "enterText", "elementIndex" - this is verification only.`;

      conversationHistory.push({ role: "user", content: contextMessage });

      const selectedModel = modelSelector.value;
      const response = await callGroqAPI(
        contextMessage,
        elementsData.data.elements,
        conversationHistory,
        selectedModel
      );

      let jsonResponse;
      try {
        // Check if response looks like truncated JSON
        if (response.includes('{"action"') && !response.trim().endsWith("}")) {
          addMessage(
            "system",
            `⚠️ JSON response appears truncated: ${response}`
          );
          addMessage(
            "system",
            `🔄 Retrying verification with shorter prompt...`
          );

          // Retry with a much shorter, focused verification prompt
          const shortPrompt = `Verify if the last action worked. Respond with valid JSON only:
          
If successful and more steps needed: {"action":"verified","result":"action succeeded, now do [next step]"}
If successful and goal complete: {"action":"complete","result":"action complete, stop now"}
If failed: {"action":"retry","result":"the [action] did not occur, retry"}`;

          const retryResponse = await callGroqAPI(
            shortPrompt,
            elementsData.data.elements,
            [], // No conversation history to keep it short
            selectedModel
          );

          jsonResponse = JSON.parse(retryResponse);
        } else {
          jsonResponse = JSON.parse(response);
        }
      } catch (parseError) {
        addMessage(
          "system",
          `❌ Invalid verification JSON response. Expected valid JSON but got: ${response.substring(
            0,
            300
          )}...`
        );
        addMessage("system", `Parse error: ${parseError.message}`);
        addMessage("system", `🔄 Attempting fallback verification...`);

        // Fallback: assume retry and continue with a generic message
        jsonResponse = {
          action: "retry",
          result: "the verification did not occur, retry",
        };
      }

      // Check if model returned action format instead of verification format
      if (
        jsonResponse.elementIndex !== undefined ||
        jsonResponse.text !== undefined ||
        (jsonResponse.action &&
          !["verified", "retry", "complete"].includes(jsonResponse.action))
      ) {
        addMessage(
          "system",
          `❌ Model returned action format instead of verification format: ${JSON.stringify(
            jsonResponse
          )}`
        );
        addMessage(
          "system",
          `🔄 This is a verification step, not an action step. Assuming retry...`
        );

        // Convert to proper verification format
        jsonResponse = {
          action: "retry",
          result: "the verification did not occur, retry",
        };
      }

      // Validate the JSON structure
      if (!jsonResponse.action || !jsonResponse.result) {
        addMessage(
          "system",
          `❌ Invalid verification JSON structure. Missing required fields: ${JSON.stringify(
            jsonResponse
          )}`
        );
        return;
      }

      if (
        jsonResponse.action !== "verified" &&
        jsonResponse.action !== "retry" &&
        jsonResponse.action !== "complete"
      ) {
        addMessage(
          "system",
          `❌ Invalid verification action: "${jsonResponse.action}". Must be "verified", "complete", or "retry"`
        );
        return;
      }

      conversationHistory.push({ role: "assistant", content: response });
      addMessage(
        "assistant",
        jsonResponse.result || "No verification result provided"
      );

      // Handle verification result
      if (jsonResponse.action === "verified") {
        addMessage("system", `✅ Verification passed`);
        addMessage("system", `📋 Verification result: ${jsonResponse.result}`);

        // Continue to next action step with guidance from verification
        if (jsonResponse.result) {
          if (
            jsonResponse.result.toLowerCase().includes("task completed") ||
            jsonResponse.result.toLowerCase().includes("no further action")
          ) {
            addMessage("system", `🎯 Task completed: ${jsonResponse.result}`);
          } else {
            // Call next action step with guidance message
            await executeActionStep(
              taskMessage,
              stepCount,
              maxSteps,
              jsonResponse.result
            );
          }
        } else {
          addMessage("system", `🎯 Task completed: No further actions needed`);
        }
      } else if (jsonResponse.action === "complete") {
        addMessage("system", `🎉 Task completed`);
        addMessage("system", `📋 Final result: ${jsonResponse.result}`);
        addMessage("system", `🎯 Agent stopping - goal achieved`);
        return; // Stop the agent completely
      } else if (jsonResponse.action === "retry") {
        addMessage("system", `⚠️ Verification failed`);

        // Try with suggested retry approach
        if (jsonResponse.result) {
          await executeActionStep(
            taskMessage,
            stepCount - 1,
            maxSteps,
            jsonResponse.result
          );
        } else {
          addMessage("system", "❌ No retry approach suggested, stopping");
        }
      } else {
        addMessage("system", "❌ Invalid verification response");
      }
    } catch (error) {
      console.error("Verification step failed:", error);
      addMessage("system", `❌ Verification error: ${error.message}`);
    }
  }
  */

  async function getElementsFromTab(tabId, retryCount = 0) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        { action: "extractElements" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error getting elements:", chrome.runtime.lastError);

            // If first attempt failed, wait and retry once
            if (retryCount === 0) {
              console.log("Content script not found, retrying in 3 seconds...");
              addMessage(
                "system",
                "⏳ Content script not loaded, retrying in 3 seconds..."
              );

              setTimeout(async () => {
                const retryResult = await getElementsFromTab(tabId, 1);
                resolve(retryResult);
              }, 3000);
            } else {
              console.error("Retry also failed");
              addMessage(
                "system",
                "❌ Could not connect to page content after retry. Please reload the page."
              );
              resolve(null);
            }
          } else {
            // Check if we got valid elements
            if (
              response &&
              response.data &&
              response.data.elements &&
              response.data.elements.length > 0
            ) {
              if (retryCount > 0) {
                addMessage(
                  "system",
                  `✅ Successfully found ${response.data.elements.length} elements on retry!`
                );
              }
              resolve(response);
            } else if (!response || !response.data || !response.data.elements) {
              // Got invalid response, retry once if haven't already
              if (retryCount === 0) {
                console.log("Got invalid response, retrying in 2 seconds...");
                addMessage(
                  "system",
                  "⏳ Page might still be loading, retrying in 2 seconds..."
                );

                setTimeout(async () => {
                  const retryResult = await getElementsFromTab(tabId, 1);
                  resolve(retryResult);
                }, 2000);
              } else {
                console.log("No valid elements found after retry");
                addMessage(
                  "system",
                  "⚠️ No interactive elements found on this page"
                );
                resolve(response); // Return whatever we got
              }
            } else {
              // Got valid response with 0 elements
              resolve(response);
            }
          }
        }
      );
    });
  }

  async function executeClickInTab(tabId, elementIndex, originalElements) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          action: "executeClickByIndex",
          elementIndex: elementIndex,
          originalElements: originalElements,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
            });
          } else {
            resolve(response || { success: false, error: "No response" });
          }
        }
      );
    });
  }

  async function enterTextInTab(tabId, elementIndex, text) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          action: "enterText",
          elementIndex: elementIndex,
          text: text,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
            });
          } else {
            resolve(response || { success: false, error: "No response" });
          }
        }
      );
    });
  }

  async function scrollInTab(tabId, action, amount) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          action: action,
          amount: amount,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
            });
          } else {
            resolve(response || { success: false, error: "No response" });
          }
        }
      );
    });
  }

  async function pressEnterInTab(tabId, elementIndex) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          action: "pressEnter",
          elementIndex: elementIndex,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
            });
          } else {
            resolve(response || { success: false, error: "No response" });
          }
        }
      );
    });
  }

  async function openNewTab(url) {
    try {
      const tab = await chrome.tabs.create({ url: url, active: true });
      return {
        success: true,
        message: `Opened tab with URL: ${url}`,
        tabId: tab.id,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to open tab: ${error.message}`,
      };
    }
  }

  async function getTabList() {
    try {
      const tabs = await chrome.tabs.query({});
      const tabInfo = tabs.map((tab, index) => {
        // Extract domain from URL for clearer identification
        let domain = "unknown";
        try {
          domain = new URL(tab.url).hostname;
        } catch (e) {
          domain = tab.url || "unknown";
        }

        return {
          id: tab.id,
          url: tab.url,
          title: tab.title,
          domain: domain,
          active: tab.active,
          index: tab.index,
          description: `${domain} - ${tab.title}`,
        };
      });

      // Sort tabs by index to maintain consistent order
      tabInfo.sort((a, b) => a.index - b.index);

      return {
        success: true,
        message: `Found ${tabs.length} tabs`,
        tabs: tabInfo,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get tab list: ${error.message}`,
      };
    }
  }

  async function switchToTab(tabId) {
    try {
      await chrome.tabs.update(tabId, { active: true });
      const tab = await chrome.tabs.get(tabId);
      return {
        success: true,
        message: `Switched to tab: ${tab.title || tab.url}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to switch to tab: ${error.message}`,
      };
    }
  }

  async function captureScreenshot() {
    return new Promise((resolve) => {
      addMessage("system", "📸 Capturing screenshot...");

      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        addMessage(
          "system",
          "⏱️ Screenshot capture timed out, continuing without screenshot"
        );
        resolve(null);
      }, 5000); // 5 second timeout

      chrome.runtime.sendMessage(
        { action: "captureScreenshot" },
        (response) => {
          clearTimeout(timeout);

          if (chrome.runtime.lastError) {
            console.error(
              "Error capturing screenshot:",
              chrome.runtime.lastError
            );
            addMessage(
              "system",
              "❌ Screenshot capture failed: " +
                chrome.runtime.lastError.message
            );
            addMessage("system", "🔄 Continuing without screenshot...");
            resolve(null);
          } else if (response && response.success) {
            addMessage("system", "✅ Screenshot captured successfully");
            resolve(response.screenshot);
          } else {
            const errorMsg = response ? response.error : "No response received";
            console.error("Screenshot capture failed:", errorMsg);
            addMessage("system", "❌ Screenshot capture failed: " + errorMsg);
            addMessage("system", "🔄 Continuing without screenshot...");
            resolve(null);
          }
        }
      );
    });
  }

  async function callOpenAIAPIWithRetry(
    message,
    elements,
    conversationHistory,
    model
  ) {
    try {
      // Background script handles screenshot capture automatically
      return await callOpenAIAPISingle(
        message,
        elements,
        conversationHistory,
        model
      );
    } catch (error) {
      // Check if it's a 500 error that should be retried
      const is500Error =
        error.message.includes("500") ||
        error.message.includes("Internal Server Error") ||
        error.message.includes("internal_server_error");

      if (is500Error) {
        addMessage("system", `🔄 API Error 500. Retrying once...`);
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second

        try {
          // Background script handles screenshot capture automatically
          return await callOpenAIAPISingle(
            message,
            elements,
            conversationHistory,
            model
          );
        } catch (retryError) {
          // If second attempt also fails, give up
          throw retryError;
        }
      }

      // If not a 500 error, throw immediately
      throw error;
    }
  }

  async function callOpenAIAPISingle(
    message,
    elements,
    conversationHistory,
    model
  ) {
    return new Promise((resolve, reject) => {
      // Add timeout to prevent hanging connections
      const timeout = setTimeout(() => {
        reject(new Error("API call timed out after 60 seconds"));
      }, 60000);

      chrome.runtime.sendMessage(
        {
          action: "callClaudeAPI",
          message: message,
          elements: elements,
          conversationHistory: conversationHistory,
          model: model,
          tabId: currentTabId, // Add the current tab ID explicitly
        },
        (response) => {
          clearTimeout(timeout);

          if (chrome.runtime.lastError) {
            console.error("Chrome runtime error:", chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response) {
            console.error("No response received from background script");
            reject(new Error("No response received from background script"));
          } else if (response.success) {
            // Debug: Log response
            console.log("API Response received:", response);

            // Display screenshot status and timings
            if (response.screenshotStatus) {
              console.log("Screenshot status:", response.screenshotStatus);
              let statusMessage = "";
              
              if (response.screenshotStatus === "success") {
                statusMessage = "📸 Screenshot captured successfully";
              } else if (response.screenshotStatus === "failed") {
                statusMessage = "❌ Screenshot capture failed";
              } else if (response.screenshotStatus === "no_tab") {
                statusMessage = "⚠️ No tab available for screenshot";
              } else if (response.screenshotStatus === "tab_not_found") {
                statusMessage = "❌ Tab not found or inaccessible for screenshot";
              } else if (response.screenshotStatus === "restricted_url") {
                statusMessage = "🔒 Screenshot not available (restricted URL)";
              } else {
                statusMessage = `🔧 Screenshot status: ${response.screenshotStatus}`;
              }

              // Add timing information if available
              if (response.timings) {
                const screenshotTime = response.timings.screenshot || 0;
                const apiTime = response.timings.api || 0;
                statusMessage += ` | ⏱️ Screenshot: ${screenshotTime}ms, API: ${apiTime}ms`;
              }
              
              addMessage("system", statusMessage);
            } else {
              console.log("No screenshot status in response");
              let statusMessage = "⚠️ No screenshot status received";
              
              // Add timing information if available without screenshot status
              if (response.timings) {
                const screenshotTime = response.timings.screenshot || 0;
                const apiTime = response.timings.api || 0;
                statusMessage += ` | ⏱️ Screenshot: ${screenshotTime}ms, API: ${apiTime}ms`;
              }
              
              addMessage("system", statusMessage);
            }

            // Display screenshot if available
            if (response.screenshotData) {
              displayScreenshot(response.screenshotData);
            }

            resolve(response.response);
          } else {
            console.error("API call failed:", response.error);
            reject(new Error(response.error || "Unknown API error"));
          }
        }
      );
    });
  }

  // Backward compatibility alias
  async function callGroqAPI(message, elements, conversationHistory, model) {
    return callOpenAIAPIWithRetry(
      message,
      elements,
      conversationHistory,
      model
    );
  }

  function addMessage(sender, content) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${sender}`;

    const headerDiv = document.createElement("div");
    headerDiv.className = "message-header";
    headerDiv.textContent = sender.charAt(0).toUpperCase() + sender.slice(1);

    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";
    contentDiv.textContent = content;

    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Add important system messages to conversation history for LLM feedback
    if (sender === "system" && shouldAddToConversationHistory(content)) {
      conversationHistory.push({
        role: "system",
        content: `FEEDBACK: ${content}`,
      });
    }
  }

  function shouldAddToConversationHistory(systemMessage) {
    // Only add meaningful feedback messages, not debug or status messages
    return (
      systemMessage.includes("✅ Action completed") ||
      systemMessage.includes("❌ Action failed") ||
      systemMessage.includes("✅ Task completed") ||
      systemMessage.includes("Screenshot captured") ||
      systemMessage.includes("Screenshot failed") ||
      systemMessage.includes("Could not extract elements") ||
      systemMessage.includes("Invalid response format")
    );
  }

  function clearChat() {
    chatMessages.innerHTML = `
      <div class="message system">
        <div class="message-header">System</div>
        <div class="message-content">Chat cleared. Ready for new automation tasks.</div>
      </div>
    `;
    conversationHistory = [];
  }

  function setControlsEnabled(enabled) {
    sendBtn.disabled = !enabled;
    chatInput.disabled = !enabled;
    modelSelector.disabled = !enabled;

    if (enabled) {
      sendBtn.textContent = "Send";
      chatInput.focus();
    } else {
      sendBtn.textContent = "Working...";
    }
  }

  function updateStatus(statusText) {
    status.textContent = statusText;
  }

  // Listen for tab changes
  chrome.tabs.onActivated.addListener(getCurrentTabInfo);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url && tabId === currentTabId) {
      getCurrentTabInfo();
    }
  });
})();
