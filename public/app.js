const $ = (id) => document.getElementById(id);

const state = {
  scenarios: [],
  selectedScenario: "landlord",
  sessionId: null,
  ws: null,
  turns: new Map(), // key = `${role}-${at}`, value = element
};

async function init() {
  const r = await fetch("/api/scenarios");
  state.scenarios = await r.json();
  renderScenarios();

  // Prefill landlord demo values to make live demo one-click-ready.
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
  for (const s of state.scenarios) {
    const el = document.createElement("div");
    el.className = "scenario" + (s.id === state.selectedScenario ? " selected" : "");
    el.innerHTML = `<div class="s-title">${s.label.split(" — ")[0]}</div>
                    <div class="s-sub">${s.label.split(" — ").slice(1).join(" — ")}</div>`;
    el.addEventListener("click", () => {
      state.selectedScenario = s.id;
      renderScenarios();
    });
    host.appendChild(el);
  }
}

function resetLivePanel() {
  $("transcript").innerHTML = "";
  $("outcome").classList.add("hidden");
  $("summaryNative").textContent = "";
  $("summaryEn").textContent = "";
  $("nextSteps").innerHTML = "";
  state.turns.clear();
  if (state.ws) {
    try { state.ws.close(); } catch {}
    state.ws = null;
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
        scenarioId: state.selectedScenario,
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

function connectUIStream(sessionId) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ui?sessionId=${sessionId}`);
  state.ws = ws;
  ws.addEventListener("open", () => setConn("connected"));
  ws.addEventListener("close", () => setConn("disconnected"));
  ws.addEventListener("message", (evt) => {
    let m; try { m = JSON.parse(evt.data); } catch { return; }
    handleMessage(m);
  });
}

function handleMessage(m) {
  switch (m.type) {
    case "call-status": {
      const s = m.status;
      if (s === "in-progress" || s === "answered") setStatus("on the call", "live");
      else if (s === "ringing") setStatus("ringing", "live");
      else if (s === "completed") setStatus("call ended", "done");
      else setStatus(s);
      break;
    }
    case "transcript": addTurn(m); break;
    case "transcript-translation": attachTranslation(m); break;
    case "outcome": renderOutcome(m.outcome); break;
    case "error": console.error("server:", m.message); break;
  }
}

function addTurn({ role, text, at }) {
  const key = `${role}-${at}`;
  if (state.turns.has(key)) return;
  const el = document.createElement("div");
  el.className = `turn ${role}`;
  el.innerHTML = `<div class="who">${role === "agent" ? "Agent" : "Other"}</div>
                  <div>
                    <div class="text-en"></div>
                    <div class="text-native" style="display:none"></div>
                  </div>`;
  el.querySelector(".text-en").textContent = text;
  $("transcript").appendChild(el);
  $("transcript").scrollTop = $("transcript").scrollHeight;
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

function renderOutcome(o) {
  $("outcome").classList.remove("hidden");
  const tag = $("outcomeTag");
  tag.className = "outcome-pill " + (o.outcome || "unclear");
  tag.textContent = (o.outcome || "unclear").replace(/_/g, " ");
  $("summaryNative").textContent = o.summary_native || "";
  $("summaryEn").textContent = o.summary_en || "";
  const ul = $("nextSteps"); ul.innerHTML = "";
  const steps = o.next_steps_native?.length ? o.next_steps_native : o.next_steps_en || [];
  for (const s of steps) {
    const li = document.createElement("li");
    li.textContent = s;
    ul.appendChild(li);
  }
  $("callBtn").disabled = false;
  $("mockBtn").disabled = false;
  $("callBtn").textContent = "Place another call";
}

function setStatus(text, cls = "") {
  const el = $("callStatus");
  el.textContent = text;
  el.className = "pill " + cls;
}
function setConn(text) { $("connStatus").textContent = text; }

init();
