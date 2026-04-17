// Inbound page — configure the assistant that answers calls,
// see recent/live inbound calls, and view transcripts + outcomes.

async function initInbound() {
  await loadInboundConfig();
  await refreshInboundCalls();
  setInterval(refreshInboundCalls, 6000);
  // Also refresh any session we're watching so the outcome appears when the call ends
  // (outcome arrives via WebSocket, but this keeps the list updated in parallel).
  $("inSaveBtn").addEventListener("click", saveInboundConfig);
  $("inRefreshBtn").addEventListener("click", refreshInboundCalls);
}

async function loadInboundConfig() {
  try {
    const r = await fetch("/api/inbound-config");
    if (!r.ok) throw new Error("fetch inbound config failed");
    const cfg = await r.json();
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
  btn.textContent = "Saving…";
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
    btn.textContent = "Saved ✓";
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1200);
  } catch (e) {
    console.error(e);
    alert("Save failed: " + e.message);
    btn.textContent = original;
    btn.disabled = false;
  }
}

async function refreshInboundCalls() {
  try {
    const r = await fetch("/api/sessions?type=inbound");
    if (!r.ok) return;
    const list = await r.json();
    renderInboundList(list);
  } catch (e) {
    console.error(e);
  }
}

function renderInboundList(list) {
  const host = $("inboundList");
  host.innerHTML = "";
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "inbound-empty";
    empty.textContent = "No inbound calls yet. Have someone call your Twilio number.";
    host.appendChild(empty);
    return;
  }
  for (const s of list) {
    const row = document.createElement("div");
    row.className = "inbound-row" + (state.sessionId === s.sessionId ? " active" : "");
    const when = new Date(s.startedAt);
    const timeStr = when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const live = !s.closed;
    row.innerHTML = `
      <span class="when">${timeStr}</span>
      <div>
        <div class="from">${s.callerNumber || "unknown caller"}</div>
        <div class="meta">${s.transcriptCount} turn${s.transcriptCount === 1 ? "" : "s"}${s.outcome ? ` · outcome: ${s.outcome}` : ""}</div>
      </div>
      <span class="badge ${live ? "live" : ""}">${live ? "live" : "done"}</span>
      <span class="meta">${s.scenarioId}</span>
      <span class="meta">view →</span>
    `;
    row.addEventListener("click", () => viewInboundSession(s.sessionId, live));
    host.appendChild(row);
  }
}

function viewInboundSession(sessionId, live) {
  resetLivePanel();
  state.sessionId = sessionId;
  connectUIStream(sessionId);
  setStatus(live ? "on the call" : "call ended", live ? "live" : "done");
  const livePanel = $("livePanel");
  if (livePanel) livePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  // re-render list so the active row is highlighted
  refreshInboundCalls();
}

initInbound();
