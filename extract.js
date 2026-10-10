// Functions injected into the active tab with chrome.scripting.executeScript.
// Each one must be self-contained: it is serialized and runs in the page,
// so it cannot reference anything else in this file.

// Text that is currently visible inside the viewport.
function extractVisibleText() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const blockTags = /^(P|DIV|LI|H[1-6]|TD|TH|PRE|BLOCKQUOTE|SECTION|ARTICLE|DT|DD|FIGCAPTION|TR)$/;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const el = node.parentElement;
      if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) return NodeFilter.FILTER_REJECT;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const range = document.createRange();
  const parts = [];
  let lastBlock = null;
  let node;
  while ((node = walker.nextNode())) {
    range.selectNodeContents(node);
    const visible = Array.from(range.getClientRects()).some(
      (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw
    );
    if (!visible) continue;

    let block = node.parentElement;
    while (block && block !== document.body && !blockTags.test(block.tagName)) block = block.parentElement;
    if (lastBlock && block !== lastBlock) parts.push("\n");
    else if (parts.length) parts.push(" ");
    parts.push(node.nodeValue.replace(/\s+/g, " ").trim());
    lastBlock = block;
  }

  return {
    url: location.href,
    title: document.title,
    pages: [{ url: location.href, title: document.title, text: parts.join("").replace(/\n{3,}/g, "\n\n").trim() }],
  };
}

// The whole current page (all rendered text, not just the viewport).
function extractFullPage() {
  const candidates = [document.querySelector("article"), document.querySelector("main"), document.querySelector("[role=main]")];
  const bodyText = document.body.innerText || "";
  let text = bodyText;
  for (const el of candidates) {
    // Prefer the main content area if it holds most of the page's text.
    if (el && el.innerText && el.innerText.length > bodyText.length * 0.5) {
      text = el.innerText;
      break;
    }
  }
  return {
    url: location.href,
    title: document.title,
    pages: [{ url: location.href, title: document.title, text: text.replace(/\n{3,}/g, "\n\n").trim() }],
  };
}

// The current page plus up to `maxPages - 1` same-site pages linked from it.
async function extractWholeSite(maxPages, perPageChars) {
  const clean = (s) => s.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const skipExt = /\.(pdf|zip|gz|rar|7z|jpe?g|png|gif|webp|svg|ico|mp3|mp4|webm|mov|avi|css|js|json|xml|rss|exe|dmg|apk)$/i;

  const here = new URL(location.href);
  here.hash = "";
  const seen = new Set([here.href]);
  const links = [];
  // Content links first, menus/footers last, so a small page budget goes to real content.
  const anchors = Array.from(document.querySelectorAll("a[href]"));
  const rank = (a) => (a.closest("main, article, [role=main]") ? 0 : a.closest("nav, header, footer, aside, [role=navigation]") ? 2 : 1);
  anchors.sort((a, b) => rank(a) - rank(b));
  for (const a of anchors) {
    let u;
    try {
      u = new URL(a.getAttribute("href"), location.href);
    } catch {
      continue;
    }
    if (u.origin !== here.origin || !/^https?:$/.test(u.protocol) || skipExt.test(u.pathname)) continue;
    u.hash = "";
    if (seen.has(u.href)) continue;
    seen.add(u.href);
    links.push(u.href);
  }

  const pages = [
    { url: here.href, title: document.title, text: clean(document.body.innerText || "").slice(0, perPageChars) },
  ];
  const queue = links.slice(0, Math.max(0, maxPages - 1));
  const failed = [];

  async function fetchPage(url) {
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      const type = res.headers.get("content-type") || "";
      if (!res.ok || !type.includes("text/html")) throw new Error(`HTTP ${res.status}`);
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      doc.querySelectorAll("script,style,noscript,template,svg,nav,footer,header,iframe").forEach((n) => n.remove());
      const root = doc.querySelector("article") || doc.querySelector("main") || doc.body;
      const text = clean(root ? root.textContent : "");
      if (text) pages.push({ url, title: doc.title || url, text: text.slice(0, perPageChars) });
    } catch (e) {
      failed.push(url);
    }
  }

  // Small worker pool so we don't hammer the site.
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) await fetchPage(queue.shift());
  });
  await Promise.all(workers);

  return {
    url: here.href,
    title: document.title,
    pages,
    linksFound: links.length,
    failed: failed.length,
  };
}
