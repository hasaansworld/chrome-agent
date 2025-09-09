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
    title: title ? title.substring(0, 100) : '',
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
  // Clear DOM index cache for fresh extraction
  clearDOMIndexCache();
  
  const interactiveSelectors = [
    'button',
    'input',
    'select', 
    'textarea',
    'a[href]',
    '[onclick]',
    '[onmousedown]',
    '[onmouseup]',
    '[onkeydown]',
    '[onkeyup]',
    '[tabindex]',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[contenteditable="true"]'
  ];

  const elements = [];
  const foundElements = new Set();

  // First, get all interactive elements
  interactiveSelectors.forEach(selector => {
    try {
      const matches = document.querySelectorAll(selector);
      matches.forEach(element => {
        if (!foundElements.has(element) && element.offsetWidth > 0 && element.offsetHeight > 0 && isElementInViewport(element)) {
          foundElements.add(element);
          
          const elementInfo = getElementInfo(element);
          elementInfo.elementType = 'interactive';
          
          elements.push(elementInfo);
        }
      });
    } catch (e) {
      console.warn(`Error processing selector ${selector}:`, e);
    }
  });

  // Then, get all elements with direct text or image content
  const allElements = document.querySelectorAll('*');
  allElements.forEach(element => {
    if (!foundElements.has(element) && 
        element.offsetWidth > 0 && 
        element.offsetHeight > 0 && 
        isElementInViewport(element) &&
        isContentElement(element)) {
      
      const rect = element.getBoundingClientRect();
      // Skip very small elements that are likely decorative, but be more lenient for span tags
      const minWidth = element.tagName === 'SPAN' ? 10 : 20;
      const minHeight = element.tagName === 'SPAN' ? 10 : 15;
      
      if (rect.width < minWidth || rect.height < minHeight) return;
      
      foundElements.add(element);
      
      const elementInfo = getElementInfo(element);
      elementInfo.elementType = 'content';
      
      elements.push(elementInfo);
    }
  });

  // Efficiently sort elements by DOM order
  // First, find all DOM elements and calculate their document positions once
  const elementsWithDOM = elements.map(element => {
    const domElement = findDOMElementByInfo(element);
    return {
      element,
      domElement,
      domIndex: domElement ? getDOMIndex(domElement) : -1
    };
  });
  
  // Sort by pre-calculated DOM indices
  const sortedElements = elementsWithDOM
    .sort((a, b) => {
      // If both have DOM elements, sort by DOM index
      if (a.domIndex !== -1 && b.domIndex !== -1) {
        return a.domIndex - b.domIndex;
      }
      // Fallback to visual position if DOM elements not found
      if (a.element.position.y !== b.element.position.y) {
        return a.element.position.y - b.element.position.y;
      }
      return a.element.position.x - b.element.position.x;
    })
    .map(item => item.element); // Extract just the elements

  return {
    elements: sortedElements,
    totalCount: sortedElements.length
  };
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
  label.textContent = index + 1;
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


function showBoundingBoxes() {
  clearBoundingBoxes();
  
  const result = extractInteractiveElements();
  const container = createBoundingBoxContainer();
  
  // Draw individual element bounding boxes only
  result.elements.forEach((elementInfo, index) => {
    // Find the actual DOM element using the cached or computed position
    const domElement = findDOMElementByInfo(elementInfo);
    
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractElements') {
    try {
      const result = extractInteractiveElements();
      sendResponse({ success: true, data: result });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
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