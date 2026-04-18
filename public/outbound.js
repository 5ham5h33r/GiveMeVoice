// Outbound page — make calls on the user's behalf using a free-form description.

// Friendly defaults shown on first visit. Marked with data-i18n-value so the
// site-wide language switcher translates them — and stops translating once
// the user types their own content. We bypass the prefill entirely if the
// user has saved values from a previous session (see PERSIST_KEY below).
const PREFILL = {
  userName: "Priya Sharma",
  counterpartyName: "Sunset Properties",
  callObjective:
    "Schedule a heater repair appointment at 123 W 27th St, Los Angeles, CA 90007. The heater has been broken for 9 days; the bedroom reaches 54°F at night and there is a two-year-old in the unit.",
  helpfulContext:
    "Tenant: Priya Sharma. Address: 123 W 27th St, Los Angeles, CA 90007. Heat broken since Apr 7. Texted building manager Apr 8 — no response. California Civil Code §1941.1 habitability obligation.",
};

const PERSIST_KEY = "gmv-outbound-form";
const PERSIST_FIELDS = [
  "userName", "counterpartyName", "to", "userCallbackNumber",
  "callObjective", "helpfulContext", "callLanguage", "viewLanguage",
];
const OBJECTIVE_WARN_AT = 280;
const OBJECTIVE_HARD_LIMIT = 1000;

function loadPersisted() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    return (j && typeof j === "object") ? j : null;
  } catch { return null; }
}
function savePersisted() {
  try {
    const data = {};
    for (const id of PERSIST_FIELDS) {
      const el = $(id);
      if (el) data[id] = el.value;
    }
    localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
  } catch {}
}
const debouncedSave = (() => {
  let t;
  return () => { clearTimeout(t); t = setTimeout(savePersisted, 250); };
})();

function autoResize(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.max(el.scrollHeight + 2, 60) + "px";
}

function updateObjectiveCount() {
  const el = $("callObjective");
  const count = $("objectiveCount");
  if (!el || !count) return;
  const len = el.value.length;
  if (len < OBJECTIVE_WARN_AT) {
    count.classList.remove("show", "warn");
    return;
  }
  count.classList.add("show");
  count.classList.toggle("warn", len > OBJECTIVE_HARD_LIMIT);
  count.textContent = `${len} / ${OBJECTIVE_HARD_LIMIT}`;
}

// Inline validation helpers
function showFieldError(inputId, msg) {
  const input = $(inputId);
  const err = $(`${inputId}-err`);
  if (!input) return;
  const label = input.closest("label");
  if (msg) {
    if (err) {
      err.textContent = tr(msg);
      err.classList.add("show");
    }
    if (label) label.classList.add("has-error");
  } else {
    if (err) {
      err.classList.remove("show");
      err.textContent = "";
    }
    if (label) label.classList.remove("has-error");
  }
}

function validatePhone(value, { required } = {}) {
  const v = (value || "").trim();
  if (!v) return required ? "Please enter a phone number to call." : null;
  // Lenient — accepts +1 (310) 555-1234, +13105551234, etc.
  if (!/^\+?[\d\s().-]{7,}$/.test(v)) return "Enter a valid phone number, e.g. +13105551234";
  return null;
}
function validateObjective(value) {
  if (!value || !value.trim()) return "Please describe what you need on this call.";
  return null;
}

