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

  async function runAutonomousAgent(initialMessage) {
    let stepCount = 0;
    const maxSteps = 20;
    let lastActionExecuted = null;
    let isVerificationStep = false;

    addMessage(
      "system",
      `🤖 Starting autonomous agent for task: "${initialMessage}"`
    );

    while (stepCount < maxSteps) {
      stepCount++;

      try {
        // Get fresh elements from the current tab
        const elementsData = await getElementsFromTab(currentTabId);

        if (
          !elementsData ||
          !elementsData.data ||
          !elementsData.data.elements
        ) {
          addMessage("system", "❌ Could not extract elements from the page");
          break;
        }

        // Build context message for this step
        let contextMessage;

        if (isVerificationStep && lastActionExecuted) {
          // This is a verification step
          contextMessage = `VERIFICATION STEP: You just executed: ${JSON.stringify(
            lastActionExecuted
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
          - New content is now visible that wasn't before
          - Page position actually changed
          
          Be HONEST about what you observe in the DOM:
          
          If you see clear evidence the action worked:
          {"action": "verified", "message": "Specific evidence: [describe exactly what changed in the DOM]"}
          
          If you don't see expected changes or the action clearly failed:
          {"action": "retry", "message": "No changes observed: [describe what you expected vs what you see]"}
          
          If the overall task is complete based on what you see:
          {"action": "none", "message": "Task completed: [describe the final state you can see]"}`;
        } else {
          // This is a regular action step
          contextMessage =
            stepCount === 1
              ? initialMessage
              : `Continue with the task: "${initialMessage}". You have already taken ${Math.floor(
                  stepCount / 2
                )} verified steps. Analyze the current page state and determine what to do next.`;
        }

        // Add current user message to conversation history
        conversationHistory.push({
          role: "user",
          content: contextMessage,
        });

        // Get selected model
        const selectedModel = modelSelector.value;

        // Call LLM with current state
        // For verification steps, don't include conversation history to avoid bias
        const historyForThisStep = isVerificationStep
          ? []
          : conversationHistory;
        const response = await callGroqAPI(
          contextMessage,
          elementsData.data.elements,
          historyForThisStep,
          selectedModel
        );

        // Parse response
        let jsonResponse;
        try {
          jsonResponse = JSON.parse(response);
        } catch (parseError) {
          addMessage(
            "system",
            `❌ Invalid JSON response: ${response.substring(0, 200)}...`
          );
          break;
        }

        // Add to conversation history
        conversationHistory.push({
          role: "assistant",
          content: response,
        });

        // Display response
        let displayMessage = `Step ${stepCount}: ${JSON.stringify(
          jsonResponse,
          null,
          2
        )}`;

        if (
          jsonResponse.elementIndex !== undefined &&
          elementsData.data.elements[jsonResponse.elementIndex]
        ) {
          const element = elementsData.data.elements[jsonResponse.elementIndex];
          displayMessage += `\n\nElement Details:\n- Type: ${element.tagName}${
            element.type ? `[${element.type}]` : ""
          }\n- Content: "${element.title}"\n- Element Type: ${
            element.elementType
          }`;
        }

        addMessage("assistant", displayMessage);

        // Check if we should continue
        if (jsonResponse.action === "none") {
          addMessage(
            "system",
            `🎯 Agent completed task: ${jsonResponse.message}`
          );
          break;
        } else if (jsonResponse.action === "verified") {
          // Verification successful, continue to next action
          addMessage(
            "system",
            `✅ Verification successful: ${jsonResponse.message}`
          );
          isVerificationStep = false;
          lastActionExecuted = null;
          addMessage("system", `⏭️ Proceeding to next action...`);
          continue;
        } else if (jsonResponse.action === "retry") {
          // Verification failed, retry the last action or continue with a different approach
          addMessage(
            "system",
            `⚠️ Action needs retry: ${jsonResponse.message}`
          );
          isVerificationStep = false;
          lastActionExecuted = null;
          addMessage("system", `🔄 Trying different approach...`);
          continue;
        } else if (
          jsonResponse.action === "click" &&
          jsonResponse.elementIndex !== undefined
        ) {
          // Execute click in the tab
          const clickResult = await executeClickInTab(
            currentTabId,
            jsonResponse.elementIndex
          );

          if (clickResult.success) {
            addMessage("system", `✓ Clicked element: ${clickResult.message}`);
            // Set up for verification step
            lastActionExecuted = {
              action: "click",
              elementIndex: jsonResponse.elementIndex,
              expectedResult: jsonResponse.message,
            };
            isVerificationStep = true;
          } else {
            addMessage("system", `❌ Click failed: ${clickResult.error}`);
            break;
          }

          // Wait for page updates after click
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Additional delay before verification
          await new Promise((resolve) => setTimeout(resolve, 1000));
          addMessage("system", `🔍 Proceeding to verification step...`);
        } else if (
          jsonResponse.action === "enterText" &&
          jsonResponse.elementIndex !== undefined &&
          jsonResponse.text !== undefined
        ) {
          // Execute text entry
          const textResult = await enterTextInTab(
            currentTabId,
            jsonResponse.elementIndex,
            jsonResponse.text
          );

          if (textResult.success) {
            addMessage("system", `✓ Entered text: ${textResult.message}`);
            // Set up for verification step
            lastActionExecuted = {
              action: "enterText",
              elementIndex: jsonResponse.elementIndex,
              text: jsonResponse.text,
              expectedResult: jsonResponse.message,
            };
            isVerificationStep = true;
          } else {
            addMessage("system", `❌ Text entry failed: ${textResult.error}`);
            break;
          }

          // Wait for page updates after text entry
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Additional delay before verification
          await new Promise((resolve) => setTimeout(resolve, 1000));
          addMessage("system", `🔍 Proceeding to verification step...`);
        } else if (
          jsonResponse.action === "scrollX" &&
          jsonResponse.amount !== undefined
        ) {
          // Execute horizontal scroll
          const scrollResult = await scrollInTab(
            currentTabId,
            "scrollX",
            jsonResponse.amount
          );

          if (scrollResult.success) {
            addMessage(
              "system",
              `✓ Scrolled horizontally: ${scrollResult.message}`
            );
            // Set up for verification step
            lastActionExecuted = {
              action: "scrollX",
              amount: jsonResponse.amount,
              expectedResult: jsonResponse.message,
            };
            isVerificationStep = true;
          } else {
            addMessage("system", `❌ Scroll failed: ${scrollResult.error}`);
            break;
          }

          // Wait for scroll to complete
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Additional delay before verification
          await new Promise((resolve) => setTimeout(resolve, 1000));
          addMessage("system", `🔍 Proceeding to verification step...`);
        } else if (
          jsonResponse.action === "scrollY" &&
          jsonResponse.amount !== undefined
        ) {
          // Execute vertical scroll
          const scrollResult = await scrollInTab(
            currentTabId,
            "scrollY",
            jsonResponse.amount
          );

          if (scrollResult.success) {
            addMessage(
              "system",
              `✓ Scrolled vertically: ${scrollResult.message}`
            );
            // Set up for verification step
            lastActionExecuted = {
              action: "scrollY",
              amount: jsonResponse.amount,
              expectedResult: jsonResponse.message,
            };
            isVerificationStep = true;
          } else {
            addMessage("system", `❌ Scroll failed: ${scrollResult.error}`);
            break;
          }

          // Wait for scroll to complete
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Additional delay before verification
          await new Promise((resolve) => setTimeout(resolve, 1000));
          addMessage("system", `🔍 Proceeding to verification step...`);
        } else if (
          jsonResponse.action === "pressEnter" &&
          jsonResponse.elementIndex !== undefined
        ) {
          // Execute press Enter
          const enterResult = await pressEnterInTab(
            currentTabId,
            jsonResponse.elementIndex
          );

          if (enterResult.success) {
            addMessage("system", `✓ Pressed Enter: ${enterResult.message}`);
            // Set up for verification step
            lastActionExecuted = {
              action: "pressEnter",
              elementIndex: jsonResponse.elementIndex,
              expectedResult: jsonResponse.message,
            };
            isVerificationStep = true;
          } else {
            addMessage("system", `❌ Press Enter failed: ${enterResult.error}`);
            break;
          }

          // Wait for page updates after pressing Enter (form submissions, etc.)
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Additional delay before verification
          await new Promise((resolve) => setTimeout(resolve, 1000));
          addMessage("system", `🔍 Proceeding to verification step...`);
        } else if (
          jsonResponse.action === "openTab" &&
          jsonResponse.url !== undefined
        ) {
          // Open new tab
          const tabResult = await openNewTab(jsonResponse.url);

          if (tabResult.success) {
            addMessage("system", `✓ Opened new tab: ${tabResult.message}`);
            // Update current tab to the new one
            currentTabId = tabResult.tabId;
            // Tab actions are automatically verified since they either succeed or fail
            addMessage("system", `✅ Tab opened successfully, continuing...`);
          } else {
            addMessage("system", `❌ Failed to open tab: ${tabResult.error}`);
            break;
          }

          // Wait for new tab to load
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else if (jsonResponse.action === "getTabList") {
          // Get list of all tabs
          const tabsResult = await getTabList();

          if (tabsResult.success) {
            addMessage("system", `✓ Retrieved tab list: ${tabsResult.message}`);

            // Create a clearer tab list for the agent
            const tabListText = tabsResult.tabs
              .map(
                (tab) =>
                  `Tab ID ${tab.id}: ${tab.domain} - "${tab.title}" (${
                    tab.active ? "ACTIVE" : "inactive"
                  })`
              )
              .join("\n");

            // Add tabs info to conversation history for agent to see
            conversationHistory.push({
              role: "user",
              content: `Available tabs:\n${tabListText}\n\nTo switch to a specific tab, use the exact Tab ID number from this list.`,
            });
          } else {
            addMessage(
              "system",
              `❌ Failed to get tab list: ${tabsResult.error}`
            );
            break;
          }

          addMessage(
            "system",
            `✅ Tab list retrieved successfully, continuing...`
          );
        } else if (
          jsonResponse.action === "switchTab" &&
          jsonResponse.tabId !== undefined
        ) {
          // Switch to specified tab
          const switchResult = await switchToTab(jsonResponse.tabId);

          if (switchResult.success) {
            addMessage("system", `✓ Switched to tab: ${switchResult.message}`);
            // Update current tab reference
            currentTabId = jsonResponse.tabId;
            await getCurrentTabInfo();
            // Tab actions are automatically verified since they either succeed or fail
            addMessage("system", `✅ Tab switched successfully, continuing...`);
          } else {
            addMessage(
              "system",
              `❌ Failed to switch tab: ${switchResult.error}`
            );
            break;
          }

          // Wait for tab switch to complete
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          addMessage("system", `❌ Invalid response from agent, stopping`);
          break;
        }
      } catch (error) {
        console.error("Agent step failed:", error);
        addMessage("system", `❌ Agent error: ${error.message}`);
        break;
      }
    }

    if (stepCount >= maxSteps) {
      addMessage(
        "system",
        `⚠️ Agent reached maximum steps (${maxSteps}), stopping for safety`
      );
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
              addMessage("system", "⏳ Content script not loaded, retrying in 3 seconds...");
              
              setTimeout(async () => {
                const retryResult = await getElementsFromTab(tabId, 1);
                resolve(retryResult);
              }, 3000);
            } else {
              console.error("Retry also failed");
              addMessage("system", "❌ Could not connect to page content after retry. Please reload the page.");
              resolve(null);
            }
          } else {
            // Check if we got valid elements
            if (response && response.data && response.data.elements && response.data.elements.length > 0) {
              if (retryCount > 0) {
                addMessage("system", `✅ Successfully found ${response.data.elements.length} elements on retry!`);
              }
              resolve(response);
            } else if (!response || !response.data || !response.data.elements) {
              // Got invalid response, retry once if haven't already
              if (retryCount === 0) {
                console.log("Got invalid response, retrying in 2 seconds...");
                addMessage("system", "⏳ Page might still be loading, retrying in 2 seconds...");
                
                setTimeout(async () => {
                  const retryResult = await getElementsFromTab(tabId, 1);
                  resolve(retryResult);
                }, 2000);
              } else {
                console.log("No valid elements found after retry");
                addMessage("system", "⚠️ No interactive elements found on this page");
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

  async function callGroqAPI(message, elements, conversationHistory, model) {
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
