function isInteractive(element) {
  const interactiveTagNames = ['button', 'input', 'select', 'textarea', 'a'];
  const interactiveAttributes = ['onclick', 'onmousedown', 'onmouseup', 'onkeydown', 'onkeyup', 'tabindex'];
  const interactiveRoles = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio'];
  
  if (interactiveTagNames.includes(element.tagName.toLowerCase())) {
    return true;
  }
  
  if (element.tagName.toLowerCase() === 'a' && element.hasAttribute('href')) {
    return true;
  }
  
  if (element.hasAttribute('contenteditable') && element.getAttribute('contenteditable') === 'true') {
    return true;
  }
  
  for (const attr of interactiveAttributes) {
    if (element.hasAttribute(attr)) {
      return true;
    }
  }
  
  const role = element.getAttribute('role');
  if (role && interactiveRoles.includes(role)) {
    return true;
  }
  
  return false;
}

function getElementInfo(element) {
  const title = element.title || 
               element.getAttribute('aria-label') || 
               element.textContent?.trim() || 
               element.placeholder || 
               element.alt || 
               element.value || 
               element.href || 
               element.tagName;

  const rect = element.getBoundingClientRect();
  
  return {
    tagName: element.tagName.toLowerCase(),
    title: title && typeof title === 'string' ? title.substring(0, 100) : String(title || '').substring(0, 100),
    type: element.type || null,
    id: element.id || null,
    className: element.className || null,
    href: element.href || null,
    position: {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    },
    visible: element.offsetWidth > 0 && element.offsetHeight > 0,
    attributes: Array.from(element.attributes).reduce((acc, attr) => {
      if (['onclick', 'role', 'tabindex', 'aria-label'].includes(attr.name)) {
        acc[attr.name] = attr.value;
      }
      return acc;
    }, {})
  };
}

function isElementInViewport(element) {
  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;
  
  // Check if element is at least partially visible
  // Element is visible if any part of it overlaps with the viewport
  return (
    rect.bottom > 0 &&        // Bottom edge is below viewport top
    rect.right > 0 &&         // Right edge is to the right of viewport left
    rect.top < windowHeight && // Top edge is above viewport bottom
    rect.left < windowWidth && // Left edge is to the left of viewport right
    rect.width > 0 &&
    rect.height > 0
  );
}

function hasDirectTextContent(element) {
  // Check if element has direct text content (not from children)
  const childNodes = Array.from(element.childNodes);
  const hasDirectText = childNodes.some(node => 
    node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0
  );
  
  // For span tags and other inline elements, also check if they contain only text
  // (no complex nested structure) and have meaningful content
  if (!hasDirectText && element.tagName && ['SPAN', 'DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI'].includes(element.tagName)) {
    const textContent = element.textContent?.trim();
    const htmlChildren = Array.from(element.children);
    
    // If it has text and only simple formatting children, consider it as having direct content
    if (textContent && textContent.length > 2 && htmlChildren.length <= 3) {
      const simpleFormatting = ['SPAN', 'STRONG', 'EM', 'B', 'I', 'U', 'MARK', 'SMALL'];
      const hasOnlySimpleFormatting = htmlChildren.every(child => 
        simpleFormatting.includes(child.tagName)
      );
      
      if (hasOnlySimpleFormatting) return true;
    }
  }
  
  return hasDirectText;
}

