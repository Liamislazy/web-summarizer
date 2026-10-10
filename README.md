# Web Summarizer (Chrome extension)

> **Note:** This is a personal tool I vibe coded (built quickly with an AI coding assistant) for my own future use.
> It works for what I need, but it hasn't been carefully reviewed or hardened — use it at your own risk and expect rough edges.

A small Chrome extension that summarizes web content with Claude. Pick what to summarize:

| Mode | What it reads |
| --- | --- |
| **Visible screen** | Only the text currently visible in your browser window |
| **Whole page** | All text on the current page (prefers the main article area) |
| **Whole website** | The current page plus up to N same-site pages linked from it (default 15, content links first) |

Summaries stream in as Markdown with a TL;DR and key points, in **Short / Medium / Detailed** length. The last summary for a page is remembered, so closing the popup mid-summary doesn't lose it.

## Install (unpacked)

1. Clone or download this repo.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder.
4. The settings page opens on first install: paste your **Anthropic API key** (get one at <https://console.anthropic.com/settings/keys>) and click **Save**.
5. Pin the extension, open any page, and click the icon (or press **Alt+S**).

## Settings

- **Model** — Claude Opus 5.5 (default, best quality), Sonnet 5.5, or Haiku 5.5 (fastest/cheapest — good for "Whole website").
- **Max pages** — how many pages "Whole website" crawls (2–50).
- **Summary language** — leave blank to match the page, or e.g. `Vietnamese`.

## How it works

- `extract.js` — functions injected into the tab via `chrome.scripting` to read visible text, the full page, or crawl same-origin links (fetched from the page itself, 4 at a time).
- `background.js` — service worker that calls the Claude Messages API with streaming and sends text back to the popup. Page text is wrapped in `<document>` tags and the model is told not to follow instructions inside it.
- `popup.*` — the UI; `options.*` — the settings page; `settings.js` — shared defaults.

Permissions are minimal: `activeTab` + `scripting` (only touches the tab when you click the button), `storage`, and network access to `api.anthropic.com`.

## Notes and limits

- **Your API key is stored in `chrome.storage.local`** in plain form and only sent to `api.anthropic.com`. Fine for a personal tool; don't install this on a shared computer.
- **It costs API credits.** "Whole website" can send a lot of text (capped at ~500k characters ≈ 125k tokens per request). Use Haiku if you summarize big sites often.
- Chrome blocks extensions on `chrome://` pages, the Chrome Web Store, and the built-in PDF viewer.
- "Whole website" only follows links found on the current page (one level deep), not a full sitemap crawl. Pages rendered only by JavaScript may come back mostly empty.

## Ideas for later

- Right-click "Summarize selection"
- Side panel instead of popup
- Ask follow-up questions about the page
- Export summary to Markdown file
