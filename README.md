# LangChain Web Agent

An advanced Chrome extension that uses **real LangChain** running on an Express server for intelligent web automation and task completion.

## Features

### 🤖 Dual Agent Modes
- **LangChain Server Mode**: Real LangChain with LangGraph running on Express server
- **Traditional Mode**: Direct action-verification loop for simpler tasks (fallback)

### 🧠 Enhanced Intelligence
- **Real LangChain Integration**: Uses actual @langchain/langgraph for sophisticated reasoning
- **Tool-Based Actions**: Structured approach with 5 specialized tools
- **Multi-Step Planning**: Server plans entire task sequence before execution
- **Context Awareness**: Maintains conversation history across sessions

### 🔧 Core Capabilities
- Click on any interactive element
- Enter text into forms and inputs
- Scroll to reveal content
- Wait for dynamic content loading
- Complete task confirmation
- Real-time action feedback

## Setup Instructions

### 1. Install & Start LangChain Server

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Start the server (with dummy OpenAI key for testing)
OPENAI_API_KEY=dummy node server.js
```

The server will start on `http://localhost:3001`

### 2. Install Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the main project directory
4. The extension will appear in your Chrome sidebar

## Usage

1. **Start the server first** (see setup instructions above)
2. Navigate to any webpage
3. Click the extension icon to open the sidebar
4. Ensure "LangChain Mode" is enabled (should show server connection)
5. Enter your automation task in natural language
6. Watch the LangChain server plan and execute actions step-by-step

### Example Tasks

```
"Search for 'artificial intelligence' on this page"
"Fill out the contact form with my information"
"Navigate to the pricing section"
"Find and click the download button"
"Sign up for the newsletter"
```

## Architecture

### LangChain Integration

The extension uses a mock LangChain implementation optimized for Chrome extensions:

- **StateGraph**: Manages agent workflow and state
- **Tools**: Structured web interaction capabilities
- **Messages**: Conversation history and context
- **Reasoning**: Step-by-step task decomposition

### Agent Tools

1. **click_element**: Click on buttons, links, and interactive elements
2. **enter_text**: Input text into forms and fields
3. **scroll_page**: Navigate through content
4. **extract_elements**: Analyze page structure
5. **wait**: Handle dynamic content loading
6. **analyze_page**: Get intelligent page insights

### Fallback System

If LangChain mode encounters issues, the system automatically falls back to the traditional agent for reliability.

## Configuration

### Models Supported
- Llama 4 Maverick
- GPT-OSS 120B
- Llama 3.3 70B
- Mixtral 8x7B

### Settings
- Bounding box visualization
- Agent mode toggle
- Model selection
- Screenshot capture (when needed)

## Technical Details

### File Structure
```
├── manifest.json              # Extension configuration
├── background.js              # Service worker
├── content.js                 # DOM interaction layer
├── sidebar.html               # User interface
├── sidebar-panel.js           # UI logic
├── recursive-agent.js         # Enhanced agent coordinator
├── langchain-agent.js         # LangChain implementation
├── install-dependencies.js    # Mock LangChain dependencies
└── package.json              # Dependencies reference
```

### Key Improvements

1. **Structured Thinking**: LangChain agents reason through problems systematically
2. **Tool-Based Architecture**: Clean separation of capabilities
3. **Better Error Handling**: Graceful fallbacks and retry mechanisms
4. **Enhanced Persistence**: Multi-step task completion
5. **Adaptive Strategies**: Dynamic approach selection

## Development

### Testing LangChain Mode

1. Enable the extension
2. Navigate to a test webpage
3. Toggle "LangChain Mode" on
4. Try complex multi-step tasks
5. Monitor console for detailed reasoning logs

### Debugging

- Open Chrome DevTools on any page
- Check the Console tab for agent reasoning
- Look for "Mock LangGraph executing" messages
- Monitor tool execution flow

## API Keys

Update the Groq API key in `background.js`:

```javascript
const API_KEY = "your-groq-api-key-here";
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Test with both agent modes
4. Submit a pull request

## Future Enhancements

- Real LangChain.js integration when available for extensions
- Additional tool types
- Advanced reasoning capabilities
- Multi-tab coordination
- Custom workflow creation

---

**Note**: This implementation uses mock LangChain dependencies optimized for Chrome extensions. The reasoning patterns and tool-based architecture follow LangChain principles while maintaining compatibility with the Chrome extension environment.