function findDOMElementByInfo(elementInfo) {
  // No longer needed with single-pass approach - elements already have DOM references
  // Keep for compatibility but it should not be called in the new flow
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

// Cache for DOM indices to avoid recalculation
let domIndexCache = null;

function getDOMIndex(element) {
  // Create DOM index cache if it doesn't exist
  if (!domIndexCache) {
    domIndexCache = new Map();
    const allElements = document.querySelectorAll('*');
    allElements.forEach((el, index) => {
      domIndexCache.set(el, index);
    });
  }
  
  return domIndexCache.get(element) ?? -1;
}

function clearDOMIndexCache() {
  domIndexCache = null;
}

function hasDirectImageContent(element) {
  // Check if element is an image or has background image
  if (element.tagName === 'IMG') return true;
  
  const computedStyle = window.getComputedStyle(element);
  const bgImage = computedStyle.backgroundImage;
  return bgImage && bgImage !== 'none' && !bgImage.includes('data:');
}

function isContentElement(element) {
  // Always include elements with direct text content regardless of children
  if (hasDirectTextContent(element)) return true;
  
  // Always include image elements
  if (hasDirectImageContent(element)) return true;
  
  // For elements without direct text, check if they're simple content containers
  const children = Array.from(element.children);
  
  // If no children, check if it has any meaningful content
  if (children.length === 0) {
    const textContent = element.textContent?.trim();
    return textContent && textContent.length > 0;
  }
  
  // If it has only simple inline elements as children, it might be content
  const simpleInlineElements = ['SPAN', 'STRONG', 'EM', 'B', 'I', 'U', 'MARK', 'SMALL', 'SUB', 'SUP'];
  const hasOnlySimpleChildren = children.every(child => 
    simpleInlineElements.includes(child.tagName) || child.tagName === 'IMG'
  );
  
  // If it has only simple children and some text content, it's probably content
  if (hasOnlySimpleChildren && children.length <= 5) {
    const textContent = element.textContent?.trim();
    return textContent && textContent.length > 2;
  }
  
  return false;
}

function extractInteractiveElements() {
  // Ultra-fast single-pass DOM traversal approach
  // Walk through DOM once in document order and directly identify elements
  const elements = [];
  const foundElements = new Set();
  
  // Single DOM traversal - elements will be in document order automatically
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: function(element) {
        // Skip our sidebar
        if (element.id === 'chat-assistant-sidebar' || 
            element.closest('#chat-assistant-sidebar')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let currentElement;
  while (currentElement = walker.nextNode()) {
    // Skip if already processed or not visible
    if (foundElements.has(currentElement) || 
        currentElement.offsetWidth <= 0 || 
        currentElement.offsetHeight <= 0 || 
        !isElementInViewport(currentElement)) {
      continue;
    }

    let elementType = null;
    
    // Check if interactive (in priority order for efficiency)
    if (isInteractiveElementFast(currentElement)) {
      elementType = 'interactive';
    }
    // Check if content element
    else if (isContentElementFast(currentElement)) {
      const rect = currentElement.getBoundingClientRect();
      // Skip very small elements
      const minWidth = currentElement.tagName === 'SPAN' ? 10 : 20;
      const minHeight = currentElement.tagName === 'SPAN' ? 10 : 15;
      
      if (rect.width < minWidth || rect.height < minHeight) continue;
      elementType = 'content';
    }

    // If element matches our criteria, add it
    if (elementType) {
      foundElements.add(currentElement);
      
      const elementInfo = getElementInfo(currentElement);
      elementInfo.elementType = elementType;
      elementInfo.domElement = currentElement; // Store DOM reference directly
      
      elements.push(elementInfo);
    }
  }

  // Elements are already in DOM order from TreeWalker - no sorting needed!
  return {
    elements: elements,
    totalCount: elements.length
  };
}

// Fast interactive element detection (optimized for single-pass)
function isInteractiveElementFast(element) {
  const tagName = element.tagName;
  
  // Quick tag check first (most common case)
  if (tagName === 'BUTTON' || tagName === 'INPUT' || tagName === 'SELECT' || 
      tagName === 'TEXTAREA' || (tagName === 'A' && element.hasAttribute('href'))) {
    return true;
  }
  
  // Quick attribute checks
  if (element.hasAttribute('onclick') || element.hasAttribute('tabindex') || 
      element.getAttribute('contenteditable') === 'true') {
    return true;
  }
  
  // Check for spreadsheet cells and input fields (enhanced detection)
  if (isSpreadsheetOrInputElement(element)) {
    return true;
  }
  
  // Role check (less common)
  const role = element.getAttribute('role');
  if (role && ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'textbox', 'gridcell', 'cell'].includes(role)) {
    return true;
  }
  
  return false;
}

// Enhanced detection for spreadsheet cells and input fields
function isSpreadsheetOrInputElement(element) {
  const classList = element.classList.toString().toLowerCase();
  const role = element.getAttribute('role');
  
  // Spreadsheet patterns
  if (classList.includes('cell') || classList.includes('grid') || 
      element.getAttribute('data-cell') || 
      (element.tagName === 'TD' && element.getAttribute('tabindex'))) {
    return true;
  }
  
  // Input-like elements
  if (classList.includes('input') || classList.includes('field') || 
      classList.includes('textbox') || classList.includes('editable') ||
      role === 'textbox' || role === 'gridcell' || role === 'cell') {
    return true;
  }
  
  return false;
}

// Fast content element detection (optimized for single-pass)
function isContentElementFast(element) {
  // Quick exclusion for divs unless they have direct content
  if (element.tagName === 'DIV' && !hasDirectTextContent(element)) {
    return false;
  }
  
  // Check for direct text or images
  return hasDirectTextContent(element) || hasDirectImageContent(element);
}

// Bounding box management
let boundingBoxes = [];
let boundingBoxContainer = null;

function createBoundingBoxContainer() {
  if (boundingBoxContainer) return boundingBoxContainer;
  
  boundingBoxContainer = document.createElement('div');
  boundingBoxContainer.id = 'interactive-elements-overlay';
  boundingBoxContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 999999;
  `;
  document.body.appendChild(boundingBoxContainer);
  return boundingBoxContainer;
}

function createBoundingBox(element, index, elementInfo) {
  const rect = element.getBoundingClientRect();
  const box = document.createElement('div');
  
  // Different colors for interactive vs content elements
  const isInteractive = elementInfo.elementType === 'interactive';
  const borderColor = isInteractive ? '#ff4444' : '#4CAF50';
  const bgColor = isInteractive ? 'rgba(255, 68, 68, 0.1)' : 'rgba(76, 175, 80, 0.1)';
  const labelBg = isInteractive ? '#ff4444' : '#4CAF50';
  
  box.style.cssText = `
    position: absolute;
    left: ${rect.left}px;
    top: ${rect.top}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    border: 2px solid ${borderColor};
    background: ${bgColor};
    pointer-events: none;
    box-sizing: border-box;
  `;
  
  // Add index label
  const label = document.createElement('div');
  label.textContent = index;
  label.style.cssText = `
    position: absolute;
    top: -20px;
    left: 0;
    background: ${labelBg};
    color: white;
    padding: 2px 6px;
    font-size: 12px;
    font-weight: bold;
    border-radius: 3px;
    font-family: Arial, sans-serif;
  `;
  
  box.appendChild(label);
  return box;
}

function createClickHighlight(element, elementIndex) {
  const rect = element.getBoundingClientRect();
  const highlight = document.createElement('div');
  
  // Distinctive styling for click highlights - orange/amber color to stand out
  highlight.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.top}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    border: 3px solid #FF6B00;
    background: rgba(255, 107, 0, 0.2);
    pointer-events: none;
    box-sizing: border-box;
    z-index: 2147483647;
    animation: clickHighlightPulse 2s ease-in-out;
  `;
  
  // Add distinctive "CLICK" label
  const label = document.createElement('div');
  label.textContent = 'CLICK';
  label.style.cssText = `
    position: absolute;
    top: -25px;
    left: 50%;
    transform: translateX(-50%);
    background: #FF6B00;
    color: white;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: bold;
    border-radius: 4px;
    font-family: Arial, sans-serif;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  `;
  
  // Add CSS animation for the highlight
  const style = document.createElement('style');
  style.textContent = `
    @keyframes clickHighlightPulse {
      0% { border-width: 3px; background: rgba(255, 107, 0, 0.2); }
      50% { border-width: 4px; background: rgba(255, 107, 0, 0.4); }
      100% { border-width: 3px; background: rgba(255, 107, 0, 0.1); }
    }
  `;
  
  highlight.appendChild(label);
  document.head.appendChild(style);
  document.body.appendChild(highlight);
  
  // Auto-remove the highlight after 3 seconds
  setTimeout(() => {
    if (highlight.parentNode) {
      highlight.parentNode.removeChild(highlight);
    }
    if (style.parentNode) {
      style.parentNode.removeChild(style);
    }
  }, 3000);
  
  return highlight;
}


function showBoundingBoxes() {
  clearBoundingBoxes();
  
  const result = extractInteractiveElements();
  const container = createBoundingBoxContainer();
  
  // Draw individual element bounding boxes only
  result.elements.forEach((elementInfo, index) => {
    // Use the DOM element reference directly from single-pass extraction
    const domElement = elementInfo.domElement;
    
    if (domElement) {
      const boundingBox = createBoundingBox(domElement, index, elementInfo);
      container.appendChild(boundingBox);
      boundingBoxes.push(boundingBox);
    }
  });
  
  return result;
}

function clearBoundingBoxes() {
  if (boundingBoxContainer) {
    boundingBoxContainer.remove();
    boundingBoxContainer = null;
  }
  boundingBoxes = [];
}

// Expose functions globally for sidebar.js to use
window.showBoundingBoxes = showBoundingBoxes;
window.clearBoundingBoxes = clearBoundingBoxes;
window.extractInteractiveElements = extractInteractiveElements;

console.log('Content script loaded successfully');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.action);
  
  if (request.action === 'extractElements') {
    console.log('Processing extractElements request');
    try {
      const result = extractInteractiveElements();
      console.log('Extract result:', result);
      sendResponse({ success: true, data: result });
    } catch (error) {
      console.error('Extract error:', error);
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === 'executeClickByIndex') {
    // Extract fresh elements and click by index
    console.log('Processing executeClickByIndex request');
    try {
      const result = extractInteractiveElements();
      const elements = result.elements;
      
      executeClickOnElement(request.elementIndex, elements)
        .then(result => {
          console.log('Click result:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('Click error:', error);
          sendResponse({ success: false, error: error.message });
        });
    } catch (error) {
      console.error('Click setup error:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // Keep message channel open for async response
  } else if (request.action === 'scrollX') {
    try {
      const amount = request.amount || 0;
      window.scrollBy(amount, 0);
      sendResponse({ success: true, message: `Scrolled horizontally by ${amount}px` });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === 'scrollY') {
    try {
      const amount = request.amount || 0;
      window.scrollBy(0, amount);
      sendResponse({ success: true, message: `Scrolled vertically by ${amount}px` });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === 'enterText') {
    try {
      const result = extractInteractiveElements();
      const elements = result.elements;
      
      enterTextOnElement(request.elementIndex, request.text, elements)
        .then(result => {
          console.log('Enter text result:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('Enter text error:', error);
          sendResponse({ success: false, error: error.message });
        });
    } catch (error) {
      console.error('Enter text setup error:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // Keep message channel open for async response
  } else if (request.action === 'pressEnter') {
    try {
      const result = extractInteractiveElements();
      const elements = result.elements;
      
      pressEnterOnElement(request.elementIndex, elements)
        .then(result => {
          console.log('Press Enter result:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('Press Enter error:', error);
          sendResponse({ success: false, error: error.message });
        });
    } catch (error) {
      console.error('Press Enter setup error:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // Keep message channel open for async response
  } else if (request.action === 'showBoundingBoxes') {
    try {
      const result = showBoundingBoxes();
      sendResponse({ success: true, data: result });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === 'clearBoundingBoxes') {
    try {
      clearBoundingBoxes();
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true;
});

function executeClickOnElement(elementIndex, elements) {
  if (elementIndex < 0 || elementIndex >= elements.length) {
    return Promise.resolve({ success: false, error: `Invalid element index ${elementIndex}. Available indices: 0-${elements.length - 1}` });
  }

  const elementInfo = elements[elementIndex];
  
  // Use the DOM element reference that was stored during extraction
  const domElement = elementInfo.domElement;
  
  if (!domElement) {
    return Promise.resolve({ success: false, error: 'DOM element reference not found in extracted data' });
  }
  
  if (!domElement.isConnected) {
    return Promise.resolve({ success: false, error: 'Element is no longer in the document' });
  }
  
  console.log('Clicking element:', {
    index: elementIndex,
    tagName: domElement.tagName,
    text: domElement.textContent?.substring(0, 50),
    rect: domElement.getBoundingClientRect(),
    classList: Array.from(domElement.classList),
    role: domElement.getAttribute('role')
  });
  
  try {
    // Scroll element into view first
    domElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Create a highlight bounding box for the element being clicked
    const highlightBox = createClickHighlight(domElement, elementIndex);
    
    // Get element position for mouse events
    const rect = domElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Return Promise for async execution
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          // Method 1: Try to find and click a nested clickable element first
          const clickableChild = findBestClickTarget(domElement);
          if (clickableChild && clickableChild !== domElement) {
            console.log('Method 1: Found better click target, clicking nested element');
            try {
              clickableChild.click();
            } catch (e) {
              console.log('Nested element click failed, trying main element');
            }
          }
          
          // Method 2: Direct click (proven method from old code)
          console.log('Method 2: Direct element.click()');
          domElement.click();
          
          // Method 3: Mouse events sequence (proven from old code)
          setTimeout(() => {
            console.log('Method 3: mousedown/mouseup sequence');
            ['mousedown', 'mouseup', 'click'].forEach(eventType => {
              const event = new MouseEvent(eventType, {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: centerX,
                clientY: centerY,
                button: 0,
                buttons: eventType === 'mousedown' ? 1 : 0
              });
              domElement.dispatchEvent(event);
            });
          }, 100);
          
          // Method 4: Try clicking text or image elements inside as fallback
          setTimeout(() => {
            console.log('Method 4: Trying text and image elements inside');
            const textElements = domElement.querySelectorAll('span, p, div, h1, h2, h3, h4, h5, h6, strong, em, label');
            const imageElements = domElement.querySelectorAll('img, svg, i[class*="icon"], [class*="icon"]');
            
            // Try text elements first
            textElements.forEach((textEl, index) => {
              if (textEl.textContent && textEl.textContent.trim()) {
                setTimeout(() => {
                  try {
                    console.log('Clicking text element:', textEl.textContent.trim().substring(0, 30));
                    textEl.click();
                    
                    // Also try mouse events on text element
                    const textRect = textEl.getBoundingClientRect();
                    const textCenterX = textRect.left + textRect.width / 2;
                    const textCenterY = textRect.top + textRect.height / 2;
                    
                    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                      const event = new MouseEvent(eventType, {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        clientX: textCenterX,
                        clientY: textCenterY,
                        button: 0,
                        buttons: eventType === 'mousedown' ? 1 : 0
                      });
                      textEl.dispatchEvent(event);
                    });
                  } catch (e) {
                    console.log('Text element click failed');
                  }
                }, index * 50);
              }
            });
            
            // Try image elements after a delay
            setTimeout(() => {
              imageElements.forEach((imgEl, index) => {
                setTimeout(() => {
                  try {
                    console.log('Clicking image/icon element:', imgEl.tagName, imgEl.className);
                    imgEl.click();
                    
                    // Also try mouse events on image element
                    const imgRect = imgEl.getBoundingClientRect();
                    const imgCenterX = imgRect.left + imgRect.width / 2;
                    const imgCenterY = imgRect.top + imgRect.height / 2;
                    
                    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                      const event = new MouseEvent(eventType, {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        clientX: imgCenterX,
                        clientY: imgCenterY,
                        button: 0,
                        buttons: eventType === 'mousedown' ? 1 : 0
                      });
                      imgEl.dispatchEvent(event);
                    });
                  } catch (e) {
                    console.log('Image element click failed');
                  }
                }, index * 50);
              });
            }, 200);
          }, 200);
          
          resolve({ success: true, message: `Successfully attempted click on: ${elementInfo.title || elementInfo.tagName}` });
          
        } catch (error) {
          console.error('Click execution failed:', error);
          resolve({ success: false, error: `Click failed: ${error.message}` });
        }
      }, 300); // Wait for scroll to complete
    });
    
  } catch (error) {
    return Promise.resolve({ success: false, error: `Click setup failed: ${error.message}` });
  }
}

function findBestClickTarget(element) {
  // Look for nested clickable elements that might be the actual target
  const clickableSelectors = [
    'button', 
    'a[href]', 
    '[role="button"]', 
    '[onclick]',
    '.btn', 
    '.button',
    '[data-testid*="button"]',
    '[aria-label*="button"]',
    '[class*="click"]',
    '[class*="btn"]'
  ];
  
  // First, try to find a direct child that's clickable
  for (const selector of clickableSelectors) {
    const child = element.querySelector(selector);
    if (child) {
      console.log('Found clickable child:', child);
      return child;
    }
  }
  
  // If no direct clickable child, check if any child has click handlers
  const children = element.querySelectorAll('*');
  for (const child of children) {
    if (child.onclick || 
        child.style.cursor === 'pointer' || 
        child.getAttribute('role') === 'button' ||
        child.classList.toString().includes('click') ||
        child.classList.toString().includes('btn')) {
      console.log('Found child with click indicators:', child);
      return child;
    }
  }
  
  return element; // Return original element if no better target found
}

function enterTextOnElement(elementIndex, text, elements) {
  if (elementIndex < 0 || elementIndex >= elements.length) {
    return Promise.resolve({ success: false, error: `Invalid element index ${elementIndex}. Available indices: 0-${elements.length - 1}` });
  }

  const elementInfo = elements[elementIndex];
  const domElement = elementInfo.domElement;
  
  if (!domElement) {
    return Promise.resolve({ success: false, error: 'DOM element reference not found in extracted data' });
  }
  
  if (!domElement.isConnected) {
    return Promise.resolve({ success: false, error: 'Element is no longer in the document' });
  }
  
  // Check if element can accept text input
  const canAcceptText = domElement.tagName === 'INPUT' || 
                       domElement.tagName === 'TEXTAREA' || 
                       domElement.hasAttribute('contenteditable');
  
  if (!canAcceptText) {
    return Promise.resolve({ success: false, error: `Element ${domElement.tagName} cannot accept text input` });
  }
  
  console.log('Entering text on element:', {
    index: elementIndex,
    tagName: domElement.tagName,
    text: text,
    rect: domElement.getBoundingClientRect()
  });
  
  try {
    // Scroll element into view first
    domElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          // Focus the element first
          domElement.focus();
          
          // Clear existing content if it's an input or textarea
          if (domElement.tagName === 'INPUT' || domElement.tagName === 'TEXTAREA') {
            domElement.value = '';
            domElement.value = text;
            
            // Trigger input events
            domElement.dispatchEvent(new Event('input', { bubbles: true }));
            domElement.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (domElement.hasAttribute('contenteditable')) {
            domElement.textContent = text;
            
            // Trigger input events for contenteditable
            domElement.dispatchEvent(new Event('input', { bubbles: true }));
          }
          
          // Simulate typing for more realistic behavior
          text.split('').forEach((char, index) => {
            setTimeout(() => {
              const keyEvent = new KeyboardEvent('keydown', {
                key: char,
                bubbles: true,
                cancelable: true
              });
              domElement.dispatchEvent(keyEvent);
            }, index * 10);
          });
          
          resolve({ success: true, message: `Successfully entered text "${text}" into ${elementInfo.title || elementInfo.tagName}` });
          
        } catch (error) {
          console.error('Text entry failed:', error);
          resolve({ success: false, error: `Text entry failed: ${error.message}` });
        }
      }, 300); // Wait for scroll to complete
    });
    
  } catch (error) {
    return Promise.resolve({ success: false, error: `Text entry setup failed: ${error.message}` });
  }
}

function pressEnterOnElement(elementIndex, elements) {
  if (elementIndex < 0 || elementIndex >= elements.length) {
    return Promise.resolve({ success: false, error: `Invalid element index ${elementIndex}. Available indices: 0-${elements.length - 1}` });
  }

  const elementInfo = elements[elementIndex];
  const domElement = elementInfo.domElement;
  
  if (!domElement) {
    return Promise.resolve({ success: false, error: 'DOM element reference not found in extracted data' });
  }
  
  if (!domElement.isConnected) {
    return Promise.resolve({ success: false, error: 'Element is no longer in the document' });
  }
  
  console.log('Pressing Enter on element:', {
    index: elementIndex,
    tagName: domElement.tagName,
    rect: domElement.getBoundingClientRect()
  });
  
  try {
    // Scroll element into view first
    domElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          // Focus the element first
          domElement.focus();
          
          // Create and dispatch Enter key events
          const keyDownEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          });
          
          const keyPressEvent = new KeyboardEvent('keypress', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          });
          
          const keyUpEvent = new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          });
          
          // Dispatch all keyboard events in sequence
          domElement.dispatchEvent(keyDownEvent);
          domElement.dispatchEvent(keyPressEvent);
          domElement.dispatchEvent(keyUpEvent);
          
          // For form elements, also try triggering submit on the parent form
          if (domElement.tagName === 'INPUT' || domElement.tagName === 'TEXTAREA') {
            const form = domElement.closest('form');
            if (form) {
              // Trigger form submit event
              const submitEvent = new Event('submit', {
                bubbles: true,
                cancelable: true
              });
              form.dispatchEvent(submitEvent);
            }
          }
          
          resolve({ success: true, message: `Successfully pressed Enter on ${elementInfo.title || elementInfo.tagName}` });
          
        } catch (error) {
          console.error('Press Enter failed:', error);
          resolve({ success: false, error: `Press Enter failed: ${error.message}` });
        }
      }, 300); // Wait for scroll to complete
    });
    
  } catch (error) {
    return Promise.resolve({ success: false, error: `Press Enter setup failed: ${error.message}` });
  }
}