// Inbound page — configure the assistant that answers calls,
// see recent/live inbound calls, and view transcripts + outcomes.

const FILTER_KEY = "gmv-inbound-filter";
const inboundState = {
  filter: "all",
  list: [],
  config: null,
};

async function initInbound() {
  try { inboundState.filter = localStorage.getItem(FILTER_KEY) || "all"; } catch {}

  await loadInboundConfig();
  await refreshInboundCalls();
  setInterval(refreshInboundCalls, 6000);

  $("inSaveBtn").addEventListener("click", saveInboundConfig);
  $("inRefreshBtn").addEventListener("click", refreshInboundCalls);

  // Wire up filter pills
  const pills = document.querySelectorAll("#inboundFilters .filter-pill");
  pills.forEach((p) => {
    if (p.dataset.filter === inboundState.filter) p.classList.add("active");
    else p.classList.remove("active");
    p.addEventListener("click", () => {
      inboundState.filter = p.dataset.filter;
      try { localStorage.setItem(FILTER_KEY, inboundState.filter); } catch {}
      pills.forEach((q) => q.classList.toggle("active", q === p));
      renderInboundList(inboundState.list);
    });
  });
}

async function loadInboundConfig() {
  try {
    const r = await fetch("/api/inbound-config");
    if (!r.ok) throw new Error("fetch inbound config failed");
    const cfg = await r.json();
    inboundState.config = cfg;
    $("inUserName").value = cfg.userName || "";
    $("inLanguage").value = cfg.language || "en";
    $("inVoice").value = cfg.voice || "alloy";
    $("inPersona").value = cfg.persona || "";
  } catch (e) {
    console.error(e);
  }
}

async function saveInboundConfig() {
  const btn = $("inSaveBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = tr("Saving…");
  try {
    const r = await fetch("/api/inbound-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userName: $("inUserName").value.trim(),
        language: $("inLanguage").value,
        voice: $("inVoice").value,
        persona: $("inPersona").value,
      }),
    });
    if (!r.ok) {
      let detail = r.statusText;
      try {
        const j = await r.json();
        detail = j.error || detail;
      } catch {
        detail = `HTTP ${r.status} — is the server restarted with the new code?`;
      }
      throw new Error(detail);
    }
    btn.textContent = tr("Saved ✓");
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1200);
  } catch (e) {
    console.error(e);
    showToast(tr("Save failed: ") + e.message, "error");
    btn.textContent = original;
    btn.disabled = false;
  }
}

async function refreshInboundCalls() {
  try {
    const r = await fetch("/api/sessions?type=inbound");
    if (!r.ok) return;
    const list = await r.json();
    inboundState.list = list;
    renderInboundList(list);
  } catch (e) {
    console.error(e);
  }
}

function applyFilter(list) {
  const now = Date.now();
  const startOfToday = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  switch (inboundState.filter) {
    case "live":  return list.filter((s) => !s.closed);
    case "today": return list.filter((s) => s.startedAt >= startOfToday);
    case "week":  return list.filter((s) => now - s.startedAt < 7 * 24 * 60 * 60 * 1000);
    default:      return list;
  }
}

function renderInboundList(list) {
  const host = $("inboundList");
  host.innerHTML = "";
  const filtered = applyFilter(list);

  if (!filtered.length) {
    host.appendChild(buildEmptyState(list.length === 0));
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
    const caller = s.callerNumber || tr("unknown caller");
    const meta = `${s.transcriptCount} ${turnsLabel}` +
      (s.outcome ? ` · ${tr("outcome:")} ${tr(s.outcome)}` : "");
    row.innerHTML = `
      <span class="when">${timeStr}</span>
      <div>
        <div class="from"></div>
        <div class="meta"></div>
      </div>
      <span class="badge ${live ? "live" : ""}">${tr(live ? "live" : "done")}</span>
      <span class="meta">${s.scenarioId}</span>
      <span class="meta">${tr("view →")}</span>
    `;
    row.querySelector(".from").textContent = caller;
    row.querySelector(".meta").textContent = meta;
    row.addEventListener("click", () => viewInboundSession(s.sessionId, live));
    host.appendChild(row);
  }
}

function buildEmptyState(noCallsAtAll) {
  const empty = document.createElement("div");
  empty.className = "inbound-empty";
  empty.innerHTML = `
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
    <p data-i18n>No calls yet — share your number and the assistant will pick up.</p>
  `;
  // Webhook URL section — only useful when there are zero calls (the user is
  // probably setting up). When the filter is hiding rows but calls exist, we
  // skip the webhook UI to avoid noise.
  if (noCallsAtAll) {
    const cfg = inboundState.config;
    const url = cfg && cfg.webhookUrl;
    if (url) {
      const label = document.createElement("p");
      label.setAttribute("data-i18n", "");
      label.textContent = "Your inbound webhook URL";
      label.style.marginTop = "6px";
      empty.appendChild(label);

      const wrap = document.createElement("div");
      wrap.className = "webhook-display";
      wrap.innerHTML = `
        <span class="webhook-url"></span>
        <button type="button" class="webhook-copy" data-i18n>Copy</button>
      `;
      wrap.querySelector(".webhook-url").textContent = url;
      const copyBtn = wrap.querySelector(".webhook-copy");
      copyBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(url);
          copyBtn.classList.add("copied");
          const original = copyBtn.textContent;
          copyBtn.textContent = tr("Copied");
          setTimeout(() => {
            copyBtn.classList.remove("copied");
            copyBtn.textContent = original;
          }, 1500);
        } catch {
          showToast(tr("Couldn't copy — your browser blocked clipboard access"), "error");
        }
      });
      empty.appendChild(wrap);
    } else {
      const hint = document.createElement("p");
      hint.setAttribute("data-i18n", "");
      hint.textContent = "Set PUBLIC_HOSTNAME in your .env (e.g. via ngrok) to expose your inbound webhook.";
      hint.style.fontSize = "12px";
      hint.style.opacity = "0.85";
      empty.appendChild(hint);
    }
  }
  return empty;
}

function viewInboundSession(sessionId, live) {
  resetLivePanel();
  state.sessionId = sessionId;
  connectUIStream(sessionId);
  setStatus(live ? "on the call" : "call ended", live ? "live" : "done");
  const livePanel = $("livePanel");
  if (livePanel) livePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  refreshInboundCalls();
}

initInbound();
