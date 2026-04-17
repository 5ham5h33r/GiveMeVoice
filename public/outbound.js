// Outbound page — make calls on the user's behalf.

const outboundState = {
  scenarios: [],
  selectedScenario: "landlord",
};

async function initOutbound() {
  const r = await fetch("/api/scenarios");
  const all = await r.json();
  // Outbound flows only — hide the inbound-only scenario.
  outboundState.scenarios = all.filter((s) => s.id !== "inbound");
  renderScenarios();

  $("userName").value = "Priya Sharma";
  $("address").value = "123 W 27th St, Los Angeles, CA 90007";
  $("counterpartyName").value = "Sunset Properties";
  $("issue").value = "The heater has been completely broken for 9 days. The bedroom reaches 54°F at night and my two-year-old daughter is getting sick.";
  $("duration").value = "9 days";
  $("priorNotice").value = "Texted the building manager on Apr 8, no response.";
  $("language").value = "hi";

  $("callBtn").addEventListener("click", () => startCall(false));
  $("mockBtn").addEventListener("click", () => startCall(true));
}

function renderScenarios() {
  const host = $("scenarios");
  host.innerHTML = "";
  for (const s of outboundState.scenarios) {
    const el = document.createElement("div");
    el.className = "scenario" + (s.id === outboundState.selectedScenario ? " selected" : "");
    el.innerHTML = `<div class="s-title">${s.label.split(" — ")[0]}</div>
                    <div class="s-sub">${s.label.split(" — ").slice(1).join(" — ")}</div>`;
    el.addEventListener("click", () => {
      outboundState.selectedScenario = s.id;
      renderScenarios();
    });
    host.appendChild(el);
  }
}

async function startCall(isMock) {
  const btn = $("callBtn");
  const mockBtn = $("mockBtn");
  resetLivePanel();
  btn.disabled = true;
  mockBtn.disabled = true;
  btn.textContent = isMock ? "Starting mock…" : "Placing call…";

  const ctx = {
    userName: $("userName").value.trim(),
    address: $("address").value.trim(),
    counterpartyName: $("counterpartyName").value.trim(),
    issue: $("issue").value.trim(),
    duration: $("duration").value.trim(),
    priorNotice: $("priorNotice").value.trim(),
    userCallbackNumber: $("userCallbackNumber").value.trim(),
  };

  try {
    const r = await fetch(isMock ? "/api/call/mock" : "/api/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: outboundState.selectedScenario,
        to: $("to").value.trim(),
        language: $("language").value,
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
    btn.textContent = isMock ? "Mock in progress" : "Call in progress";
  } catch (e) {
    console.error(e);
    alert((isMock ? "Mock call failed: " : "Call failed: ") + e.message);
    btn.disabled = false;
    mockBtn.disabled = false;
    btn.textContent = "Make the call on my behalf";
  }
}

initOutbound();
