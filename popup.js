document.addEventListener('DOMContentLoaded', function() {
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  const jsonViewEl = document.getElementById('jsonView');
  const listViewEl = document.getElementById('listView');
  const elementCountEl = document.getElementById('elementCount');
  const refreshBtn = document.getElementById('refreshBtn');
  const copyBtn = document.getElementById('copyBtn');
  const clearBoxesBtn = document.getElementById('clearBoxesBtn');
  const jsonViewBtn = document.getElementById('jsonViewBtn');
  const listViewBtn = document.getElementById('listViewBtn');

  let currentData = null;
  let jsonViewer = null;
  let currentView = 'json';

  function initJsonViewer() {
    if (!jsonViewer) {
      jsonViewer = new JSONViewer(jsonViewEl);
    }
  }

  function showLoading() {
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    jsonViewEl.style.display = 'none';
    listViewEl.style.display = 'none';
  }

  function showError(message) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.textContent = message;
    jsonViewEl.style.display = 'none';
    listViewEl.style.display = 'none';
    elementCountEl.textContent = 'Error loading elements';
  }

  function showData(data) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'none';
    currentData = data;
    
    elementCountEl.textContent = `Found ${data.totalCount} interactive element${data.totalCount !== 1 ? 's' : ''} visible on screen`;
    
    if (currentView === 'json') {
      showJsonView();
    } else {
      showListView();
    }
  }

  function showJsonView() {
    jsonViewEl.style.display = 'block';
    listViewEl.style.display = 'none';
    
    if (currentData.totalCount === 0) {
      jsonViewEl.innerHTML = '<div style="text-align: center; padding: 40px 0; color: #666;">No interactive elements found on this page.</div>';
      return;
    }

    initJsonViewer();
    jsonViewer.render(currentData.elements, true);
  }

  function showListView() {
    jsonViewEl.style.display = 'none';
    listViewEl.style.display = 'block';
    
    if (currentData.totalCount === 0) {
      listViewEl.innerHTML = '<div style="text-align: center; padding: 40px 0; color: #666;">No interactive elements found on this page.</div>';
      return;
    }

    listViewEl.innerHTML = currentData.elements.map((element, index) => {
      const details = [];
      
      // Show element type
      if (element.elementType) {
        const typeColor = element.elementType === 'interactive' ? '#1565c0' : '#2e7d32';
        details.push(`<span class="element-detail"><span class="detail-label">Type:</span> <span style="color: ${typeColor}; font-weight: 500;">${element.elementType}</span></span>`);
      }
      
      if (element.type) {
        details.push(`<span class="element-detail"><span class="detail-label">Input Type:</span> ${element.type}</span>`);
      }
      
      if (element.id) {
        details.push(`<span class="element-detail"><span class="detail-label">ID:</span> ${element.id}</span>`);
      }
      
      if (element.href) {
        details.push(`<span class="element-detail"><span class="detail-label">URL:</span> ${element.href}</span>`);
      }
      
      
      details.push(`<span class="element-detail position"><span class="detail-label">Position:</span> (${element.position.x}, ${element.position.y})</span>`);

      const tagColor = element.elementType === 'interactive' ? '#e3f2fd' : '#e8f5e8';
      const tagTextColor = element.elementType === 'interactive' ? '#1565c0' : '#2e7d32';

      return `
        <div class="element-item">
          <div class="element-tag" style="background: ${tagColor}; color: ${tagTextColor};">${index + 1}. ${element.tagName}</div>
          <div class="element-title">${escapeHtml(element.title)}</div>
          <div class="element-details">
            ${details.join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  function switchView(view) {
    currentView = view;
    
    // Update button states
    document.querySelectorAll('.view-toggle').forEach(btn => {
      btn.classList.remove('active');
    });
    
    if (view === 'json') {
      jsonViewBtn.classList.add('active');
      if (currentData) showJsonView();
    } else {
      listViewBtn.classList.add('active');
      if (currentData) showListView();
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function extractElements() {
    showLoading();
    
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (chrome.runtime.lastError) {
        showError('Error accessing current tab: ' + chrome.runtime.lastError.message);
        return;
      }

      if (!tabs[0]) {
        showError('No active tab found');
        return;
      }

      // Show bounding boxes and extract elements at the same time
      chrome.tabs.sendMessage(tabs[0].id, { action: 'showBoundingBoxes' }, function(response) {
        if (chrome.runtime.lastError) {
          showError('Error communicating with page. Please refresh the page and try again.');
          return;
        }

        if (!response) {
          showError('No response from content script. Please refresh the page and try again.');
          return;
        }

        if (response.success) {
          showData(response.data);
        } else {
          showError('Error extracting elements: ' + (response.error || 'Unknown error'));
        }
      });
    });
  }

  function copyToClipboard() {
    if (!currentData) {
      alert('No data to copy. Please refresh first.');
      return;
    }
    
    try {
      const cleanedData = {
        elements: currentData.elements.map(element => {
          const { className, ...cleanElement } = element;
          return cleanElement;
        }),
        totalCount: currentData.totalCount
      };
      
      const jsonString = JSON.stringify(cleanedData, null, 2);
      navigator.clipboard.writeText(jsonString).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        copyBtn.style.background = '#4caf50';
        
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = '#1976d2';
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy: ', err);
        alert('Failed to copy to clipboard');
      });
    } catch (error) {
      console.error('Error stringifying data: ', error);
      alert('Error preparing data for copy');
    }
  }

  function clearBoundingBoxes() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (chrome.runtime.lastError) {
        console.error('Error accessing current tab:', chrome.runtime.lastError.message);
        return;
      }

      if (!tabs[0]) {
        console.error('No active tab found');
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { action: 'clearBoundingBoxes' }, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Error communicating with page:', chrome.runtime.lastError.message);
          return;
        }

        if (response && response.success) {
          console.log('Bounding boxes cleared successfully');
        } else {
          console.error('Failed to clear bounding boxes');
        }
      });
    });
  }

  // Event listeners
  refreshBtn.addEventListener('click', extractElements);
  copyBtn.addEventListener('click', copyToClipboard);
  clearBoxesBtn.addEventListener('click', clearBoundingBoxes);
  jsonViewBtn.addEventListener('click', () => switchView('json'));
  listViewBtn.addEventListener('click', () => switchView('list'));
  
  extractElements();
});