// Shared helpers for both outbound + inbound pages.

const $ = (id) => document.getElementById(id);

const state = {
  sessionId: null,
  ws: null,
  turns: new Map(),
  languages: [],
  lastOutcome: null,
  autoScroll: true,
};

async function ensureLanguagesLoaded() {
  if (state.languages.length) return state.languages;
  try {
    const r = await fetch("/api/languages");
    state.languages = await r.json();
  } catch {
    state.languages = [
      { code: "en", name: "English" },
      { code: "es", name: "Spanish" },
      { code: "hi", name: "Hindi" },
      { code: "zh", name: "Mandarin Chinese" },
      { code: "vi", name: "Vietnamese" },
      { code: "ar", name: "Arabic" },
      { code: "tl", name: "Tagalog" },
    ];
  }
  return state.languages;
}

function populateLanguageSelect(id, defaultCode) {
  const el = $(id);
  if (!el) return;
  if (el.dataset.populated === "1") {
    if (defaultCode) el.value = defaultCode;
    return;
  }
  el.innerHTML = "";
  for (const { code, name } of state.languages) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    opt.setAttribute("data-i18n", "");
    opt.dataset.i18nSrc = name;
    el.appendChild(opt);
  }
  el.dataset.populated = "1";
  if (defaultCode) el.value = defaultCode;
  if (window.I18N && I18N.refresh) I18N.refresh();
}

async function populateOutcomeLangSelect(selected) {
  const sel = $("outcomeLang");
  if (!sel) return;
  const langs = await ensureLanguagesLoaded();
  if (!sel.dataset.populated) {
    sel.innerHTML = "";
    for (const { code, name } of langs) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = name;
      opt.setAttribute("data-i18n", "");
      opt.dataset.i18nSrc = name;
      sel.appendChild(opt);
    }
    sel.dataset.populated = "1";
    sel.addEventListener("change", onOutcomeLangChange);
    if (window.I18N && I18N.refresh) I18N.refresh();
  }
  if (selected) sel.value = selected;
}