async function initOutbound() {
  await ensureLanguagesLoaded();
  populateLanguageSelect("callLanguage", "en");
  populateLanguageSelect("viewLanguage", "en");

  const persisted = loadPersisted();

  for (const [id, txt] of Object.entries(PREFILL)) {
    const el = $(id);
    if (!el) continue;
    if (persisted && typeof persisted[id] === "string" && persisted[id].length) {
      // Use the saved value as-is. Mark as user-edited so i18n leaves it alone.
      el.value = persisted[id];
      el.dataset.i18nUserEdited = "1";
    } else {
      el.value = txt;
      el.setAttribute("data-i18n-value", "");
      el.dataset.i18nValSrc = txt;
    }
    el.addEventListener("input", () => {
      el.dataset.i18nUserEdited = "1";
      debouncedSave();
    });
  }

  // Phone fields and language selects don't have a prefilled English source;
  // hydrate from persisted values and persist on change.
  for (const id of ["to", "userCallbackNumber", "callLanguage", "viewLanguage"]) {
    const el = $(id);
    if (!el) continue;
    if (persisted && typeof persisted[id] === "string" && persisted[id].length) {
      el.value = persisted[id];
    }
    el.addEventListener(el.tagName === "SELECT" ? "change" : "input", debouncedSave);
  }

  // Auto-resize textareas — initial pass + on each input.
  for (const id of ["callObjective", "helpfulContext"]) {
    const el = $(id);
    if (!el) continue;
    autoResize(el);
    el.addEventListener("input", () => autoResize(el));
  }

  // Char count under the objective.
  const objective = $("callObjective");
  if (objective) {
    objective.addEventListener("input", updateObjectiveCount);
    updateObjectiveCount();
  }

  // Inline validation — clear errors on input, validate on blur.
  const phone = $("to");
  if (phone) {
    phone.addEventListener("blur", () => showFieldError("to", validatePhone(phone.value)));
    phone.addEventListener("input", () => showFieldError("to", null));
  }
  const callback = $("userCallbackNumber");
  if (callback) {
    callback.addEventListener("blur", () => showFieldError("userCallbackNumber", validatePhone(callback.value)));
    callback.addEventListener("input", () => showFieldError("userCallbackNumber", null));
  }
  if (objective) {
    objective.addEventListener("blur", () => showFieldError("callObjective", validateObjective(objective.value)));
    objective.addEventListener("input", () => showFieldError("callObjective", null));
  }

  if (window.I18N && I18N.refresh) await I18N.refresh();

  $("callBtn").addEventListener("click", () => startCall(false));
  $("mockBtn").addEventListener("click", () => startCall(true));

  initCallHistory();
}

// =========================================================================
// Call history — both real outbound and mock sessions started from this page.
// =========================================================================

const HISTORY_FILTER_KEY = "gmv-outbound-filter";
const historyState = {
  filter: "all",
  list: [],
};

function initCallHistory() {
  try { historyState.filter = localStorage.getItem(HISTORY_FILTER_KEY) || "all"; } catch {}

  const pills = document.querySelectorAll("#outboundFilters .filter-pill");
  pills.forEach((p) => {
    p.classList.toggle("active", p.dataset.filter === historyState.filter);
    p.addEventListener("click", () => {
      historyState.filter = p.dataset.filter;
      try { localStorage.setItem(HISTORY_FILTER_KEY, historyState.filter); } catch {}
      pills.forEach((q) => q.classList.toggle("active", q === p));
      renderOutboundHistory(historyState.list);
    });
  });

  if ($("outRefreshBtn")) $("outRefreshBtn").addEventListener("click", refreshOutboundHistory);

  refreshOutboundHistory();
  setInterval(refreshOutboundHistory, 6000);
}

async function refreshOutboundHistory() {
  try {
    const r = await fetch("/api/sessions");
    if (!r.ok) return;
    const list = await r.json();
    // Anything that wasn't initiated by an inbound caller belongs in this list
    // (real outbound + mock — both are launched from the "Make a call" form).
    historyState.list = list.filter((s) => !s.isInbound);
    renderOutboundHistory(historyState.list);
  } catch (e) {
    console.error(e);
  }
}

function applyOutboundFilter(list) {
  const now = Date.now();
  const startOfToday = (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
  })();
  switch (historyState.filter) {
    case "live":  return list.filter((s) => !s.closed);
    case "today": return list.filter((s) => s.startedAt >= startOfToday);
    case "week":  return list.filter((s) => now - s.startedAt < 7 * 24 * 60 * 60 * 1000);
    default:      return list;
  }
}

