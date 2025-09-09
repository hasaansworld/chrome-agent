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
  
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= windowHeight &&
    rect.right <= windowWidth &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function extractInteractiveElements() {
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

  interactiveSelectors.forEach(selector => {
    try {
      const matches = document.querySelectorAll(selector);
      matches.forEach(element => {
        if (!foundElements.has(element) && element.offsetWidth > 0 && element.offsetHeight > 0 && isElementInViewport(element)) {
          foundElements.add(element);
          
          const elementInfo = getElementInfo(element);
          
          elements.push(elementInfo);
        }
      });
    } catch (e) {
      console.warn(`Error processing selector ${selector}:`, e);
    }
  });

  const sortedElements = elements.sort((a, b) => {
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    return a.position.x - b.position.x;
  });

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

function createBoundingBox(element, index) {
  const rect = element.getBoundingClientRect();
  const box = document.createElement('div');
  
  box.style.cssText = `
    position: absolute;
    left: ${rect.left}px;
    top: ${rect.top}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    border: 2px solid #ff4444;
    background: rgba(255, 68, 68, 0.1);
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
    background: #ff4444;
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
  
  result.elements.forEach((elementInfo, index) => {
    // Find the actual DOM element using the position and other info
    const elements = document.querySelectorAll('*');
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      if (Math.abs(rect.left - elementInfo.position.x) < 5 &&
          Math.abs(rect.top - elementInfo.position.y) < 5 &&
          Math.abs(rect.width - elementInfo.position.width) < 5 &&
          Math.abs(rect.height - elementInfo.position.height) < 5) {
        
        const boundingBox = createBoundingBox(element, index);
        container.appendChild(boundingBox);
        boundingBoxes.push(boundingBox);
        break;
      }
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