async function onOutcomeLangChange() {
  const sel = $("outcomeLang");
  if (!sel || !state.sessionId || !state.lastOutcome) return;
  const lang = sel.value;
  sel.disabled = true;
  try {
    const r = await fetch(`/api/sessions/${state.sessionId}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: lang }),
    });
    if (!r.ok) throw new Error(`translate ${r.status}`);
    const t = await r.json();
    const merged = {
      ...state.lastOutcome,
      language: t.language,
      languageName: t.languageName,
      summary_native: t.summary_native,
      next_steps_native: t.next_steps_native,
    };
    renderOutcome(merged, { skipLangInit: true });
  } catch (e) {
    console.error("translate failed:", e);
    showToast(tr("Couldn't translate the summary — please try again."), "error");
  } finally {
    sel.disabled = false;
  }
}

function resetLivePanel() {
  const tx = $("transcript");
  if (tx) {
    tx.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "transcript-empty";
    empty.id = "transcriptEmpty";
    empty.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <p data-i18n>Once the call connects, each turn will appear here — translated into your language in real time.</p>
    `;
    tx.appendChild(empty);
    // Restore the scroll-to-bottom button (it lives inside .transcript and we just blew it away).
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "scroll-bottom-btn";
    btn.id = "scrollBottomBtn";
    btn.setAttribute("aria-label", "Scroll to latest message");
    btn.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="6,9 12,15 18,9"/>
      </svg>
      <span data-i18n>New message</span>
    `;
    btn.addEventListener("click", () => {
      tx.scrollTop = tx.scrollHeight;
      btn.classList.remove("show");
    });
    tx.appendChild(btn);
    if (window.I18N && I18N.refresh) I18N.refresh();
  }
  if ($("outcome")) $("outcome").classList.add("hidden");
  if ($("summaryNative")) $("summaryNative").textContent = "";
  if ($("summaryEn")) $("summaryEn").textContent = "";
  if ($("nextSteps")) $("nextSteps").innerHTML = "";
  state.turns.clear();
  state.autoScroll = true;
  if (state.ws) {
    state.ws._suppressClose = true;
    try { state.ws.close(); } catch {}
    state.ws = null;
  }
  // Until a fresh stream connects, the indicator should read "idle".
  setConn("idle");
}

function connectUIStream(sessionId) {
  state.sessionId = sessionId;
  state.lastOutcome = null;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ui?sessionId=${sessionId}`);
  state.ws = ws;
  ws.addEventListener("open", () => setConn("connected"));
  // Once the call has ended (or we're tearing down to start a new one), we don't
  // want a later WS close to flip the indicator back to "disconnected" — the
  // status pill should stay "idle"/"call ended".
  ws.addEventListener("close", () => {
    if (ws._suppressClose) return;
    setConn("disconnected");
  });
  ws.addEventListener("message", (evt) => {
    let m; try { m = JSON.parse(evt.data); } catch { return; }
    handleMessage(m);
  });
}

// Strings that are set dynamically from JS — register them with the i18n
// module so they get bulk-translated alongside the static `data-i18n` ones.
if (window.I18N) {
  window.I18N.register([
    "idle", "connected", "disconnected",
    "not started", "none", "ringing", "on the call", "call ended",
    "mock: ringing", "Mock in progress", "Call in progress", "Place another call",
    "Placing call…", "Starting mock…",
    "Make the call on my behalf", "Run mock call (free — no phone, no APIs)",
    "Saving…", "Saved ✓", "Save inbound assistant",
    "commitment", "partial", "refused", "unclear", "empty",
    "Summary", "Summary (English)", "Next steps",
    "live", "done", "view →", "outcome:",
    "unknown caller", "turn", "turns", "Agent", "Other",
    "New message", "Copy", "Email", "Copied",
    "Summary copied to clipboard", "Couldn't copy — your browser blocked clipboard access",
    "Couldn't translate the summary — please try again.",
    "Please describe what you need on this call.",
    "Please enter a phone number to call.",
    "Enter a valid phone number, e.g. +13105551234",
    "Mock call failed: ", "Call failed: ", "Save failed: ",
    "All", "Live only", "Today", "This week",
    "No calls yet — share your number and the assistant will pick up.",
    "No calls yet — your outbound and mock calls will appear here.",
    "Your inbound webhook URL",
    "Set PUBLIC_HOSTNAME in your .env (e.g. via ngrok) to expose your inbound webhook.",
    "Refresh", "Show summary in:", "Outcome", "Call history",
    "mock", "real", "Mock call", "unknown destination",
  ]);
}
function tr(s) { return (window.I18N && window.I18N.t(s)) || s; }

function handleMessage(m) {
  switch (m.type) {
    case "call-status": {
      const s = m.status;
      if (s === "in-progress" || s === "answered") setStatus("on the call", "live");
      else if (s === "ringing") setStatus("ringing", "live");
      else if (s === "completed") {
        setStatus("call ended", "done");
        // The UI WS may stay open (we still want the outcome that follows), but
        // the top-right indicator should no longer claim we're "connected" to a
        // live call. Mark the socket so its eventual close is not surfaced.
        setConn("idle");
        if (state.ws) state.ws._suppressClose = true;
      }
      else setStatus(s);
      break;
    }
    case "transcript": addTurn(m); break;
    case "transcript-translation": attachTranslation(m); break;
    case "outcome": renderOutcome(m.outcome); break;
    case "error": console.error("server:", m.message); break;
  }
}

// =========================================================================
// Transcript rendering — avatars, timestamps, scroll-to-bottom
// =========================================================================

const AVATAR_AGENT = `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.6 5.2L19 9l-5.4 1.5L12 16l-1.6-5.5L5 9l5.4-1.8z"/></svg>`;
const AVATAR_OTHER = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`;

function isScrolledNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
}

function ensureScrollBottomWired(host) {
  if (host.dataset.scrollWired === "1") return;
  host.dataset.scrollWired = "1";
  const btn = host.querySelector("#scrollBottomBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      host.scrollTop = host.scrollHeight;
      btn.classList.remove("show");
      state.autoScroll = true;
    });
  }
  host.addEventListener("scroll", () => {
    if (isScrolledNearBottom(host)) {
      state.autoScroll = true;
      const b = host.querySelector("#scrollBottomBtn");
      if (b) b.classList.remove("show");
    } else {
      state.autoScroll = false;
    }
  });
}

function addTurn({ role, text, at }) {
  const key = `${role}-${at}`;
  if (state.turns.has(key)) return;
  const host = $("transcript");
  if (!host) return;
  ensureScrollBottomWired(host);
  const empty = host.querySelector(".transcript-empty");
  if (empty) empty.remove();

  const ts = at || Date.now();
  const date = new Date(ts);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fullTs = date.toLocaleString();
  const isAgent = role === "agent";
  const whoLabel = isAgent ? tr("Agent") : tr("Other");

  const el = document.createElement("div");
  el.className = `turn ${role}`;
  el.innerHTML = `
    <div class="avatar">${isAgent ? AVATAR_AGENT : AVATAR_OTHER}</div>
    <div class="turn-body">
      <div class="turn-meta">
        <span class="who"></span>
        <span class="time" title=""></span>
      </div>
      <div class="text-en"></div>
      <div class="text-native" style="display:none"></div>
    </div>
  `;
  el.querySelector(".who").textContent = whoLabel;
  const timeEl = el.querySelector(".time");
  timeEl.textContent = time;
  timeEl.title = fullTs;
  el.querySelector(".text-en").textContent = text;

  // Insert before the scroll-to-bottom button so it stays at the bottom.
  const btn = host.querySelector("#scrollBottomBtn");
  if (btn) host.insertBefore(el, btn);
  else host.appendChild(el);

  if (state.autoScroll) {
    host.scrollTop = host.scrollHeight;
  } else if (btn) {
    btn.classList.add("show");
  }
  state.turns.set(key, el);
}

function attachTranslation({ role, at, translated }) {
  const key = `${role}-${at}`;
  const el = state.turns.get(key);
  if (!el) return;
  const t = el.querySelector(".text-native");
  t.textContent = translated;
  t.style.display = "block";
}

// =========================================================================
// Outcome rendering + copy/email actions
// =========================================================================

function renderOutcome(o, opts = {}) {
  if (!$("outcome")) return;
  $("outcome").classList.remove("hidden");
  state.lastOutcome = o;
  const tag = $("outcomeTag");
  const outcomeKey = (o.outcome || "unclear");
  tag.className = "outcome-pill " + outcomeKey;
  tag.textContent = tr(outcomeKey).replace(/_/g, " ");

  const langName = o.languageName || "your language";
  const isEnglish = (o.language || "en") === "en";

  if (!opts.skipLangInit) {
    populateOutcomeLangSelect(o.language || "en");
  }

  const nativeHeader = $("summaryNativeHeader");
  const nativeBody = $("summaryNative");
  const enHeader = $("summaryEnHeader");
  const enBody = $("summaryEn");

  if (nativeHeader) nativeHeader.textContent = `${tr("Summary")} (${langName})`;
  if (nativeBody) nativeBody.textContent = o.summary_native || (isEnglish ? (o.summary_en || "") : "");

  if (enHeader) {
    enHeader.style.display = isEnglish ? "none" : "";
    enHeader.textContent = tr("Summary (English)");
  }
  if (enBody) {
    enBody.style.display = isEnglish ? "none" : "";
    enBody.textContent = o.summary_en || "";
  }

  const ul = $("nextSteps"); ul.innerHTML = "";
  const stepsHeader = $("nextStepsHeader");
  if (stepsHeader) stepsHeader.textContent = `${tr("Next steps")} (${langName})`;
  const steps = (!isEnglish && o.next_steps_native?.length) ? o.next_steps_native : (o.next_steps_en || []);
  for (const s of steps) {
    const li = document.createElement("li");
    li.textContent = s;
    ul.appendChild(li);
  }
  if ($("callBtn")) {
    $("callBtn").disabled = false;
    const span = $("callBtn").querySelector("span");
    if (span) {
      // Update i18n source too so a later language switch translates the new label.
      span.dataset.i18nSrc = "Place another call";
      span.textContent = tr("Place another call");
    } else {
      $("callBtn").textContent = tr("Place another call");
    }
  }
  if ($("mockBtn")) $("mockBtn").disabled = false;
}

function buildOutcomeText() {
  const o = state.lastOutcome;
  if (!o) return "";
  const isEnglish = (o.language || "en") === "en";
  const native = o.summary_native || (isEnglish ? o.summary_en : "");
  const lines = [
    `${tr("Outcome")}: ${tr(o.outcome || "unclear")}`,
    "",
  ];
  if (native) {
    lines.push(`${tr("Summary")} (${o.languageName || "—"}):`);
    lines.push(native);
    lines.push("");
  }
  if (!isEnglish && o.summary_en) {
    lines.push(`${tr("Summary (English)")}:`);
    lines.push(o.summary_en);
    lines.push("");
  }
  const steps = (!isEnglish && o.next_steps_native?.length) ? o.next_steps_native : (o.next_steps_en || []);
  if (steps.length) {
    lines.push(`${tr("Next steps")}:`);
    for (const s of steps) lines.push(`- ${s}`);
  }
  return lines.join("\n").trim();
}

async function copyOutcomeToClipboard() {
  const text = buildOutcomeText();
  if (!text) return;
  const btn = $("copyOutcomeBtn");
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      btn.classList.add("copied");
      const span = btn.querySelector("span");
      const original = span ? span.textContent : "";
      if (span) span.textContent = tr("Copied");
      setTimeout(() => {
        btn.classList.remove("copied");
        if (span) span.textContent = original;
      }, 1500);
    }
    showToast(tr("Summary copied to clipboard"), "success", 2000);
  } catch {
    showToast(tr("Couldn't copy — your browser blocked clipboard access"), "error");
  }
}

function emailOutcome() {
  const o = state.lastOutcome;
  if (!o) return;
  const subject = `Call summary — ${tr(o.outcome || "complete")}`;
  const body = buildOutcomeText();
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function setStatus(text, cls = "") {
  const el = $("callStatus");
  if (!el) return;
  el.dataset.i18nSrc = text;
  el.textContent = tr(text);
  el.className = "pill " + cls;
}
function setConn(text) {
  const el = $("connStatus");
  if (!el) return;
  el.dataset.i18nSrc = text;
  el.textContent = tr(text);
  let key = "idle";
  if (text === "connected") key = "connected";
  else if (text === "disconnected") key = "disconnected";
  el.dataset.status = key;
}

// =========================================================================
// Toast notifications (replaces alert())
// =========================================================================

function showToast(message, type = "info", durationMs = 4000) {
  let container = $("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-msg"></span><button type="button" class="toast-close" aria-label="Dismiss">×</button>`;
  el.querySelector(".toast-msg").textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  const dismiss = () => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector(".toast-close").addEventListener("click", dismiss);
  if (durationMs) setTimeout(dismiss, durationMs);
  return el;
}
window.showToast = showToast;

