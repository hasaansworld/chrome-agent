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

// DOM element cache for finding elements by position
let elementCache = new Map();

function findDOMElementByInfo(elementInfo) {
  const cacheKey = `${elementInfo.position.x}-${elementInfo.position.y}-${elementInfo.position.width}-${elementInfo.position.height}`;
  
  if (elementCache.has(cacheKey)) {
    return elementCache.get(cacheKey);
  }
  
  const elements = document.querySelectorAll('*');
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (Math.abs(rect.left - elementInfo.position.x) < 3 &&
        Math.abs(rect.top - elementInfo.position.y) < 3 &&
        Math.abs(rect.width - elementInfo.position.width) < 3 &&
        Math.abs(rect.height - elementInfo.position.height) < 3) {
      elementCache.set(cacheKey, element);
      return element;
    }
  }
  return null;
}

function findCommonAncestor(element1, element2) {
  if (!element1 || !element2) return null;
  
  const ancestors1 = [];
  let current = element1;
  while (current && current !== document.body) {
    ancestors1.push(current);
    current = current.parentElement;
  }
  
  current = element2;
  while (current && current !== document.body) {
    if (ancestors1.includes(current)) {
      return current;
    }
    current = current.parentElement;
  }
  
  return document.body;
}

function getAncestorDepth(element1, element2) {
  const ancestor = findCommonAncestor(element1, element2);
  if (!ancestor) return Infinity;
  
  let depth1 = 0;
  let current = element1;
  while (current && current !== ancestor) {
    depth1++;
    current = current.parentElement;
  }
  
  let depth2 = 0;
  current = element2;
  while (current && current !== ancestor) {
    depth2++;
    current = current.parentElement;
  }
  
  return depth1 + depth2;
}

function groupElementsByHierarchy(elements) {
  // Clear cache for fresh grouping
  elementCache.clear();
  
  // Create element groups based on DOM hierarchy
  const groups = [];
  const processedElements = new Set();
  
  for (let i = 0; i < elements.length; i++) {
    if (processedElements.has(i)) continue;
    
    const currentElement = elements[i];
    const currentDOMElement = findDOMElementByInfo(currentElement);
    
    const group = {
      id: groups.length,
      elements: [{ ...currentElement, originalIndex: i }],
      domElements: currentDOMElement ? [currentDOMElement] : [],
      commonAncestor: currentDOMElement,
      minPosition: { ...currentElement.position },
      maxPosition: { 
        x: currentElement.position.x + currentElement.position.width,
        y: currentElement.position.y + currentElement.position.height
      }
    };
    
    processedElements.add(i);
    
    // Find related elements (same parent hierarchy)
    for (let j = i + 1; j < elements.length; j++) {
      if (processedElements.has(j)) continue;
      
      const otherElement = elements[j];
      const otherDOMElement = findDOMElementByInfo(otherElement);
      
      if (!currentDOMElement || !otherDOMElement) continue;
      
      const depth = getAncestorDepth(currentDOMElement, otherDOMElement);
      
      // Group elements that are closely related in the DOM (within 4 levels)
      if (depth <= 4) {
        group.elements.push({ ...otherElement, originalIndex: j });
        group.domElements.push(otherDOMElement);
        processedElements.add(j);
        
        // Update group bounds
        group.minPosition.x = Math.min(group.minPosition.x, otherElement.position.x);
        group.minPosition.y = Math.min(group.minPosition.y, otherElement.position.y);
        group.maxPosition.x = Math.max(group.maxPosition.x, otherElement.position.x + otherElement.position.width);
        group.maxPosition.y = Math.max(group.maxPosition.y, otherElement.position.y + otherElement.position.height);
        
        // Update common ancestor
        if (group.commonAncestor) {
          group.commonAncestor = findCommonAncestor(group.commonAncestor, otherDOMElement);
        }
      }
    }
    
    groups.push(group);
  }
  
  // Sort groups by position
  groups.sort((a, b) => {
    if (a.minPosition.y !== b.minPosition.y) {
      return a.minPosition.y - b.minPosition.y;
    }
    return a.minPosition.x - b.minPosition.x;
  });
  
  // Create flat list maintaining group order
  const flatElements = [];
  groups.forEach((group, groupIndex) => {
    group.elements.forEach((element, elementIndex) => {
      flatElements.push({
        ...element,
        groupId: groupIndex,
        groupIndex: elementIndex,
        isFirstInGroup: elementIndex === 0,
        isLastInGroup: elementIndex === group.elements.length - 1,
        groupSize: group.elements.length
      });
    });
  });
  
  return { groups, flatElements };
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

  const sortedElements = elements.sort((a, b) => {
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    return a.position.x - b.position.x;
  });

  // Group elements by hierarchical relationships
  const groupedElements = groupElementsByHierarchy(sortedElements);

  return {
    elements: groupedElements.flatElements,
    groups: groupedElements.groups,
    totalCount: sortedElements.length
  };
}

// Bounding box management
let boundingBoxes = [];
let groupBoundingBoxes = [];
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

function createGroupBoundingBox(group) {
  const box = document.createElement('div');
  
  // Group bounding box styling
  box.style.cssText = `
    position: absolute;
    left: ${group.minPosition.x - 5}px;
    top: ${group.minPosition.y - 5}px;
    width: ${group.maxPosition.x - group.minPosition.x + 10}px;
    height: ${group.maxPosition.y - group.minPosition.y + 10}px;
    border: 3px dashed #9C27B0;
    background: rgba(156, 39, 176, 0.05);
    pointer-events: none;
    box-sizing: border-box;
    border-radius: 8px;
  `;
  
  // Add group label
  const label = document.createElement('div');
  label.textContent = `Group ${group.id + 1} (${group.elements.length} items)`;
  label.style.cssText = `
    position: absolute;
    top: -25px;
    left: 0;
    background: #9C27B0;
    color: white;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: bold;
    border-radius: 4px;
    font-family: Arial, sans-serif;
    white-space: nowrap;
  `;
  
  box.appendChild(label);
  return box;
}

function showBoundingBoxes() {
  clearBoundingBoxes();
  
  const result = extractInteractiveElements();
  const container = createBoundingBoxContainer();
  
  // First, draw group bounding boxes (behind individual elements)
  if (result.groups && result.groups.length > 1) {
    result.groups.forEach(group => {
      if (group.elements.length > 1) { // Only show group boxes for groups with multiple elements
        const groupBox = createGroupBoundingBox(group);
        container.appendChild(groupBox);
        groupBoundingBoxes.push(groupBox);
      }
    });
  }
  
  // Then, draw individual element bounding boxes
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
  groupBoundingBoxes = [];
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