const $ = (id) => document.getElementById(id);
const PER_PAGE_CHARS = 40_000;

let currentTab = null;
let rawText = "";
let renderQueued = false;

init();

async function init() {
  const settings = await loadSettings();
  $("length").value = settings.length;

  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Show the last summary again if the popup was closed while on this page.
  const { lastSummary } = await chrome.storage.local.get("lastSummary");
  if (lastSummary && currentTab && lastSummary.url === currentTab.url) {
    showResult(lastSummary.text);
    setMeta(lastSummary);
    document.querySelector(`input[name=mode][value=${lastSummary.mode}]`).checked = true;
  }

  $("go").addEventListener("click", summarize);
  $("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("length").addEventListener("change", () => saveSettings({ length: $("length").value }));
  $("copy").addEventListener("click", async () => {
    await navigator.clipboard.writeText(rawText);
    $("copy").textContent = "Copied!";
    setTimeout(() => ($("copy").textContent = "Copy"), 1200);
  });
}

async function summarize() {
  const mode = document.querySelector("input[name=mode]:checked").value;
  const settings = await loadSettings();

  if (!settings.apiKey) {
    setStatus("No API key yet. Click the ⚙ button to add your DeepSeek API key.", true);
    return;
  }
  if (!currentTab || !/^https?:/.test(currentTab.url || "")) {
    setStatus("Chrome doesn't let extensions read this kind of page (chrome://, Web Store, PDFs viewer...).", true);
    return;
  }

  $("go").disabled = true;
  $("output").hidden = true;
  $("actions").hidden = true;
  rawText = "";

  let extracted;
  try {
    setStatus(mode === "site" ? `Crawling up to ${settings.maxPages} pages of this site…` : "Reading the page…");
    const func = { visible: extractVisibleText, page: extractFullPage, site: extractWholeSite }[mode];
    const args = mode === "site" ? [settings.maxPages, PER_PAGE_CHARS] : [];
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: currentTab.id }, func, args });
    extracted = result;
  } catch (e) {
    setStatus(`Couldn't read the page: ${e.message}`, true);
    $("go").disabled = false;
    return;
  }

  const totalChars = extracted.pages.reduce((n, p) => n + p.text.length, 0);
  if (!totalChars) {
    setStatus("Found no readable text here.", true);
    $("go").disabled = false;
    return;
  }

  let info = `${extracted.pages.length} page(s), ~${Math.round(totalChars / 4).toLocaleString()} tokens`;
  if (mode === "site" && extracted.linksFound + 1 > extracted.pages.length) {
    info += ` (site links found: ${extracted.linksFound}${extracted.failed ? `, ${extracted.failed} failed` : ""})`;
  }
  setStatus(`Summarizing ${info}…`);

  const port = chrome.runtime.connect({ name: "summarize" });
  port.onMessage.addListener((msg) => {
    if (msg.type === "delta") {
      rawText += msg.text;
      $("output").hidden = false;
      queueRender();
    } else if (msg.type === "note") {
      info += ` · ${msg.message}`;
    } else if (msg.type === "done") {
      showResult(msg.text);
      setStatus("");
      $("meta").textContent = info;
      $("go").disabled = false;
      port.disconnect();
    } else if (msg.type === "error") {
      setStatus(msg.message, true);
      $("go").disabled = false;
      port.disconnect();
    }
  });
  port.postMessage({ mode, url: currentTab.url, title: extracted.title, pages: extracted.pages, length: $("length").value });
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    $("output").innerHTML = renderMarkdown(rawText);
  });
}

function showResult(text) {
  rawText = text;
  $("output").innerHTML = renderMarkdown(text);
  $("output").hidden = false;
  $("actions").hidden = false;
}

function setStatus(text, isError = false) {
  $("status").textContent = text;
  $("status").hidden = !text;
  $("status").classList.toggle("error", isError);
}

function setMeta(s) {
  const model = MODELS.find((m) => m.id === s.model)?.label.split(" (")[0] || s.model;
  $("meta").textContent = `${model} · ${new Date(s.at).toLocaleString()}`;
}

// Tiny Markdown renderer: headings, lists, bold/italic, inline code. HTML is escaped first.
function renderMarkdown(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, "$1<em>$2</em>");

  const out = [];
  let list = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };

  for (const line of md.split("\n")) {
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) {
      closeList();
      const level = Math.min(m[1].length + 1, 4);
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)/))) {
      if (list !== "ul") (closeList(), out.push("<ul>"), (list = "ul"));
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
      if (list !== "ol") (closeList(), out.push("<ol>"), (list = "ol"));
      out.push(`<li>${inline(m[1])}</li>`);
    } else if (line.trim()) {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    } else {
      closeList();
    }
  }
  closeList();
  return out.join("");
}