// =========================================================================
// "Answer calls" tab live-count badge — polled on every page so the badge is
// useful from outbound too.
// =========================================================================

async function pollInboundLiveBadge() {
  const badge = document.getElementById("inboundLiveBadge");
  if (!badge) return;
  try {
    const r = await fetch("/api/sessions?type=inbound");
    if (!r.ok) return;
    const list = await r.json();
    const live = list.filter((s) => !s.closed).length;
    badge.textContent = live > 0 ? String(live) : "";
    badge.classList.toggle("zero", live === 0);
  } catch {}
}
setInterval(pollInboundLiveBadge, 6000);
document.addEventListener("DOMContentLoaded", pollInboundLiveBadge);

// =========================================================================
// Wire up outcome action buttons + initial scroll-to-bottom binding
// =========================================================================

document.addEventListener("DOMContentLoaded", () => {
  if ($("copyOutcomeBtn")) $("copyOutcomeBtn").addEventListener("click", copyOutcomeToClipboard);
  if ($("emailOutcomeBtn")) $("emailOutcomeBtn").addEventListener("click", emailOutcome);
  const tx = $("transcript");
  if (tx) ensureScrollBottomWired(tx);
});

// When the user changes the page language, re-render dynamic chrome.
document.addEventListener("i18n:applied", () => {
  if (state.lastOutcome) renderOutcome(state.lastOutcome, { skipLangInit: true });
  if (typeof refreshInboundCalls === "function") refreshInboundCalls();
});
