# Chrome Agent

A Chrome extension that gives an LLM tools to operate your browser. Works with **OpenAI** and **Anthropic**; opens as a side panel next to any tab.

[![Demo Video](https://img.youtube.com/vi/Gx77TAwx_24/hqdefault.jpg)](https://youtu.be/Gx77TAwx_24)

The agent can:

- Read the page (DOM, interactive elements, text search)
- Click, type, scroll, press keys
- Take screenshots (vision-enabled models)
- Run JavaScript in the page
- Open / switch / close / navigate tabs
- Type into canvas-based editors (Google Docs, Figma, Monaco) via the Chrome DevTools Protocol

While a task is running, the active tab gets a subtle glowing border so you know the agent is in control.

## Prerequisites

- Node.js 18+
- Chrome 120+ (for the side panel API)
- An API key from [OpenAI](https://platform.openai.com/api-keys) or [Anthropic](https://console.anthropic.com/settings/keys)

## Build

```bash
npm install
npm run build
```

The built extension lands in `dist/`.

For live-reloading development:

```bash
npm run dev
```

## Load in Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select the `dist/` folder inside this repo

The extension's action icon should now appear in your toolbar. Click it to open the side panel.

## Configure your API key

1. Open the side panel (click the extension icon)
2. Click the ⚙️ gear in the top-right
3. Choose your **Provider** (OpenAI or Anthropic)
4. Pick a **Model**
5. Paste your **API key** → **Save**
6. *(Optional)* Adjust **Max steps per run** — how many tool-calling rounds the agent can take before it stops (default 100)

Keys are stored in `chrome.storage.local` on your machine only.

The ⬅ back arrow returns you to the chat. Ask for something — "search anthropic on wikipedia", "summarize this page", "fill this form with …" — and go.

## Tips

- **Vision toggle** (eye icon on the composer): lets the agent take screenshots and actually see pixels. Turn it off to force DOM-only recon (cheaper, faster).
- **Canvas editors** (Google Docs etc.): the agent uses the Chrome Debugger API to dispatch real input events. A yellow *"controlled by automated software"* banner will appear briefly while it types — this is expected.
- **Stop a run**: hit the red stop button in the composer.
- **Reload the extension**: after a reload, tabs you had open get fresh content scripts re-injected automatically, so you don't have to refresh every page.

## Project layout

```
src/
  background/      service worker — agent loop, tools, CDP input
  content/         content script — DOM ops, text search, glow overlay
  sidebar/         React UI (Tailwind) — chat, tool cards, settings
  shared/          types shared across worker/content/sidebar
manifest.json      MV3 manifest
vite.config.ts     bundles everything via @crxjs/vite-plugin
```

## License

Released under the MIT License. See [LICENSE](LICENSE) for the full text.

```
MIT License

Copyright (c) 2026 Hasaan Ahmed

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
