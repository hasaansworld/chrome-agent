// Sidebar Panel Script for LangChain Web Agent
(function () {
  "use strict";

  let currentTabId = null;
  let isAgentRunning = false;
  let langchainClient = null;

  // DOM elements
  const chatMessages = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-btn");
  const clearBtn = document.getElementById("clear-btn");
  const boundingBoxToggle = document.getElementById("bounding-box-toggle");
  const status = document.getElementById("status");
  const currentUrl = document.getElementById("current-url");

  // Initialize
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    setupEventListeners();
    getCurrentTabInfo();
    updateStatus("Ready");

    // Initialize LangChain client on startup
    initializeLangChainClient();
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
      if (!currentTabId) return;
    }

    if (boundingBoxToggle.checked) {
      chrome.tabs.sendMessage(currentTabId, { action: "showBoundingBoxes" });
    } else {
      chrome.tabs.sendMessage(currentTabId, { action: "clearBoundingBoxes" });
    }
  }

  async function initializeLangChainClient() {
    if (!langchainClient) {
      langchainClient = new window.LangChainClient('http://localhost:3001');

      // Check if server is running
      const healthCheck = await langchainClient.checkHealth();
      if (!healthCheck.success) {
        addMessage("system", "❌ LangChain server not available. Please start the server:");
        addMessage("system", "1. Open terminal in project directory");
        addMessage("system", "2. cd server");
        addMessage("system", "3. node server.js");
        updateStatus("LangChain server offline");
        return false;
      }

      addMessage("system", "✅ Connected to LangChain server");
      updateStatus("LangChain server connected");
      return true;
    }
    return langchainClient.isConnected;
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

    updateStatus("Connecting to LangChain...");

    try {
      // Initialize LangChain client
      const isClientReady = await initializeLangChainClient();
      if (!isClientReady) {
        addMessage("system", "❌ Cannot proceed without LangChain server");
        return;
      }

      updateStatus("Analyzing page...");

      // Get current page elements
      const elementsData = await getElementsFromTab(currentTabId);
      const elements = elementsData?.data?.elements || [];

      addMessage("system", `📋 Found ${elements.length} interactive elements`);

      updateStatus("Planning actions...");

      // Execute task with LangChain server
      const result = await langchainClient.executeTask(message, elements);

      if (result.success && result.actions) {
        addMessage("system", `🎯 LangChain planned ${result.actions.length} actions`);

        // Display agent reasoning
        result.messages.forEach(msg => {
          if (msg.role === 'assistant' && msg.content) {
            addMessage("assistant", msg.content);
          }
        });

        updateStatus("Executing actions...");

        // Execute each action sequentially
        for (let i = 0; i < result.actions.length; i++) {
          const langchainAction = result.actions[i];
          const extensionAction = langchainClient.translateAction(langchainAction);

          addMessage("system", `🔄 Step ${i + 1}/${result.actions.length}: ${extensionAction.message}`);

          const actionResult = await executeExtensionAction(extensionAction);

          if (!actionResult.success) {
            addMessage("system", `❌ Step ${i + 1} failed: ${actionResult.error || 'Unknown error'}`);
            break;
          }

          addMessage("system", `✅ Step ${i + 1} completed`);

          // Wait between actions
          if (i < result.actions.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        addMessage("system", "✅ LangChain agent task completed");

      } else {
        addMessage("system", `❌ LangChain error: ${result.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.error("LangChain agent error:", error);
      addMessage("system", `❌ Error: ${error.message}`);
    } finally {
      setControlsEnabled(true);
      isAgentRunning = false;
      updateStatus("Ready");
    }
  }

  // Execute extension action based on LangChain server response
  async function executeExtensionAction(action) {
    try {
      switch (action.action) {
        case 'click':
          return await new Promise((resolve) => {
            chrome.tabs.sendMessage(currentTabId, {
              action: 'executeClickByIndex',
              elementIndex: action.elementIndex
            }, resolve);
          });

        case 'enterText':
          return await new Promise((resolve) => {
            chrome.tabs.sendMessage(currentTabId, {
              action: 'enterText',
              elementIndex: action.elementIndex,
              text: action.text
            }, resolve);
          });

        case 'scrollY':
          return await new Promise((resolve) => {
            chrome.tabs.sendMessage(currentTabId, {
              action: 'scrollY',
              amount: action.amount
            }, resolve);
          });

        case 'scrollX':
          return await new Promise((resolve) => {
            chrome.tabs.sendMessage(currentTabId, {
              action: 'scrollX',
              amount: action.amount
            }, resolve);
          });

        case 'wait':
          await new Promise(resolve => setTimeout(resolve, action.duration));
          return { success: true, message: `Waited ${action.duration}ms` };

        case 'none':
          return { success: true, message: action.message };

        default:
          return { success: false, error: `Unknown action: ${action.action}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Helper function to get elements from current tab
  async function getElementsFromTab(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'extractElements' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error extracting elements:', chrome.runtime.lastError);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  }

  // UI Helper Functions
  function addMessage(role, content) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${role}`;

    const headerDiv = document.createElement("div");
    headerDiv.className = "message-header";
    headerDiv.textContent = role.charAt(0).toUpperCase() + role.slice(1);

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

    // Initialize LangChain client again
    initializeLangChainClient();
  }

  function updateStatus(statusText) {
    status.textContent = statusText;
  }

  function setControlsEnabled(enabled) {
    sendBtn.disabled = !enabled;
    chatInput.disabled = !enabled;

    if (enabled) {
      sendBtn.textContent = "Send";
      chatInput.placeholder = "Enter your automation task...";
    } else {
      sendBtn.textContent = "Running...";
      chatInput.placeholder = "Agent is working...";
    }
  }

})();