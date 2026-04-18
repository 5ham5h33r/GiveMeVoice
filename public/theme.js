// Light/dark theme toggle. The theme is applied as `data-theme` on <html>
// (we also set it via an inline script in <head> to avoid a flash of wrong
// theme on load — see the index.html / inbound.html templates).
(function () {
  const KEY = "gmv-ui-theme";

  function read() {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }
  function write(v) {
    try { localStorage.setItem(KEY, v); } catch {}
  }
  function systemTheme() {
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  }
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || systemTheme();
  }
  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelectorAll(".theme-toggle").forEach((btn) => {
      btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
      const next = theme === "dark" ? "light" : "dark";
      const label = next === "dark" ? "Switch to dark theme (Shift+T)" : "Switch to light theme (Shift+T)";
      btn.setAttribute("aria-label", label);
      btn.title = label;
    });
  }
  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    write(next);
    apply(next);
  }

  function init() {
    apply(currentTheme());
    document.querySelectorAll(".theme-toggle").forEach((btn) => {
      btn.addEventListener("click", toggle);
    });
    // If user hasn't picked a theme manually, follow the OS as it changes.
    if (!read() && window.matchMedia) {
      matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", (e) => {
        apply(e.matches ? "dark" : "light");
      });
    }
    // Global Shift+T keyboard shortcut. Skip when typing in form fields so we
    // don't hijack uppercase Ts in the user's actual input.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "T" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = (document.activeElement && document.activeElement.tagName) || "";
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      if (document.activeElement && document.activeElement.isContentEditable) return;
      e.preventDefault();
      toggle();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
  window.GMV_THEME = { toggle, apply };
})();
