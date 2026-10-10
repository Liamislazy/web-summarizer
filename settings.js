// Shared defaults for popup, options page and background worker.
const DEFAULT_SETTINGS = {
  apiKey: "",
  model: "deepseek-flash",
  maxPages: 15,
  length: "medium",
  language: "",
};

const MODELS = [
  { id: "deepseek-flash", label: "DeepSeek V4.1 Flash (fast, cheap)" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro (higher quality)" },
];

async function loadSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  if (!MODELS.some((m) => m.id === settings.model)) settings.model = DEFAULT_SETTINGS.model;
  return settings;
}

async function saveSettings(patch) {
  await chrome.storage.local.set(patch);
}
