// Shared defaults for popup, options page and background worker.
const DEFAULT_SETTINGS = {
  apiKey: "",
  model: "claude-opus-5-5",
  maxPages: 15,
  length: "medium",
  language: "",
};

const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (best quality)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (balanced)" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fastest, cheapest)" },
];

async function loadSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function saveSettings(patch) {
  await chrome.storage.local.set(patch);
}
