// Chat Assistant Sidebar - Robust implementation for all websites
(function () {
  "use strict";

  // Prevent multiple injections
  if (window.chatAssistantInjected) {
    return;
  }
  window.chatAssistantInjected = true;

  let sidebar = null;
  let isOpen = false;
  let isCollapsed = false;
  let currentElements = null; // Store current elements data for click handling

  // Wait for DOM to be ready
  function waitForDOM(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
    } else {
      callback();
    }
  }

  function createSidebar() {
    console.log('Creating sidebar...');
    // Remove any existing sidebar
    const existingSidebar = document.getElementById("chat-assistant-sidebar");
    if (existingSidebar) {
      existingSidebar.remove();
    }

    sidebar = document.createElement("div");
    sidebar.id = "chat-assistant-sidebar";

    // Set HTML content
    sidebar.innerHTML = `
      <button class="collapse-toggle" id="collapse-toggle">▶</button>
      <div class="chat-assistant-header">
        <h1 class="chat-assistant-title">Claude Chat</h1>
        <div>
          <button class="chat-assistant-close-btn" id="collapse-btn" style="margin-right: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
          <button class="chat-assistant-close-btn" id="chat-assistant-close-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18"/>
              <path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="chat-assistant-content" id="chat-assistant-content">
        <div class="chat-messages" id="chat-messages">
          <!-- Chat messages will appear here -->
        </div>
      </div>
      <div class="chat-assistant-section">
        <div class="chat-assistant-input-container">
          <textarea class="chat-assistant-input" id="chat-assistant-input" placeholder="Ask me anything..."></textarea>
          <button class="chat-assistant-send-btn" id="chat-assistant-send-btn">Send</button>
        </div>
      </div>
    `;

    // Append to body with error handling
    try {
      const targetElement = document.body || document.documentElement;
      targetElement.appendChild(sidebar);
    } catch (error) {
      console.error("Chat Assistant: Failed to append sidebar to DOM:", error);
      return null;
    }

    initSidebarEventListeners();
    return sidebar;
  }

  function initSidebarEventListeners() {
    const closeBtn = document.getElementById("chat-assistant-close-btn");
    const collapseBtn = document.getElementById("collapse-btn");
    const collapseToggle = document.getElementById("collapse-toggle");
    const sendBtn = document.getElementById("chat-assistant-send-btn");
    const input = document.getElementById("chat-assistant-input");
    // Removed refresh button as we're now using Claude chat

    if (closeBtn) {
      closeBtn.addEventListener("click", closeSidebar);
    }

    if (collapseBtn) {
      collapseBtn.addEventListener("click", collapseSidebar);
    }

    if (collapseToggle) {
      collapseToggle.addEventListener("click", expandSidebar);
    }

    if (sendBtn) {
      sendBtn.addEventListener("click", handleChatSend);
    }

    // Removed refresh functionality - now using Claude chat

    if (input) {
      // Handle Enter key in chat input (Shift+Enter for new line)
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleChatSend();
        }
      });

      // Auto-resize chat input
      input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 120) + "px";
      });
    }
  }

  function collapseSidebar() {
    if (sidebar) {
      sidebar.classList.remove("open");
      sidebar.classList.add("collapsed");
      isCollapsed = true;
      // Don't clear bounding boxes when collapsing
    }
  }

  function expandSidebar() {
    if (sidebar) {
      sidebar.classList.remove("collapsed");
      sidebar.classList.add("open");
      isCollapsed = false;
      isOpen = true;
      // Don't refresh elements when expanding - only show existing data
      // Bounding boxes should already be visible if they were shown before
    }
  }

  function showBoundingBoxes() {
    // Directly call the bounding box functions from content.js
    if (window.showBoundingBoxes) {
      window.showBoundingBoxes();
    }
  }

  function clearBoundingBoxes() {
    // Directly call the bounding box functions from content.js
    if (window.clearBoundingBoxes) {
      window.clearBoundingBoxes();
    }
  }

  function showSidebar() {
    waitForDOM(() => {
      if (!sidebar) {
        sidebar = createSidebar();
        if (!sidebar) return;
      }

      sidebar.classList.add("open");
      sidebar.classList.remove("collapsed");
      isOpen = true;
      isCollapsed = false;

      // Focus on input
      setTimeout(() => {
        const input = document.getElementById("chat-assistant-input");
        if (input) {
          try {
            input.focus();
          } catch (error) {
            // Focus may fail in some contexts, ignore
          }
        }
      }, 100);
    });
  }

  function closeSidebar() {
    if (sidebar) {
      sidebar.classList.remove("open");
      sidebar.classList.remove("collapsed");
      isOpen = false;
      isCollapsed = false;

      // Don't clear bounding boxes when sidebar closes - let them persist
      // clearBoundingBoxes();
    }
  }

  function toggleSidebar() {
    console.log('Toggle sidebar called, isOpen:', isOpen);
    if (!isOpen) {
      showSidebar();
    } else {
      closeSidebar();
    }
  }

  async function handleChatSend() {
    const input = document.getElementById("chat-assistant-input");
    const sendBtn = document.getElementById("chat-assistant-send-btn");
    const content = document.getElementById("chat-assistant-content");

    if (!input || !sendBtn || !content) return;

    const message = input.value.trim();
    if (!message) return;

    // Add user message to chat
    addMessageToChat("user", message);

    // Disable input and button
    input.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending...";

    // Clear input
    input.value = "";
    input.style.height = "auto";

    try {
      // Extract elements from the page
      const elementsData = window.extractInteractiveElements ? window.extractInteractiveElements() : { elements: [] };
      
      // Call Claude API with message and elements
      const response = await callClaudeAPI(message, elementsData.elements);
      
      // Check if response is JSON 
      try {
        const jsonResponse = JSON.parse(response);
        if (jsonResponse.action === "click" && jsonResponse.elementIndex !== undefined) {
          // Execute click
          executeClick(jsonResponse.elementIndex, elementsData.elements);
          addMessageToChat("assistant", jsonResponse.message || `Clicked element ${jsonResponse.elementIndex + 1}`);
        } else {
          // Display the message from JSON response
          addMessageToChat("assistant", jsonResponse.message || "Action completed");
        }
      } catch (e) {
        // Fallback if somehow not JSON
        addMessageToChat("assistant", response);
      }
    } catch (error) {
      console.error("Error calling Claude API:", error);
      addMessageToChat(
        "assistant",
        "Sorry, I encountered an error. Please try again."
      );
    } finally {
      // Re-enable input and button
      input.disabled = false;
      sendBtn.disabled = false;
      sendBtn.textContent = "Send";

      // Focus back to input
      try {
        input.focus();
      } catch (error) {
        // Focus may fail, ignore
      }
    }
  }

  async function callClaudeAPI(message, elements = []) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'callClaudeAPI', message: message, elements: elements },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (response.success) {
            resolve(response.response);
          } else {
            reject(new Error(response.error));
          }
        }
      );
    });
  }

  function executeClick(elementIndex, elements) {
    if (elementIndex < 0 || elementIndex >= elements.length) {
      console.error("Invalid element index:", elementIndex);
      return;
    }

    const elementInfo = elements[elementIndex];
    const domElement = elementInfo.domElement;
    
    if (domElement && domElement.click) {
      console.log("Clicking element:", elementInfo.title || elementInfo.tagName);
      domElement.click();
    } else {
      console.error("Element not found or not clickable:", elementInfo);
    }
  }

  function addMessageToChat(sender, message) {
    const chatMessages = document.getElementById("chat-messages");
    if (!chatMessages) return;

    const messageDiv = document.createElement("div");
    messageDiv.className = `chat-message ${sender}`;

    const senderLabel = document.createElement("div");
    senderLabel.className = "chat-message-sender";
    senderLabel.textContent = sender === "user" ? "You" : "Claude";

    const messageContent = document.createElement("div");
    messageContent.className = "chat-message-content";
    messageContent.textContent = message;

    messageDiv.appendChild(senderLabel);
    messageDiv.appendChild(messageContent);
    chatMessages.appendChild(messageDiv);

    // Scroll to bottom
    try {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
      // Scroll may fail, ignore
    }
  }

  // Removed element extraction and display functions - now using Claude chat

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request);
    if (request.action === "toggleSidebar") {
      toggleSidebar();
      sendResponse({ success: true });
    }
    return true;
  });

  // Handle page navigation and dynamic content changes
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      // Page changed, ensure sidebar is still functional
      if (
        isOpen &&
        sidebar &&
        !document.getElementById("chat-assistant-sidebar")
      ) {
        // Sidebar was removed, recreate it
        isOpen = false;
        showSidebar();
      }
    }
  }).observe(document, { subtree: true, childList: true });
})();
