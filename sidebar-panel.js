// Sidebar Panel Script for Chrome Sidebar API
(function() {
  "use strict";

  let conversationHistory = [];
  let currentTabId = null;
  let isAgentRunning = false;

  // DOM elements
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const clearBtn = document.getElementById('clear-btn');
  const modelSelector = document.getElementById('model-selector');
  const boundingBoxToggle = document.getElementById('bounding-box-toggle');
  const status = document.getElementById('status');
  const currentUrl = document.getElementById('current-url');

  // Initialize
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setupEventListeners();
    getCurrentTabInfo();
    updateStatus('Ready');
  }

  function setupEventListeners() {
    sendBtn.addEventListener('click', handleSendMessage);
    clearBtn.addEventListener('click', clearChat);
    boundingBoxToggle.addEventListener('change', handleBoundingBoxToggle);
    
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    // Auto-resize textarea
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });
  }

  async function getCurrentTabInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        currentTabId = tab.id;
        currentUrl.textContent = tab.url;
        updateStatus('Connected to tab');
      }
    } catch (error) {
      console.error('Error getting current tab:', error);
      updateStatus('Error connecting to tab');
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
      chrome.tabs.sendMessage(currentTabId, { action: 'showBoundingBoxes' });
    } else {
      chrome.tabs.sendMessage(currentTabId, { action: 'clearBoundingBoxes' });
    }
  }

  async function handleSendMessage() {
    const message = chatInput.value.trim();
    if (!message || isAgentRunning) return;

    if (!currentTabId) {
      await getCurrentTabInfo();
      if (!currentTabId) {
        addMessage('system', 'Please navigate to a webpage first.');
        return;
      }
    }

    // Clear input and disable controls
    chatInput.value = '';
    chatInput.style.height = 'auto';
    setControlsEnabled(false);
    isAgentRunning = true;

    // Add user message
    addMessage('user', message);
    
    // Add initial user message to conversation history
    conversationHistory.push({
      role: 'user',
      content: message
    });

    updateStatus('Running automation...');

    try {
      await runAutonomousAgent(message);
    } catch (error) {
      console.error('Agent error:', error);
      addMessage('system', `❌ Agent error: ${error.message}`);
    } finally {
      setControlsEnabled(true);
      isAgentRunning = false;
      updateStatus('Ready');
    }
  }

  async function runAutonomousAgent(initialMessage) {
    let stepCount = 0;
    const maxSteps = 10;
    
    addMessage('system', `🤖 Starting autonomous agent for task: "${initialMessage}"`);
    
    while (stepCount < maxSteps) {
      stepCount++;
      
      try {
        // Get fresh elements from the current tab
        const elementsData = await getElementsFromTab(currentTabId);
        
        if (!elementsData || !elementsData.data || !elementsData.data.elements) {
          addMessage('system', '❌ Could not extract elements from the page');
          break;
        }

        // Build context message for this step
        const contextMessage = stepCount === 1 ? 
          initialMessage : 
          `Continue with the task: "${initialMessage}". You have already taken ${stepCount - 1} steps. Analyze the current page state and determine what to do next.`;
        
        // Add current user message to conversation history
        conversationHistory.push({
          role: 'user',
          content: contextMessage
        });
        
        // Get selected model
        const selectedModel = modelSelector.value;
        
        // Call LLM with current state
        const response = await callGroqAPI(contextMessage, elementsData.data.elements, conversationHistory, selectedModel);
        
        // Parse response
        let jsonResponse;
        try {
          jsonResponse = JSON.parse(response);
        } catch (parseError) {
          addMessage('system', `❌ Invalid JSON response: ${response.substring(0, 200)}...`);
          break;
        }
        
        // Add to conversation history
        conversationHistory.push({
          role: 'assistant',
          content: response
        });
        
        // Display response
        let displayMessage = `Step ${stepCount}: ${JSON.stringify(jsonResponse, null, 2)}`;
        
        if (jsonResponse.elementIndex !== undefined && elementsData.data.elements[jsonResponse.elementIndex]) {
          const element = elementsData.data.elements[jsonResponse.elementIndex];
          displayMessage += `\n\nElement Details:\n- Type: ${element.tagName}${element.type ? `[${element.type}]` : ''}\n- Content: "${element.title}"\n- Element Type: ${element.elementType}`;
        }
        
        addMessage('assistant', displayMessage);
        
        // Check if we should continue
        if (jsonResponse.action === 'none') {
          addMessage('system', `🎯 Agent completed task: ${jsonResponse.message}`);
          break;
        } else if (jsonResponse.action === 'click' && jsonResponse.elementIndex !== undefined) {
          // Execute click in the tab (get fresh elements for clicking)
          const clickResult = await executeClickInTab(currentTabId, jsonResponse.elementIndex);
          
          if (clickResult.success) {
            addMessage('system', `✓ Clicked element: ${clickResult.message}`);
          } else {
            addMessage('system', `❌ Click failed: ${clickResult.error}`);
            break;
          }
          
          // Wait for page updates after click
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          addMessage('system', `⏭️ Continuing to next step...`);
        } else {
          addMessage('system', `❌ Invalid response from agent, stopping`);
          break;
        }
        
      } catch (error) {
        console.error('Agent step failed:', error);
        addMessage('system', `❌ Agent error: ${error.message}`);
        break;
      }
    }
    
    if (stepCount >= maxSteps) {
      addMessage('system', `⚠️ Agent reached maximum steps (${maxSteps}), stopping for safety`);
    }
  }

  async function getElementsFromTab(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'extractElements' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error getting elements:', chrome.runtime.lastError);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  }

  async function executeClickInTab(tabId, elementIndex) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { 
        action: 'executeClickByIndex', 
        elementIndex: elementIndex
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: false, error: 'No response' });
        }
      });
    });
  }

  async function callGroqAPI(message, elements, conversationHistory, model) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'callClaudeAPI',
        message: message,
        elements: elements,
        conversationHistory: conversationHistory,
        model: model
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response.success) {
          resolve(response.response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  function addMessage(sender, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';
    headerDiv.textContent = sender.charAt(0).toUpperCase() + sender.slice(1);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
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
      sendBtn.textContent = 'Send';
      chatInput.focus();
    } else {
      sendBtn.textContent = 'Working...';
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