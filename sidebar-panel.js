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
    let lastActionExecuted = null;
    let isVerificationStep = false;
    
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
        let contextMessage;
        
        if (isVerificationStep && lastActionExecuted) {
          // This is a verification step
          contextMessage = `VERIFICATION STEP: You just executed: ${JSON.stringify(lastActionExecuted)}. 
          
          Please verify if this action was successful by analyzing the current page state. 
          
          If the action was successful and you can see the expected changes, respond with:
          {"action": "verified", "message": "Action was successful, explanation of what changed"}
          
          If the action failed or you don't see expected changes, respond with:
          {"action": "retry", "message": "Action failed, explanation of what went wrong"}
          
          If the task is now complete, respond with:
          {"action": "none", "message": "Task completed successfully"}`;
        } else {
          // This is a regular action step
          contextMessage = stepCount === 1 ? 
            initialMessage : 
            `Continue with the task: "${initialMessage}". You have already taken ${Math.floor(stepCount / 2)} verified steps. Analyze the current page state and determine what to do next.`;
        }
        
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
        } else if (jsonResponse.action === 'verified') {
          // Verification successful, continue to next action
          addMessage('system', `✅ Verification successful: ${jsonResponse.message}`);
          isVerificationStep = false;
          lastActionExecuted = null;
          addMessage('system', `⏭️ Proceeding to next action...`);
          continue;
        } else if (jsonResponse.action === 'retry') {
          // Verification failed, retry the last action or continue with a different approach
          addMessage('system', `⚠️ Action needs retry: ${jsonResponse.message}`);
          isVerificationStep = false;
          lastActionExecuted = null;
          addMessage('system', `🔄 Trying different approach...`);
          continue;
        } else if (jsonResponse.action === 'click' && jsonResponse.elementIndex !== undefined) {
          // Execute click in the tab
          const clickResult = await executeClickInTab(currentTabId, jsonResponse.elementIndex);
          
          if (clickResult.success) {
            addMessage('system', `✓ Clicked element: ${clickResult.message}`);
            // Set up for verification step
            lastActionExecuted = {
              action: 'click',
              elementIndex: jsonResponse.elementIndex,
              expectedResult: jsonResponse.message
            };
            isVerificationStep = true;
          } else {
            addMessage('system', `❌ Click failed: ${clickResult.error}`);
            break;
          }
          
          // Wait for page updates after click
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          addMessage('system', `🔍 Proceeding to verification step...`);
        } else if (jsonResponse.action === 'enterText' && jsonResponse.elementIndex !== undefined && jsonResponse.text !== undefined) {
          // Execute text entry
          const textResult = await enterTextInTab(currentTabId, jsonResponse.elementIndex, jsonResponse.text);
          
          if (textResult.success) {
            addMessage('system', `✓ Entered text: ${textResult.message}`);
            // Set up for verification step
            lastActionExecuted = {
              action: 'enterText',
              elementIndex: jsonResponse.elementIndex,
              text: jsonResponse.text,
              expectedResult: jsonResponse.message
            };
            isVerificationStep = true;
          } else {
            addMessage('system', `❌ Text entry failed: ${textResult.error}`);
            break;
          }
          
          // Wait for page updates after text entry
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          addMessage('system', `🔍 Proceeding to verification step...`);
        } else if (jsonResponse.action === 'scrollX' && jsonResponse.amount !== undefined) {
          // Execute horizontal scroll
          const scrollResult = await scrollInTab(currentTabId, 'scrollX', jsonResponse.amount);
          
          if (scrollResult.success) {
            addMessage('system', `✓ Scrolled horizontally: ${scrollResult.message}`);
            // Set up for verification step
            lastActionExecuted = {
              action: 'scrollX',
              amount: jsonResponse.amount,
              expectedResult: jsonResponse.message
            };
            isVerificationStep = true;
          } else {
            addMessage('system', `❌ Scroll failed: ${scrollResult.error}`);
            break;
          }
          
          // Wait for scroll to complete
          await new Promise(resolve => setTimeout(resolve, 500));
          
          addMessage('system', `🔍 Proceeding to verification step...`);
        } else if (jsonResponse.action === 'scrollY' && jsonResponse.amount !== undefined) {
          // Execute vertical scroll
          const scrollResult = await scrollInTab(currentTabId, 'scrollY', jsonResponse.amount);
          
          if (scrollResult.success) {
            addMessage('system', `✓ Scrolled vertically: ${scrollResult.message}`);
            // Set up for verification step
            lastActionExecuted = {
              action: 'scrollY',
              amount: jsonResponse.amount,
              expectedResult: jsonResponse.message
            };
            isVerificationStep = true;
          } else {
            addMessage('system', `❌ Scroll failed: ${scrollResult.error}`);
            break;
          }
          
          // Wait for scroll to complete
          await new Promise(resolve => setTimeout(resolve, 500));
          
          addMessage('system', `🔍 Proceeding to verification step...`);
        } else if (jsonResponse.action === 'pressEnter' && jsonResponse.elementIndex !== undefined) {
          // Execute press Enter
          const enterResult = await pressEnterInTab(currentTabId, jsonResponse.elementIndex);
          
          if (enterResult.success) {
            addMessage('system', `✓ Pressed Enter: ${enterResult.message}`);
            // Set up for verification step
            lastActionExecuted = {
              action: 'pressEnter',
              elementIndex: jsonResponse.elementIndex,
              expectedResult: jsonResponse.message
            };
            isVerificationStep = true;
          } else {
            addMessage('system', `❌ Press Enter failed: ${enterResult.error}`);
            break;
          }
          
          // Wait for page updates after pressing Enter (form submissions, etc.)
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          addMessage('system', `🔍 Proceeding to verification step...`);
        } else if (jsonResponse.action === 'openTab' && jsonResponse.url !== undefined) {
          // Open new tab
          const tabResult = await openNewTab(jsonResponse.url);
          
          if (tabResult.success) {
            addMessage('system', `✓ Opened new tab: ${tabResult.message}`);
            // Update current tab to the new one
            currentTabId = tabResult.tabId;
            // Tab actions are automatically verified since they either succeed or fail
            addMessage('system', `✅ Tab opened successfully, continuing...`);
          } else {
            addMessage('system', `❌ Failed to open tab: ${tabResult.error}`);
            break;
          }
          
          // Wait for new tab to load
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else if (jsonResponse.action === 'getTabList') {
          // Get list of all tabs
          const tabsResult = await getTabList();
          
          if (tabsResult.success) {
            addMessage('system', `✓ Retrieved tab list: ${tabsResult.message}`);
            
            // Create a clearer tab list for the agent
            const tabListText = tabsResult.tabs.map(tab => 
              `Tab ID ${tab.id}: ${tab.domain} - "${tab.title}" (${tab.active ? 'ACTIVE' : 'inactive'})`
            ).join('\n');
            
            // Add tabs info to conversation history for agent to see
            conversationHistory.push({
              role: 'user',
              content: `Available tabs:\n${tabListText}\n\nTo switch to a specific tab, use the exact Tab ID number from this list.`
            });
          } else {
            addMessage('system', `❌ Failed to get tab list: ${tabsResult.error}`);
            break;
          }
          
          addMessage('system', `✅ Tab list retrieved successfully, continuing...`);
        } else if (jsonResponse.action === 'switchTab' && jsonResponse.tabId !== undefined) {
          // Switch to specified tab
          const switchResult = await switchToTab(jsonResponse.tabId);
          
          if (switchResult.success) {
            addMessage('system', `✓ Switched to tab: ${switchResult.message}`);
            // Update current tab reference
            currentTabId = jsonResponse.tabId;
            await getCurrentTabInfo();
            // Tab actions are automatically verified since they either succeed or fail
            addMessage('system', `✅ Tab switched successfully, continuing...`);
          } else {
            addMessage('system', `❌ Failed to switch tab: ${switchResult.error}`);
            break;
          }
          
          // Wait for tab switch to complete
          await new Promise(resolve => setTimeout(resolve, 1000));
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

  async function enterTextInTab(tabId, elementIndex, text) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { 
        action: 'enterText', 
        elementIndex: elementIndex,
        text: text
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: false, error: 'No response' });
        }
      });
    });
  }

  async function scrollInTab(tabId, action, amount) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { 
        action: action, 
        amount: amount
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: false, error: 'No response' });
        }
      });
    });
  }

  async function pressEnterInTab(tabId, elementIndex) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { 
        action: 'pressEnter', 
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

  async function openNewTab(url) {
    try {
      const tab = await chrome.tabs.create({ url: url, active: true });
      return { 
        success: true, 
        message: `Opened tab with URL: ${url}`, 
        tabId: tab.id 
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to open tab: ${error.message}` 
      };
    }
  }

  async function getTabList() {
    try {
      const tabs = await chrome.tabs.query({});
      const tabInfo = tabs.map((tab, index) => {
        // Extract domain from URL for clearer identification
        let domain = 'unknown';
        try {
          domain = new URL(tab.url).hostname;
        } catch (e) {
          domain = tab.url || 'unknown';
        }
        
        return {
          id: tab.id,
          url: tab.url,
          title: tab.title,
          domain: domain,
          active: tab.active,
          index: tab.index,
          description: `${domain} - ${tab.title}`
        };
      });
      
      // Sort tabs by index to maintain consistent order
      tabInfo.sort((a, b) => a.index - b.index);
      
      return { 
        success: true, 
        message: `Found ${tabs.length} tabs`, 
        tabs: tabInfo 
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to get tab list: ${error.message}` 
      };
    }
  }

  async function switchToTab(tabId) {
    try {
      await chrome.tabs.update(tabId, { active: true });
      const tab = await chrome.tabs.get(tabId);
      return { 
        success: true, 
        message: `Switched to tab: ${tab.title || tab.url}` 
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to switch to tab: ${error.message}` 
      };
    }
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