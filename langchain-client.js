// LangChain Server Client for Chrome Extension

class LangChainClient {
  constructor(serverUrl = 'http://localhost:3001') {
    this.serverUrl = serverUrl;
    this.sessionId = null;
    this.isConnected = false;
  }

  async checkHealth() {
    try {
      const response = await fetch(`${this.serverUrl}/health`);
      const data = await response.json();
      this.isConnected = response.ok;
      return { success: response.ok, data };
    } catch (error) {
      console.error('❌ Server health check failed:', error);
      this.isConnected = false;
      return { success: false, error: error.message };
    }
  }

  async createSession() {
    try {
      const response = await fetch(`${this.serverUrl}/agent/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.statusText}`);
      }

      const data = await response.json();
      this.sessionId = data.sessionId;
      console.log(`✅ Created LangChain session: ${this.sessionId}`);

      return { success: true, sessionId: this.sessionId };
    } catch (error) {
      console.error('❌ Failed to create session:', error);
      return { success: false, error: error.message };
    }
  }

  async executeTask(task, elements = []) {
    if (!this.sessionId) {
      const sessionResult = await this.createSession();
      if (!sessionResult.success) {
        return sessionResult;
      }
    }

    try {
      console.log(`🎯 Executing LangChain task: "${task}"`);
      console.log(`📋 Elements provided: ${elements.length}`);

      const response = await fetch(`${this.serverUrl}/agent/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          task,
          elements: elements.map(el => ({
            tagName: el.tagName,
            title: el.title,
            type: el.type,
            elementType: el.elementType,
            id: el.id,
            className: el.className
          }))
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ LangChain task completed. Actions: ${result.actions?.length || 0}`);

      return result;
    } catch (error) {
      console.error('❌ Task execution failed:', error);
      return { success: false, error: error.message };
    }
  }

  async getSessionStatus() {
    if (!this.sessionId) {
      return { success: false, error: 'No active session' };
    }

    try {
      const response = await fetch(`${this.serverUrl}/agent/session/${this.sessionId}`);
      const data = await response.json();
      return { success: response.ok, data };
    } catch (error) {
      console.error('❌ Failed to get session status:', error);
      return { success: false, error: error.message };
    }
  }

  // Convert LangChain actions to extension actions
  translateAction(langchainAction) {
    const toolToAction = {
      'click_element': {
        action: 'click',
        elementIndex: langchainAction.args?.elementIndex || 0,
        message: langchainAction.args?.reasoning || 'Clicking element'
      },
      'enter_text': {
        action: 'enterText',
        elementIndex: langchainAction.args?.elementIndex || 0,
        text: langchainAction.args?.text || '',
        message: langchainAction.args?.reasoning || 'Entering text'
      },
      'scroll_page': {
        action: langchainAction.args?.direction === 'horizontal' ? 'scrollX' : 'scrollY',
        amount: langchainAction.args?.amount || 300,
        message: langchainAction.args?.reasoning || 'Scrolling page'
      },
      'wait': {
        action: 'wait',
        duration: langchainAction.args?.duration || 1000,
        message: langchainAction.args?.reasoning || 'Waiting'
      },
      'complete_task': {
        action: 'none',
        message: langchainAction.args?.reasoning || 'Task completed'
      }
    };

    return toolToAction[langchainAction.tool] || {
      action: 'none',
      message: 'Unknown action type'
    };
  }
}

// Make available globally
window.LangChainClient = LangChainClient;