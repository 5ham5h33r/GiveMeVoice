// Shared helpers for both outbound + inbound pages.

const $ = (id) => document.getElementById(id);

const state = {
  sessionId: null,
  ws: null,
  turns: new Map(),
  languages: [],
  lastOutcome: null,
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
      sel.appendChild(opt);
    }
    sel.dataset.populated = "1";
    sel.addEventListener("change", onOutcomeLangChange);
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
  } finally {
    sel.disabled = false;
  }
}

function resetLivePanel() {
  if ($("transcript")) $("transcript").innerHTML = "";
  if ($("outcome")) $("outcome").classList.add("hidden");
  if ($("summaryNative")) $("summaryNative").textContent = "";
  if ($("summaryEn")) $("summaryEn").textContent = "";
  if ($("nextSteps")) $("nextSteps").innerHTML = "";
  state.turns.clear();
  if (state.ws) {
    try { state.ws.close(); } catch {}
    state.ws = null;
  }
}

function connectUIStream(sessionId) {
  state.sessionId = sessionId;
  state.lastOutcome = null;
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
  const host = $("transcript");
  if (!host) return;
  const el = document.createElement("div");
  el.className = `turn ${role}`;
  el.innerHTML = `<div class="who">${role === "agent" ? "Agent" : "Other"}</div>
                  <div>
                    <div class="text-en"></div>
                    <div class="text-native" style="display:none"></div>
                  </div>`;
  el.querySelector(".text-en").textContent = text;
  host.appendChild(el);
  host.scrollTop = host.scrollHeight;
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

function renderOutcome(o, opts = {}) {
  if (!$("outcome")) return;
  $("outcome").classList.remove("hidden");
  state.lastOutcome = o;
  const tag = $("outcomeTag");
  tag.className = "outcome-pill " + (o.outcome || "unclear");
  tag.textContent = (o.outcome || "unclear").replace(/_/g, " ");

  const langName = o.languageName || "your language";
  const isEnglish = (o.language || "en") === "en";

  if (!opts.skipLangInit) {
    populateOutcomeLangSelect(o.language || "en");
  }

  const nativeHeader = $("summaryNativeHeader");
  const nativeBody = $("summaryNative");
  const enHeader = $("summaryEnHeader");
  const enBody = $("summaryEn");

  if (nativeHeader) nativeHeader.textContent = `Summary (${langName})`;
  if (nativeBody) nativeBody.textContent = o.summary_native || (isEnglish ? (o.summary_en || "") : "");

  // When the chosen language IS English, the two blocks would be identical — hide the duplicate.
  if (enHeader) enHeader.style.display = isEnglish ? "none" : "";
  if (enBody) {
    enBody.style.display = isEnglish ? "none" : "";
    enBody.textContent = o.summary_en || "";
  }

  const ul = $("nextSteps"); ul.innerHTML = "";
  const stepsHeader = $("nextStepsHeader");
  if (stepsHeader) stepsHeader.textContent = `Next steps (${langName})`;
  const steps = (!isEnglish && o.next_steps_native?.length) ? o.next_steps_native : (o.next_steps_en || []);
  for (const s of steps) {
    const li = document.createElement("li");
    li.textContent = s;
    ul.appendChild(li);
  }
  // On the outbound page the "Make call" buttons need re-enabling; safe no-ops elsewhere.
  if ($("callBtn")) { $("callBtn").disabled = false; $("callBtn").textContent = "Place another call"; }
  if ($("mockBtn")) $("mockBtn").disabled = false;
}

function setStatus(text, cls = "") {
  const el = $("callStatus");
  if (!el) return;
  el.textContent = text;
  el.className = "pill " + cls;
}
function setConn(text) { if ($("connStatus")) $("connStatus").textContent = text; }
