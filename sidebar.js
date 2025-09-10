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
  let conversationHistory = []; // Store conversation history

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
        <div class="model-selector-container">
          <label for="model-selector">Model:</label>
          <select id="model-selector" class="model-selector">
            <option value="meta-llama/llama-4-maverick-17b-128e-instruct">Llama 4 Maverick</option>
            <option value="openai/gpt-oss-120b">GPT-OSS-120B</option>
            <option value="meta-llama/llama-3.3-70b-versatile">Llama 3.3 70B</option>
            <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
          </select>
        </div>
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
      // Extract elements from the page without showing bounding boxes
      const elementsData = window.extractInteractiveElements ? window.extractInteractiveElements() : { elements: [] };
      // const elementsData = window.showBoundingBoxes ? window.showBoundingBoxes() : { elements: [] };
      
      // Add user message to conversation history
      conversationHistory.push({
        role: "user",
        content: message
      });
      
      // Start autonomous agent loop
      await runAutonomousAgent(message, elementsData.elements);
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

  async function callGroqAPI(message, elements = [], conversationHistory = []) {
    // Get selected model
    const modelSelector = document.getElementById('model-selector');
    const selectedModel = modelSelector ? modelSelector.value : 'meta-llama/llama-4-maverick-17b-128e-instruct';
    
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { 
          action: 'callClaudeAPI', 
          message: message, 
          elements: elements,
          conversationHistory: conversationHistory,
          model: selectedModel
        },
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

  async function runAutonomousAgent(initialMessage, initialElements) {
    let currentElements = initialElements;
    let stepCount = 0;
    const maxSteps = 10; // Safety limit
    
    addMessageToChat("system", `🤖 Starting autonomous agent for task: "${initialMessage}"`);
    
    while (stepCount < maxSteps) {
      stepCount++;
      
      try {
        // Get fresh elements for each step
        const elementsData = window.extractInteractiveElements ? window.extractInteractiveElements() : { elements: [] };
        currentElements = elementsData.elements;
        
        // Build context message for this step
        const contextMessage = stepCount === 1 ? 
          initialMessage : 
          `Continue with the task: "${initialMessage}". You have already taken ${stepCount - 1} steps. Analyze the current page state and determine what to do next.`;
        
        // Add current user message to conversation history
        conversationHistory.push({
          role: "user",
          content: contextMessage
        });
        
        // Call LLM with current state and updated context
        const response = await callGroqAPI(contextMessage, currentElements, conversationHistory);
        
        // Parse response
        const jsonResponse = JSON.parse(response);
        
        // Add to conversation history
        conversationHistory.push({
          role: "assistant",
          content: response
        });
        
        // Display response
        let displayMessage = `Step ${stepCount}: ${JSON.stringify(jsonResponse, null, 2)}`;
        
        if (jsonResponse.elementIndex !== undefined && currentElements[jsonResponse.elementIndex]) {
          const element = currentElements[jsonResponse.elementIndex];
          displayMessage += `\n\nElement Details:\n- Type: ${element.tagName}${element.type ? `[${element.type}]` : ''}\n- Content: "${element.title}"\n- Element Type: ${element.elementType}`;
        }
        
        addMessageToChat("assistant", displayMessage);
        
        // Check if we should continue
        if (jsonResponse.action === "none") {
          addMessageToChat("system", `🎯 Agent completed task: ${jsonResponse.message}`);
          break;
        } else if (jsonResponse.action === "click" && jsonResponse.elementIndex !== undefined) {
          // Execute click
          executeClick(jsonResponse.elementIndex, currentElements);
          
          // Wait for page updates after click
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Add a system message about continuing
          addMessageToChat("system", `⏭️ Continuing to next step...`);
        } else {
          addMessageToChat("system", `❌ Invalid response from agent, stopping`);
          break;
        }
        
      } catch (error) {
        console.error("Agent step failed:", error);
        addMessageToChat("system", `❌ Agent error: ${error.message}`);
        break;
      }
    }
    
    if (stepCount >= maxSteps) {
      addMessageToChat("system", `⚠️ Agent reached maximum steps (${maxSteps}), stopping for safety`);
    }
  }

  function executeClick(elementIndex, elements) {
    if (elementIndex < 0 || elementIndex >= elements.length) {
      console.error("Invalid element index:", elementIndex);
      addMessageToChat("system", `ERROR: Invalid element index ${elementIndex}. Available indices: 0-${elements.length - 1}`);
      return;
    }

    const elementInfo = elements[elementIndex];
    const domElement = elementInfo.domElement;
    
    console.log("Attempting to click element:", {
      index: elementIndex,
      title: elementInfo.title,
      tagName: elementInfo.tagName,
      domElement: domElement,
      isConnected: domElement?.isConnected,
      offsetParent: domElement?.offsetParent
    });
    
    if (!domElement) {
      console.error("DOM element not found");
      addMessageToChat("system", "ERROR: DOM element not found");
      return;
    }
    
    if (!domElement.isConnected) {
      console.error("DOM element is no longer in the document");
      addMessageToChat("system", "ERROR: Element is no longer in the document");
      return;
    }
    
    try {
      // Scroll element into view first
      domElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Wait a moment for scroll
      setTimeout(() => {
        try {
          // Try multiple interaction methods
          console.log("Trying method 1: element.click()");
          domElement.click();
          
          // Also try mouse events for stubborn elements
          setTimeout(() => {
            console.log("Trying method 2: mousedown/mouseup");
            ['mousedown', 'mouseup', 'click'].forEach(eventType => {
              const event = new MouseEvent(eventType, {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: domElement.getBoundingClientRect().left + domElement.getBoundingClientRect().width / 2,
                clientY: domElement.getBoundingClientRect().top + domElement.getBoundingClientRect().height / 2
              });
              domElement.dispatchEvent(event);
            });
            
            // For some elements, try focus + Enter
            if (domElement.tagName === 'BUTTON' || domElement.getAttribute('role') === 'button') {
              console.log("Trying method 3: focus + Enter key");
              domElement.focus();
              const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true,
                cancelable: true
              });
              domElement.dispatchEvent(enterEvent);
            }
            
          }, 100);
          
        } catch (innerError) {
          console.error("All click methods failed:", innerError);
          addMessageToChat("system", `ERROR: All click methods failed - ${innerError.message}`);
        }
      }, 200);
      
      addMessageToChat("system", `✓ Attempted click on: ${elementInfo.title || elementInfo.tagName}`);
      
    } catch (error) {
      console.error("Click setup failed:", error);
      addMessageToChat("system", `ERROR: Click setup failed - ${error.message}`);
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
