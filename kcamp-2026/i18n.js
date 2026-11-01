/* K-CAMP offline multilingual interface, no third-party translation requests.
   Static survey wording is translated; user-entered personal information is never sent to a translator. */
(function () {
  "use strict";
  const supported = ["ko", "en", "zh-CN", "vi", "uz", "mn", "ru", "ar", "id", "ur"];
  const codes = ["ko", "en", "zh-CN", "vi", "uz", "mn", "ru", "ar", "id", "ur"];
  const translations = Object.fromEntries(codes.map(code => [code, new Map()]));
  const rows = window.KCAMP_TRANSLATION_ROWS || [];
  const extraRows = window.KCAMP_EXTRA_LANG_ROWS || [];

  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 7) continue;
    for (let i = 1; i < 7; i++) {
      if (row[i] && row[i] !== row[0]) translations[codes[i]].set(row[0], row[i]);
    }
  }
  const extraCodes = ["ar", "id", "ur"];
  for (const row of extraRows) {
    if (!Array.isArray(row) || row.length !== 4) continue;
    extraCodes.forEach((lang, i) => {
      if (row[i+1] && row[i+1] !== row[0]) translations[lang].set(row[0], row[i+1]);
    });
  }

  function detectLanguage() {
    let saved = "";
    try { saved = localStorage.getItem("kcamp-language") || ""; } catch (_) {}
    if (supported.includes(saved)) return saved;
    const preferences = Array.from(navigator.languages || [navigator.language || "ko"]);
    for (const pref of preferences) {
      const low = String(pref).toLowerCase();
      if (low.startsWith("ar")) return "ar";
      if (low.startsWith("id") || low.startsWith("in-ID")) return "id";
      if (low.startsWith("ur")) return "ur";
      if (low.startsWith("zh")) return "zh-CN";
      if (low.startsWith("vi")) return "vi";
      if (low.startsWith("uz")) return "uz";
      if (low.startsWith("mn")) return "mn";
      if (low.startsWith("ru")) return "ru";
      if (low.startsWith("en")) return "en";
      if (low.startsWith("ko")) return "ko";
    }
    return "ko";
  }

  let selected = detectLanguage();
  const originalNodes = new WeakMap();
  const originalAttributes = new WeakMap();
  const suffixes = [" →", " ↗", " ←"];
  let busy = false;
  let scheduled = false;

  function translateText(phrase) {
    if (typeof phrase !== "string" || selected === "ko") return phrase;
    const dict = translations[selected];
    if (!dict) return phrase;
    const raw = phrase.trim();
    if (!raw) return phrase;
    let found = dict.get(raw);
    if (!found) {
      for (const suffix of suffixes) {
        if (raw.endsWith(suffix) && dict.has(raw.slice(0, -suffix.length))) {
          found = dict.get(raw.slice(0, -suffix.length)) + suffix;
          break;
        }
      }
    }
    if (!found && raw.startsWith("← ")) {
      const rest = raw.slice(2);
      if (dict.has(rest)) found = "← " + dict.get(rest);
    }
    if (!found) {
      const match = raw.match(/^(\d+)% 완료$/);
      if (match) found = match[1] + (dict.get("% 완료") || "% complete");
    }
    if (!found) {
      const match = raw.match(/^(.+?) 응답 상세$/);
      if (match) found = match[1] + " · " + (dict.get("응답 상세") || "Response details");
    }
    if (!found) return phrase;
    const start = phrase.match(/^\s*/)?.[0] || "";
    const end = phrase.match(/\s*$/)?.[0] || "";
    return start + found + end;
  }

  function translateNode(node) {
    if (!node.nodeValue || !node.nodeValue.trim()) return;
    const parent = node.parentElement;
    if (parent && parent.closest("script,style,noscript,textarea,option,[data-no-translate]")) return;
    const base = originalNodes.has(node) ? originalNodes.get(node) : node.nodeValue;
    if (!originalNodes.has(node)) originalNodes.set(node, base);
    const result = translateText(base);
    if (node.nodeValue !== result) node.nodeValue = result;
  }

  function translateAttributes(element) {
    if (!element.matches("input,textarea,select,button,[title]")) return;
    if (element.closest("[data-no-translate]")) return;
    if (!originalAttributes.has(element)) {
      originalAttributes.set(element, {
        placeholder: element.getAttribute("placeholder"),
        title: element.getAttribute("title"),
        ariaLabel: element.getAttribute("aria-label")
      });
    }
    const original = originalAttributes.get(element);
    for (const [name, source] of Object.entries({
      placeholder: original.placeholder,
      title: original.title,
      "aria-label": original.ariaLabel
    })) {
      if (source === null) continue;
      const translated = translateText(source);
      if (element.getAttribute(name) !== translated) element.setAttribute(name, translated);
    }
  }

  function updatePage() {
    if (busy || !document.body) return;
    busy = true;
    try {
      document.documentElement.lang = selected;
      document.documentElement.dir = (selected === "ar" || selected === "ur") ? "rtl" : "ltr";
      document.title = translateText("K-유학생 취업캠프");
      const select = document.getElementById("kcamp-language");
      if (select && select.value !== selected) select.value = selected;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) translateNode(node);
      document.body.querySelectorAll("input,textarea,select,button,[title]").forEach(translateAttributes);
      // Explicit canonical keys prevent question labels from retaining a previously selected language.
      document.body.querySelectorAll("[data-camp-source]").forEach(function (el) {
        const encoded = el.getAttribute("data-camp-source");
        if (!encoded) return;
        let original = encoded;
        try { original = decodeURIComponent(encoded); } catch (_) {}
        const translated = translateText(original);
        if (el.textContent !== translated) el.textContent = translated;
      });
    } finally {
      busy = false;
    }
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(function () {
      scheduled = false;
      updatePage();
    });
  }

  function switchLanguage(code) {
    if (!supported.includes(code)) return;
    selected = code;
    try { localStorage.setItem("kcamp-language", code); } catch (_) {}
    if (typeof window.kcampRerender === "function") window.kcampRerender();
    updatePage();
  }

  window.kcampTranslate = translateText;
  window.kcampLanguage = () => selected;
  window.kcampSwitchLanguage = switchLanguage;

  function initialize() {
    const select = document.getElementById("kcamp-language");
    if (select) {
      select.value = selected;
      select.addEventListener("change", () => switchLanguage(select.value));
    }
    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    updatePage();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();