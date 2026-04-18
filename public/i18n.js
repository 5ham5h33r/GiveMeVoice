// Site-wide UI translation. Translates every element marked with
//   data-i18n              (its leading text, even if it has child elements)
//   data-i18n-placeholder  (the element's `placeholder` attribute)
//   data-i18n-aria         (the element's `aria-label` attribute)
// plus the document <title>.
//
// Strings are sent to /api/ui/translate which returns translations cached on
// disk so the OpenAI bill stays small. The chosen language is persisted in
// localStorage and reapplied on every page load (works on every page that
// loads i18n.js).
//
// Pages with content rendered by JS should call I18N.t("English string")
// when assigning text, and I18N.register([...]) once with the list of those
// dynamic strings so the bulk-fetch covers them too. They can also listen
// for the `i18n:applied` event on `document` to re-render anything dynamic.

const I18N = (() => {
  const STORAGE_KEY = "gmv-ui-lang";
  const SUPPORTED = [
    { code: "en", name: "English" },
    { code: "es", name: "Español" },
    { code: "hi", name: "हिन्दी" },
    { code: "zh", name: "中文" },
    { code: "vi", name: "Tiếng Việt" },
    { code: "ar", name: "العربية" },
    { code: "tl", name: "Tagalog" },
  ];

  const state = {
    lang: "en",
    cache: { en: {} },
    dynamic: new Set(),
    snapshotted: false,
    inFlight: null,
  };

  // Load cached translations from previous sessions.
  try {
    const raw = localStorage.getItem("gmv-ui-cache");
    if (raw) Object.assign(state.cache, JSON.parse(raw));
  } catch {}

  function saveCache() {
    try {
      localStorage.setItem("gmv-ui-cache", JSON.stringify(state.cache));
    } catch {}
  }

  // Find leading non-empty text node on an element (so we can translate
  // a <label>'s "Your name" without nuking its child <input>).
  function leadingTextNode(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) return node;
    }
    return null;
  }
  function readSource(el) {
    let onlyText = true;
    let lead = null;
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!lead && node.nodeValue.trim()) lead = node;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        onlyText = false;
      }
    }
    if (onlyText) return el.textContent.trim();
    return lead ? lead.nodeValue.trim() : "";
  }
  function writeTranslated(el, translated) {
    let onlyText = true;
    let lead = null;
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!lead && node.nodeValue.trim()) lead = node;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        onlyText = false;
      }
    }
    if (onlyText) {
      el.textContent = translated;
    } else if (lead) {
      const m = lead.nodeValue.match(/^(\s*)[\s\S]*?(\s*)$/) || [];
      lead.nodeValue = (m[1] || "") + translated + (m[2] || "");
    } else {
      el.insertBefore(document.createTextNode(translated), el.firstChild);
    }
  }

  // Idempotent: only records sources for elements added since the last call.
  // This lets us call snapshotSources() again after JS appends new options or
  // dynamically marks new elements with data-i18n.
  function snapshotSources() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      if (!el.dataset.i18nSrc) el.dataset.i18nSrc = readSource(el);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      if (!el.dataset.i18nPhSrc) el.dataset.i18nPhSrc = el.getAttribute("placeholder") || "";
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      if (!el.dataset.i18nAriaSrc) el.dataset.i18nAriaSrc = el.getAttribute("aria-label") || "";
    });
    document.querySelectorAll("[data-i18n-value]").forEach((el) => {
      if (!el.dataset.i18nValSrc) el.dataset.i18nValSrc = el.value || "";
    });
    if (!document.body.dataset.i18nTitleSrc) document.body.dataset.i18nTitleSrc = document.title || "";
  }

  function collectAllSourceStrings() {
    const set = new Set();
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      if (el.dataset.i18nSrc) set.add(el.dataset.i18nSrc);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      if (el.dataset.i18nPhSrc) set.add(el.dataset.i18nPhSrc);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      if (el.dataset.i18nAriaSrc) set.add(el.dataset.i18nAriaSrc);
    });
    document.querySelectorAll("[data-i18n-value]").forEach((el) => {
      if (el.dataset.i18nValSrc) set.add(el.dataset.i18nValSrc);
    });
    if (document.body.dataset.i18nTitleSrc) set.add(document.body.dataset.i18nTitleSrc);
    state.dynamic.forEach((s) => set.add(s));
    return [...set].filter(Boolean);
  }

  async function fetchTranslations(lang, strings) {
    if (lang === "en") {
      state.cache.en = state.cache.en || {};
      strings.forEach((s) => (state.cache.en[s] = s));
      return;
    }
    state.cache[lang] = state.cache[lang] || {};
    const missing = strings.filter((s) => !(s in state.cache[lang]));
    if (!missing.length) return;
    try {
      const r = await fetch("/api/ui/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang, strings: missing }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      Object.assign(state.cache[lang], j.translations || {});
      saveCache();
    } catch (e) {
      console.error("UI translate failed:", e.message);
      // Leave strings untranslated — UI degrades to English instead of breaking.
    }
  }

  function applyDom() {
    document.documentElement.setAttribute("lang", state.lang);
    document.documentElement.setAttribute("dir", state.lang === "ar" ? "rtl" : "ltr");

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const src = el.dataset.i18nSrc;
      if (!src) return;
      writeTranslated(el, t(src));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const src = el.dataset.i18nPhSrc;
      if (!src) return;
      el.setAttribute("placeholder", t(src));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const src = el.dataset.i18nAriaSrc;
      if (!src) return;
      el.setAttribute("aria-label", t(src));
    });
    document.querySelectorAll("[data-i18n-value]").forEach((el) => {
      const src = el.dataset.i18nValSrc;
      if (!src) return;
      // Don't trample on input the user has already changed.
      if (el.dataset.i18nUserEdited === "1") return;
      el.value = t(src);
    });
    if (document.body.dataset.i18nTitleSrc) {
      document.title = t(document.body.dataset.i18nTitleSrc);
    }
    document.dispatchEvent(new CustomEvent("i18n:applied", { detail: { lang: state.lang } }));
  }

  function t(str) {
    if (!str) return str;
    if (state.lang === "en") return str;
    const tab = state.cache[state.lang];
    return (tab && tab[str]) || str;
  }

  function register(strings) {
    if (!strings) return;
    for (const s of strings) if (s) state.dynamic.add(s);
  }

  function setLoading(on) {
    document.querySelectorAll(".lang-control").forEach((el) => {
      el.classList.toggle("loading", !!on);
    });
  }

  async function setLanguage(lang) {
    if (!SUPPORTED.find((l) => l.code === lang)) lang = "en";
    state.lang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
    snapshotSources();
    const strings = collectAllSourceStrings();
    setLoading(true);
    state.inFlight = fetchTranslations(lang, strings).finally(() => {
      state.inFlight = null;
      setLoading(false);
    });
    await state.inFlight;
    applyDom();
  }

  // Public: pick up newly added translatable elements (e.g. dynamic <option>s)
  // and re-translate. Safe to call repeatedly.
  async function refresh() {
    snapshotSources();
    const strings = collectAllSourceStrings();
    await fetchTranslations(state.lang, strings);
    applyDom();
  }

  function mountSwitcher() {
    const el = document.getElementById("siteLang");
    if (!el) return;
    el.innerHTML = "";
    for (const { code, name } of SUPPORTED) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = name;
      el.appendChild(opt);
    }
    el.value = state.lang;
    el.addEventListener("change", () => setLanguage(el.value));
  }

  function init() {
    let stored = "en";
    try { stored = localStorage.getItem(STORAGE_KEY) || "en"; } catch {}
    snapshotSources();
    mountSwitcher();
    // Always run setLanguage so the dom + dir reflect the chosen language,
    // even if it's English (in case a previous render was non-English).
    setLanguage(stored);
  }

  document.addEventListener("DOMContentLoaded", init);

  return { t, register, setLanguage, refresh, get lang() { return state.lang; }, applyDom, snapshotSources };
})();

window.I18N = I18N;
