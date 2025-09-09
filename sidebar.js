// Chat Assistant Sidebar - Robust implementation for all websites
(function() {
  'use strict';
  
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
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback);
    } else {
      callback();
    }
  }

  function createSidebar() {
    // Remove any existing sidebar
    const existingSidebar = document.getElementById('chat-assistant-sidebar');
    if (existingSidebar) {
      existingSidebar.remove();
    }

    sidebar = document.createElement('div');
    sidebar.id = 'chat-assistant-sidebar';
    
    // Set HTML content
    sidebar.innerHTML = `
      <button class="collapse-toggle" id="collapse-toggle">▶</button>
      <div class="chat-assistant-header">
        <h1 class="chat-assistant-title">Interactive Elements</h1>
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
        <div class="elements-viewer" id="elements-viewer">
          <div class="elements-header">
            <span class="elements-title">Interactive Elements</span>
            <button class="refresh-elements-btn" id="refresh-elements-btn">Refresh</button>
          </div>
          <div class="elements-json" id="elements-json">Loading...</div>
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
      console.error('Chat Assistant: Failed to append sidebar to DOM:', error);
      return null;
    }

    initSidebarEventListeners();
    return sidebar;
  }

  function initSidebarEventListeners() {
    const closeBtn = document.getElementById('chat-assistant-close-btn');
    const collapseBtn = document.getElementById('collapse-btn');
    const collapseToggle = document.getElementById('collapse-toggle');
    const sendBtn = document.getElementById('chat-assistant-send-btn');
    const input = document.getElementById('chat-assistant-input');
    const refreshBtn = document.getElementById('refresh-elements-btn');

    if (closeBtn) {
      closeBtn.addEventListener('click', closeSidebar);
    }

    if (collapseBtn) {
      collapseBtn.addEventListener('click', collapseSidebar);
    }

    if (collapseToggle) {
      collapseToggle.addEventListener('click', expandSidebar);
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', handleChatSend);
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        showBoundingBoxes();
        extractAndShowElements();
      });
    }
    
    if (input) {
      // Handle Enter key in chat input (Shift+Enter for new line)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleChatSend();
        }
      });

      // Auto-resize chat input
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });
    }
  }

  function collapseSidebar() {
    if (sidebar) {
      sidebar.classList.remove('open');
      sidebar.classList.add('collapsed');
      isCollapsed = true;
      // Don't clear bounding boxes when collapsing
    }
  }

  function expandSidebar() {
    if (sidebar) {
      sidebar.classList.remove('collapsed');
      sidebar.classList.add('open');
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
        
        // Only refresh elements on first sidebar creation
        showBoundingBoxes();
        extractAndShowElements();
      }
      
      sidebar.classList.add('open');
      sidebar.classList.remove('collapsed');
      isOpen = true;
      isCollapsed = false;

      // Focus on input
      setTimeout(() => {
        const input = document.getElementById('chat-assistant-input');
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
      sidebar.classList.remove('open');
      sidebar.classList.remove('collapsed');
      isOpen = false;
      isCollapsed = false;
      
      // Don't clear bounding boxes when sidebar closes - let them persist
      // clearBoundingBoxes();
    }
  }

  function toggleSidebar() {
    if (!isOpen) {
      showSidebar();
    } else {
      closeSidebar();
    }
  }

  function handleChatSend() {
    const input = document.getElementById('chat-assistant-input');
    const sendBtn = document.getElementById('chat-assistant-send-btn');
    const content = document.getElementById('chat-assistant-content');
    
    if (!input || !sendBtn || !content) return;
    
    const message = input.value.trim();
    if (!message) return;
    
    // Add user message to chat
    addMessageToChat('user', message);
    
    // Disable input and button
    input.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    
    // Clear input
    input.value = '';
    input.style.height = 'auto';
    
    // Simulate AI response (replace with actual AI service)
    setTimeout(() => {
      addMessageToChat('assistant', 'This is a placeholder response. You can integrate with your preferred AI service here.');
      
      // Re-enable input and button
      input.disabled = false;
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
      
      // Focus back to input
      try {
        input.focus();
      } catch (error) {
        // Focus may fail, ignore
      }
    }, 1000);
  }

  function addMessageToChat(sender, message) {
    const content = document.getElementById('chat-assistant-content');
    if (!content) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-assistant-message ${sender}`;
    
    const senderLabel = document.createElement('div');
    senderLabel.className = 'chat-assistant-message-sender';
    senderLabel.textContent = sender === 'user' ? 'You' : 'Assistant';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'chat-assistant-message-content';
    messageContent.textContent = message;
    
    messageDiv.appendChild(senderLabel);
    messageDiv.appendChild(messageContent);
    content.appendChild(messageDiv);
    
    // Scroll to bottom
    try {
      content.scrollTop = content.scrollHeight;
    } catch (error) {
      // Scroll may fail, ignore
    }
  }




  function extractAndShowElements() {
    const elementsContainer = document.getElementById('elements-json');
    if (!elementsContainer) return;
    
    elementsContainer.innerHTML = '<div class="loading-text">Extracting elements...</div>';
    
    try {
      // FORCE using the same function that bounding boxes use
      if (!window.extractInteractiveElements) {
        elementsContainer.innerHTML = '<div class="error-text">extractInteractiveElements not available</div>';
        return;
      }
      
      const result = window.extractInteractiveElements();
      displayElementsList(result, elementsContainer);
    } catch (error) {
      elementsContainer.innerHTML = `<div class="error-text">Error extracting elements: ${error.message}</div>`;
    }
  }

  function displayElementsList(result, container) {
    if (!result.elements || result.elements.length === 0) {
      container.innerHTML = '<div class="no-elements">No elements found on this page.</div>';
      return;
    }

    // Store elements data globally for click handling
    currentElements = result.elements;

    // Create simple flat list using exact same numbering as bounding boxes
    const flatList = createFlatElementsList(result.elements);
    
    container.innerHTML = flatList;
    
    // Add click handlers to each sidebar element item
    const sidebarItems = container.querySelectorAll('.sidebar-element-item[data-element-index]');
    sidebarItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const elementIndex = parseInt(item.getAttribute('data-element-index'));
        clickElementByIndex(elementIndex);
      });
    });
  }

  function createFlatElementsList(elements) {
    // Elements are already sorted by DOM order from extractInteractiveElements()
    // Just render them with simple sequential numbering
    return elements.map((element, index) => {
      const elementNumber = index + 1; // Simple sequential numbering: 1, 2, 3, 4...
      const isInteractive = element.elementType === 'interactive';
      
      // Type badge
      const typeBadge = isInteractive ? 
        '<span class="type-badge interactive">Interactive</span>' : 
        '<span class="type-badge content">Content</span>';
      
      // Content preview (only for meaningful content, not divs)
      const shouldShowContent = element.title && 
        element.tagName !== 'div' && 
        element.title.trim().length > 0 && 
        element.title !== element.tagName && 
        element.title !== element.href;
      
      let contentPreview = '';
      if (shouldShowContent) {
        const maxLength = 40;
        const truncated = element.title.length > maxLength ? 
          element.title.substring(0, maxLength) + '...' : 
          element.title;
        contentPreview = `<div class="element-content">"${escapeHtml(truncated)}"</div>`;
      }

      return `
        <div class="sidebar-element-item" data-element-index="${index}" style="cursor: pointer;">
          <div class="element-header">
            <div class="element-tag ${isInteractive ? 'interactive' : 'content'}">${elementNumber}. ${element.tagName}</div>
            <div class="element-types">${typeBadge}</div>
          </div>
          ${contentPreview}
        </div>
      `;
    }).join('');
  }

  function findDOMElementByInfo(elementInfo) {
    const elements = document.querySelectorAll('*');
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      if (Math.abs(rect.left - elementInfo.position.x) < 3 &&
          Math.abs(rect.top - elementInfo.position.y) < 3 &&
          Math.abs(rect.width - elementInfo.position.width) < 3 &&
          Math.abs(rect.height - elementInfo.position.height) < 3) {
        return element;
      }
    }
    return null;
  }

  function clickElementByIndex(elementIndex) {
    try {
      if (!currentElements || elementIndex < 0 || elementIndex >= currentElements.length) {
        console.warn('Element not found at index:', elementIndex);
        return;
      }

      const elementInfo = currentElements[elementIndex];
      
      // Use the stored DOM element reference from the single-pass extraction
      const domElement = elementInfo.domElement;
      
      if (domElement) {
        // Scroll element into view first
        domElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Trigger a real click event
        setTimeout(() => {
          domElement.click();
          console.log('Clicked element:', elementInfo.tagName, elementInfo.title);
        }, 300); // Small delay to allow scroll to complete
      } else {
        console.warn('DOM element not found for:', elementInfo);
      }
    } catch (error) {
      console.error('Error clicking element:', error);
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleSidebar') {
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
      if (isOpen && sidebar && !document.getElementById('chat-assistant-sidebar')) {
        // Sidebar was removed, recreate it
        isOpen = false;
        showSidebar();
      }
    }
  }).observe(document, { subtree: true, childList: true });

})();