function renderOutboundHistory(list) {
  const host = $("outboundList");
  if (!host) return;
  host.innerHTML = "";
  const filtered = applyOutboundFilter(list);

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "inbound-empty";
    empty.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
      <p data-i18n>No calls yet — your outbound and mock calls will appear here.</p>
    `;
    host.appendChild(empty);
    if (window.I18N && I18N.refresh) I18N.refresh();
    return;
  }

  for (const s of filtered) {
    const row = document.createElement("div");
    row.className = "inbound-row" + (state.sessionId === s.sessionId ? " active" : "");
    const when = new Date(s.startedAt);
    const timeStr = when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const live = !s.closed;
    const turnsLabel = s.transcriptCount === 1 ? tr("turn") : tr("turns");
    const label = s.counterpartyName || s.to || (s.isMock ? tr("Mock call") : tr("unknown destination"));
    const sub = s.objectivePreview || "";
    const meta = `${s.transcriptCount} ${turnsLabel}` +
      (s.outcome ? ` · ${tr("outcome:")} ${tr(s.outcome)}` : "") +
      (sub ? ` · ${sub}` : "");

    const liveOrDone = tr(live ? "live" : "done");
    const kindLabel = s.isMock ? tr("mock") : tr("real");

    row.innerHTML = `
      <span class="when">${timeStr}</span>
      <div>
        <div class="from"></div>
        <div class="meta"></div>
      </div>
      <span class="badge ${live ? "live" : ""}">${liveOrDone}</span>
      <span class="meta">${kindLabel}</span>
      <span class="meta">${tr("view →")}</span>
    `;
    row.querySelector(".from").textContent = label;
    row.querySelector(".meta").textContent = meta;
    row.addEventListener("click", () => viewOutboundSession(s.sessionId, live));
    host.appendChild(row);
  }
}

function viewOutboundSession(sessionId, live) {
  resetLivePanel();
  state.sessionId = sessionId;
  connectUIStream(sessionId);
  setStatus(live ? "on the call" : "call ended", live ? "live" : "done");
  // Re-enable the form buttons so the user can start a new call without
  // waiting for an outcome event.
  if ($("callBtn")) $("callBtn").disabled = false;
  if ($("mockBtn")) $("mockBtn").disabled = false;
  const livePanel = $("livePanel");
  if (livePanel) livePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  refreshOutboundHistory();
}

async function startCall(isMock) {
  const btn = $("callBtn");
  const mockBtn = $("mockBtn");

  const ctx = {
    userName: $("userName").value.trim(),
    counterpartyName: $("counterpartyName").value.trim(),
    objective: $("callObjective").value.trim(),
    facts: $("helpfulContext").value.trim(),
    userCallbackNumber: $("userCallbackNumber").value.trim(),
  };

  // Inline validation, no alert().
  const objErr = validateObjective(ctx.objective);
  showFieldError("callObjective", objErr);
  let phoneErr = null;
  if (!isMock) phoneErr = validatePhone($("to").value, { required: true });
  showFieldError("to", phoneErr);
  if (objErr || phoneErr) {
    showToast(tr(objErr || phoneErr), "error");
    if (objErr) $("callObjective").focus();
    else $("to").focus();
    return;
  }

  resetLivePanel();
  btn.disabled = true;
  mockBtn.disabled = true;
  const callBtnSpan = btn.querySelector("span");
  const startingText = isMock ? "Starting mock…" : "Placing call…";
  if (callBtnSpan) {
    callBtnSpan.dataset.i18nSrc = startingText;
    callBtnSpan.textContent = tr(startingText);
  } else {
    btn.textContent = tr(startingText);
  }

  try {
    const r = await fetch(isMock ? "/api/call/mock" : "/api/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: "custom",
        to: $("to").value.trim(),
        callLanguage: $("callLanguage").value,
        viewLanguage: $("viewLanguage").value,
        ctx,
      }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(err.error || r.statusText);
    }
    const { sessionId } = await r.json();
    state.sessionId = sessionId;
    connectUIStream(sessionId);
    setStatus(isMock ? "mock: ringing" : "ringing", "live");
    const inProgressText = isMock ? "Mock in progress" : "Call in progress";
    if (callBtnSpan) {
      callBtnSpan.dataset.i18nSrc = inProgressText;
      callBtnSpan.textContent = tr(inProgressText);
    } else {
      btn.textContent = tr(inProgressText);
    }
  } catch (e) {
    console.error(e);
    showToast(tr(isMock ? "Mock call failed: " : "Call failed: ") + e.message, "error", 6000);
    btn.disabled = false;
    mockBtn.disabled = false;
    if (callBtnSpan) {
      callBtnSpan.dataset.i18nSrc = "Make the call on my behalf";
      callBtnSpan.textContent = tr("Make the call on my behalf");
    } else {
      btn.textContent = tr("Make the call on my behalf");
    }
  }
}

initOutbound();
