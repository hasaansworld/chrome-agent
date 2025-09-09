// Background script for Chat Assistant
chrome.action.onClicked.addListener((tab) => {
  // Send message to content script to toggle sidebar
  chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error sending message to content script:', chrome.runtime.lastError.message);
    }
  });
});