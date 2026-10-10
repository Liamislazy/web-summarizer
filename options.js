const $ = (id) => document.getElementById(id);

(async () => {
  const s = await loadSettings();
  for (const m of MODELS) $("model").add(new Option(m.label, m.id));
  $("apiKey").value = s.apiKey;
  $("model").value = s.model;
  $("maxPages").value = s.maxPages;
  $("language").value = s.language;
})();

$("save").addEventListener("click", async () => {
  const maxPages = Math.min(50, Math.max(2, parseInt($("maxPages").value, 10) || 15));
  $("maxPages").value = maxPages;
  await saveSettings({
    apiKey: $("apiKey").value.trim(),
    model: $("model").value,
    maxPages,
    language: $("language").value.trim(),
  });
  $("saved").hidden = false;
  setTimeout(() => ($("saved").hidden = true), 1500);
});
