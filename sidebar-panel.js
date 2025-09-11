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
      await runAutonomousAgent(message);
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
    switch (action) {
      case "click":
      case "pressEnter":
        return 1000;
      case "enterText":
        return 500;
      case "scrollX":
      case "scrollY":
        return 250;
      default:
        return 500;
    }
  }

  async function executeAction(actionData, currentTabId) {
    try {
      if (
        actionData.action === "click" &&
        actionData.elementIndex !== undefined
      ) {
        const result = await executeClickInTab(
          currentTabId,
          actionData.elementIndex
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
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for tab to load
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
        const tabs = await getAllTabs();
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
      // Wait a bit more for DOM to fully update after the action
      await new Promise((resolve) => setTimeout(resolve, 500));

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
            "Invalid verification response. Expected 'verified' or 'retry' action.",
        };
      }
    } catch (error) {
      return { success: false, error: `Verification error: ${error.message}` };
    }
  }

  async function runAutonomousAgent(initialMessage) {
    let stepCount = 0;
    const maxSteps = 20;

    addMessage(
      "system",
      `🤖 Starting autonomous agent for task: "${initialMessage}"`
    );

    // Start with the first action step
    await executeActionStep(initialMessage, stepCount, maxSteps);
  }

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

      // Wait for page updates
      addMessage("system", "🕰️ Waiting for page updates...");
      await new Promise((resolve) =>
        setTimeout(resolve, getActionDelay(jsonResponse.action))
      );

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

If the previous action succeeded:
{"action": "verified", "result": "action succeeded, now do [describe next step]"}

If the previous action failed:
{"action": "retry", "result": "the [action] did not occur, retry"}

EXAMPLES:
Success: {"action": "verified", "result": "action succeeded, now do click the create new event button"}

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
          
If successful: {"action":"verified","result":"action succeeded, now do [next step]"}
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
          !["verified", "retry"].includes(jsonResponse.action))
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
        jsonResponse.action !== "retry"
      ) {
        addMessage(
          "system",
          `❌ Invalid verification action: "${jsonResponse.action}". Must be "verified" or "retry"`
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

  async function executeClickInTab(tabId, elementIndex) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          action: "executeClickByIndex",
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

  async function callGroqAPIWithRetry(
    message,
    elements,
    conversationHistory,
    model
  ) {
    try {
      // First attempt
      return await callGroqAPISingle(
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
          // Second attempt
          return await callGroqAPISingle(
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

  async function callGroqAPISingle(
    message,
    elements,
    conversationHistory,
    model
  ) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "callClaudeAPI",
          message: message,
          elements: elements,
          conversationHistory: conversationHistory,
          model: model,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response.response);
          } else {
            reject(new Error(response.error));
          }
        }
      );
    });
  }

  // Backward compatibility alias
  async function callGroqAPI(message, elements, conversationHistory, model) {
    return callGroqAPIWithRetry(message, elements, conversationHistory, model);
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
