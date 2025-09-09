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
      clearBoundingBoxes();
    }
  }

  function expandSidebar() {
    if (sidebar) {
      sidebar.classList.remove('collapsed');
      sidebar.classList.add('open');
      isCollapsed = false;
      isOpen = true;
      extractAndShowElements();
      showBoundingBoxes();
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
      
      sidebar.classList.add('open');
      sidebar.classList.remove('collapsed');
      isOpen = true;
      isCollapsed = false;

      // Show bounding boxes and extract elements when sidebar opens
      showBoundingBoxes();
      extractAndShowElements();

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
      
      // Clear bounding boxes when sidebar closes
      clearBoundingBoxes();
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

  function isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;
    
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= windowHeight &&
      rect.right <= windowWidth &&
      rect.width > 0 &&
      rect.height > 0 &&
      element.offsetWidth > 0 &&
      element.offsetHeight > 0
    );
  }

  function getElementInfo(element) {
    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    
    // Get text content - capture everything meaningful
    let textContent = '';
    if (element.tagName === 'IMG') {
      textContent = element.alt || element.title || '';
    } else if (element.tagName === 'INPUT') {
      textContent = element.placeholder || element.value || '';
    } else if (element.tagName === 'TEXTAREA') {
      textContent = element.placeholder || element.value || '';
    } else {
      // Get all text content, but clean it up
      const fullText = element.textContent?.trim() || '';
      
      // For content-heavy elements like articles, paragraphs, get full text
      const contentTags = ['p', 'article', 'section', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
      if (contentTags.includes(element.tagName.toLowerCase()) && fullText) {
        textContent = fullText;
      } else if (fullText) {
        textContent = fullText;
      }
      
      // Clean up whitespace and line breaks
      textContent = textContent.replace(/\s+/g, ' ').trim();
    }
    
    // For long text, provide a meaningful excerpt
    let displayText = textContent;
    if (textContent.length > 300) {
      // For article content, show first 300 chars
      displayText = textContent.substring(0, 300) + '...';
    }

    // Check for images more thoroughly
    let hasImage = element.tagName === 'IMG';
    if (!hasImage) {
      const bgImage = computedStyle.backgroundImage;
      hasImage = bgImage && bgImage !== 'none' && !bgImage.includes('data:');
    }
    
    // Look for nested images
    if (!hasImage && element.querySelector('img')) {
      hasImage = true;
    }

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      className: element.className ? element.className.split(' ').slice(0, 2).join(' ') : null,
      textContent: displayText || null,
      fullTextLength: textContent ? textContent.length : 0,
      href: element.href || null,
      src: element.src || null,
      type: element.type || null,
      role: element.getAttribute('role') || null,
      ariaLabel: element.getAttribute('aria-label') || null,
      position: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      isInteractive: isInteractiveElement(element),
      hasText: !!textContent,
      hasImage: hasImage
    };
  }

  function isInteractiveElement(element) {
    const interactiveTags = ['button', 'input', 'select', 'textarea', 'a', 'details', 'summary'];
    const interactiveRoles = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio'];
    
    if (interactiveTags.includes(element.tagName.toLowerCase())) {
      return true;
    }
    
    if (element.getAttribute('role') && interactiveRoles.includes(element.getAttribute('role'))) {
      return true;
    }
    
    if (element.onclick || element.getAttribute('onclick')) {
      return true;
    }
    
    return false;
  }

  function groupElementsByProximity(elements) {
    const groups = [];
    const grouped = new Set();
    
    elements.forEach((element, index) => {
      if (grouped.has(index)) return;
      
      const group = [element];
      grouped.add(index);
      
      // Find nearby elements
      elements.forEach((otherElement, otherIndex) => {
        if (grouped.has(otherIndex) || index === otherIndex) return;
        
        const distance = Math.sqrt(
          Math.pow(element.position.x - otherElement.position.x, 2) +
          Math.pow(element.position.y - otherElement.position.y, 2)
        );
        
        // Group elements that are close to each other
        if (distance < 200) {
          group.push(otherElement);
          grouped.add(otherIndex);
        }
      });
      
      groups.push(group);
    });
    
    return groups;
  }

  function isImportantUIElement(element, info) {
    // Interactive elements are always important
    if (info.isInteractive) return true;
    
    // Images are always important
    if (element.tagName === 'IMG' || info.hasImage) return true;
    
    // Any element with meaningful text content
    if (info.textContent && info.textContent.trim().length >= 3) return true;
    
    // Elements with background images
    if (info.hasImage) return true;
    
    return false;
  }

  function extractPageElements() {
    const elements = [];
    const processedElements = new Set();
    
    // Get all visible elements
    const allElements = document.querySelectorAll('*');
    
    allElements.forEach(element => {
      // Skip our sidebar and processed elements
      if (element.id === 'chat-assistant-sidebar' || 
          element.closest('#chat-assistant-sidebar') ||
          processedElements.has(element)) {
        return;
      }
      
      // Only process visible elements
      if (!isElementVisible(element)) return;
      
      // Skip elements that are too small
      const rect = element.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      
      const info = getElementInfo(element);
      
      // Include all important UI elements - text, images, and interactive
      if (isImportantUIElement(element, info)) {
        elements.push(info);
        processedElements.add(element);
      }
    });
    
    // Sort elements by position (top to bottom, left to right)
    elements.sort((a, b) => {
      if (Math.abs(a.position.y - b.position.y) > 20) {
        return a.position.y - b.position.y;
      }
      return a.position.x - b.position.x;
    });

    // Remove obvious duplicates but keep overlapping content
    const uniqueElements = [];
    const seenPositions = new Set();
    
    elements.forEach(element => {
      // More lenient duplicate detection - only remove exact position + content matches
      const positionKey = `${element.position.x},${element.position.y},${element.position.width},${element.position.height}`;
      const contentKey = `${positionKey},${element.tagName},${element.textContent?.substring(0, 50)}`;
      
      if (!seenPositions.has(contentKey)) {
        seenPositions.add(contentKey);
        uniqueElements.push(element);
      }
    });
    
    // Group elements by proximity for better hierarchy
    const groups = groupElementsByProximity(uniqueElements);
    
    return {
      totalElements: uniqueElements.length,
      extractedAt: new Date().toISOString(),
      groups: groups.map((group, index) => ({
        groupId: index + 1,
        elementCount: group.length,
        items: group
      }))
    };
  }

  function extractAndShowElements() {
    const elementsJson = document.getElementById('elements-json');
    if (!elementsJson) return;
    
    elementsJson.textContent = 'Extracting elements...';
    
    try {
      const result = extractPageElements();
      elementsJson.textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      elementsJson.textContent = 'Error extracting elements: ' + error.message;
    }
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