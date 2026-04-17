// CrossCall server.
// Bridges: Twilio Media Streams <-> OpenAI Realtime API <-> Browser (UI + transcript)

import "dotenv/config";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { buildPrompt, scenarios } from "./prompts.js";
import { runMockCall } from "./mockCall.js";

const {
  OPENAI_API_KEY,
  OPENAI_REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17",
  OPENAI_TEXT_MODEL = "gpt-4o-mini",
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
  PUBLIC_HOSTNAME,
  PORT = 5050,
} = process.env;

function realCallConfigured() {
  return !!(
    OPENAI_API_KEY &&
    TWILIO_ACCOUNT_SID &&
    TWILIO_AUTH_TOKEN &&
    TWILIO_FROM_NUMBER &&
    PUBLIC_HOSTNAME
  );
}

let twilioClient = null;
function getTwilioClient() {
  if (!twilioClient) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      throw new Error(
        "Twilio is not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env, or use Run mock call (free)."
      );
    }
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

/**
 * In-memory session registry.
 * sessionId -> { ctx, scenarioId, language, transcript[], uiSockets[], callSid, closed }
 */
const sessions = new Map();

function makeSession(payload) {
  const sessionId = randomUUID();
  const session = {
    sessionId,
    scenarioId: payload.scenarioId,
    language: payload.language || "hi",
    ctx: payload.ctx,
    transcript: [], // [{ role: 'agent'|'counterparty', text, at }]
    uiSockets: new Set(),
    callSid: null,
    closed: false,
    outcome: null,
    startedAt: Date.now(),
  };
  sessions.set(sessionId, session);
  return session;
}

function broadcastToUI(session, message) {
  const data = JSON.stringify(message);
  for (const ws of session.uiSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(data); } catch {}
    }
  }
}

// ---------------------------------------------------------------------------
// REST endpoints
// ---------------------------------------------------------------------------

app.get("/api/scenarios", (_req, res) => {
  res.json(
    Object.values(scenarios).map((s) => ({
      id: s.id,
      label: s.label,
      defaultLanguage: s.defaultLanguage,
    }))
  );
});

/**
 * Simulated call — no Twilio, no OpenAI. For rehearsals and UI testing with $0 spend.
 */
app.post("/api/call/mock", (req, res) => {
  try {
    const { scenarioId, language, ctx } = req.body;
    if (!scenarios[scenarioId]) return res.status(400).json({ error: "Unknown scenario" });
    const session = makeSession({ scenarioId, language, ctx });
    session.isMock = true;
    res.json({ sessionId: session.sessionId, mock: true });
    queueMicrotask(() => {
      runMockCall(session).catch((e) => console.error("runMockCall:", e));
    });
  } catch (err) {
    console.error("POST /api/call/mock failed:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post("/api/call", async (req, res) => {
  try {
    const { scenarioId, to, language, ctx } = req.body;
    if (!scenarios[scenarioId]) return res.status(400).json({ error: "Unknown scenario" });
    if (!to) return res.status(400).json({ error: "Missing `to` number" });
    if (!realCallConfigured()) {
      return res.status(503).json({
        error:
          "Real calls are not configured (need OPENAI_API_KEY, Twilio creds, TWILIO_FROM_NUMBER, PUBLIC_HOSTNAME). Use Run mock call (free) or complete .env.",
      });
    }

    const session = makeSession({ scenarioId, language, ctx });

    // Build absolute URLs Twilio will call.
    const host = PUBLIC_HOSTNAME.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const twimlUrl = `https://${host}/twiml?sessionId=${session.sessionId}`;
    const statusUrl = `https://${host}/call-status?sessionId=${session.sessionId}`;

    const call = await getTwilioClient().calls.create({
      to,
      from: TWILIO_FROM_NUMBER,
      url: twimlUrl,
      statusCallback: statusUrl,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      record: true,
    });

    session.callSid = call.sid;
    res.json({ sessionId: session.sessionId, callSid: call.sid });
  } catch (err) {
    console.error("POST /api/call failed:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Twilio fetches this when the call connects.
app.post("/twiml", (req, res) => {
  if (!PUBLIC_HOSTNAME) {
    res.type("text/xml");
    return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Server misconfiguration: PUBLIC_HOSTNAME missing.</Say></Response>`);
  }
  const sessionId = req.query.sessionId;
  const host = PUBLIC_HOSTNAME.replace(/^https?:\/\//, "").replace(/\/$/, "");
  // Twilio <Stream> strips query-string args from the url — must use <Parameter> for the sessionId.
  // https://www.twilio.com/docs/voice/twiml/stream#custom-parameters
  const streamUrl = `wss://${host}/media-stream`;
  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="sessionId" value="${sessionId}" />
    </Stream>
  </Connect>
</Response>`);
});

app.post("/call-status", async (req, res) => {
  const sessionId = req.query.sessionId;
  const status = req.body.CallStatus;
  const session = sessions.get(sessionId);
  if (session) {
    broadcastToUI(session, { type: "call-status", status });
    if (status === "completed") {
      await summarizeSession(session).catch((e) =>
        console.error("summarize error:", e)
      );
    }
  }
  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Post-call summary + translation (GPT-4o text model)
// ---------------------------------------------------------------------------
const LANGUAGE_NAMES = {
  hi: "Hindi",
  es: "Spanish",
  zh: "Mandarin Chinese",
  en: "English",
  vi: "Vietnamese",
  ar: "Arabic",
  tl: "Tagalog",
};

async function gpt(messages) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_TEXT_MODEL,
      temperature: 0.2,
      messages,
    }),
  });
  if (!r.ok) throw new Error(`OpenAI chat error: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.choices[0].message.content;
}

async function translateLine(text, lang) {
  if (!lang || lang === "en") return text;
  const langName = LANGUAGE_NAMES[lang] || lang;
  try {
    return await gpt([
      {
        role: "system",
        content: `Translate the user's text to ${langName}. Output only the translation, no quotes, no commentary.`,
      },
      { role: "user", content: text },
    ]);
  } catch (e) {
    console.error("translate error:", e.message);
    return null;
  }
}

async function summarizeSession(session) {
  if (session.outcome) return;
  const transcriptText = session.transcript
    .map((t) => `${t.role === "agent" ? "Agent" : "Other party"}: ${t.text}`)
    .join("\n");
  if (!transcriptText.trim()) {
    session.outcome = { summary_en: "(no conversation captured)", summary_native: "", status: "empty" };
    broadcastToUI(session, { type: "outcome", outcome: session.outcome });
    return;
  }
  const langName = LANGUAGE_NAMES[session.language] || "Hindi";
  try {
    const raw = await gpt([
      {
        role: "system",
        content:
          "You are an assistant that summarizes a phone call the agent placed on behalf of a user. " +
          "Return a compact JSON object with keys: outcome (one of: commitment, partial, refused, unclear), " +
          `summary_en (3-5 bullet sentences, plain text), summary_native (same summary translated to ${langName}), ` +
          "next_steps_en (array of short strings), next_steps_native (same array translated), " +
          "commitments (array of {what, when, who}). No prose outside the JSON.",
      },
      {
        role: "user",
        content: `Transcript:\n${transcriptText}`,
      },
    ]);
    // Strip code fences if the model added any.
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    session.outcome = JSON.parse(cleaned);
  } catch (e) {
    console.error("summarize parse error:", e.message);
    session.outcome = { outcome: "unclear", summary_en: "Summary unavailable.", summary_native: "" };
  }
  broadcastToUI(session, { type: "outcome", outcome: session.outcome });
}

// ---------------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/media-stream" || url.pathname === "/ui") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.crossCallPath = url.pathname;
      ws.crossCallSessionId = url.searchParams.get("sessionId");
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  if (ws.crossCallPath === "/ui") {
    handleUISocket(ws);
  } else if (ws.crossCallPath === "/media-stream") {
    handleTwilioMediaSocket(ws);
  }
});

// --- UI socket: browser <-> server (live transcript) ---
function handleUISocket(ws) {
  const sessionId = ws.crossCallSessionId;
  const session = sessions.get(sessionId);
  if (!session) {
    ws.send(JSON.stringify({ type: "error", message: "Unknown sessionId" }));
    ws.close();
    return;
  }
  session.uiSockets.add(ws);
  // Replay any transcript already accumulated (useful if UI reconnects).
  for (const t of session.transcript) {
    ws.send(JSON.stringify({ type: "transcript", ...t }));
  }
  if (session.outcome) {
    ws.send(JSON.stringify({ type: "outcome", outcome: session.outcome }));
  }
  ws.on("close", () => session.uiSockets.delete(ws));
}

// --- Twilio media stream socket: bridges to OpenAI Realtime ---
function handleTwilioMediaSocket(twilioWs) {
  // sessionId arrives from Twilio's <Parameter> in the `start` event — NOT the URL query
  // (Twilio strips query params from <Stream url>). We lazily init once `start` lands.
  // See: https://www.twilio.com/docs/voice/twiml/stream#custom-parameters
  if (!OPENAI_API_KEY) {
    console.error("media-stream: OPENAI_API_KEY missing");
    twilioWs.close();
    return;
  }

  let sessionId = null;
  let session = null;
  let openAiWs = null;
  let streamSid = null;
  /** When Twilio reports DTMF (e.g. trial "press any key"), OpenAI server_vad often fires
   * `speech_started` on the tone. Sending `clear` to Twilio right then wipes outbound audio
   * and can make the call drop or sound like an immediate hang-up. */
  let lastInboundDtmfAt = 0;
  let twilioStreamStartedAt = 0;
  const BARGE_IN_CLEAR_IGNORE_MS = 1800;

  let assistantBuffer = ""; // accumulating text of current AI response
  let userBuffer = ""; // accumulating partial transcription of other party

  function bootOpenAi() {
    const { instructions, openingLine, voice } = buildPrompt(session.scenarioId, session.ctx || {});
    console.log(`[${sessionId}] media-stream opened, scenario=${session.scenarioId}`);

    openAiWs = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${OPENAI_REALTIME_MODEL}`,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      }
    );

    openAiWs.on("open", () => onOpenAiOpen(instructions, openingLine, voice));
    openAiWs.on("message", onOpenAiMessage);
    openAiWs.on("close", () => console.log(`[${sessionId}] OpenAI closed`));
    openAiWs.on("error", (e) => console.error(`[${sessionId}] OpenAI error:`, e.message));
  }

  function onOpenAiOpen(instructions, openingLine, voice) {
    console.log(`[${sessionId}] OpenAI Realtime connected`);
    openAiWs.send(
      JSON.stringify({
        type: "session.update",
        session: {
          // Slightly less sensitive VAD reduces false "speech" on DTMF / line noise (e.g. trial keypress).
          turn_detection: { type: "server_vad", threshold: 0.62, silence_duration_ms: 650 },
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          voice: voice || "alloy",
          instructions,
          modalities: ["text", "audio"],
          temperature: 0.7,
          input_audio_transcription: { model: "whisper-1" },
        },
      })
    );
    // Kick off with an opening line so the AI speaks first when the callee picks up.
    openAiWs.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: openingLine }],
        },
      })
    );
    openAiWs.send(JSON.stringify({ type: "response.create" }));
  }

  async function onOpenAiMessage(raw) {
    let evt;
    try { evt = JSON.parse(raw.toString()); } catch { return; }

    switch (evt.type) {
      case "response.audio.delta": {
        if (streamSid && evt.delta) {
          twilioWs.send(
            JSON.stringify({
              event: "media",
              streamSid,
              media: { payload: evt.delta },
            })
          );
        }
        break;
      }
      case "response.audio_transcript.delta": {
        assistantBuffer += evt.delta || "";
        break;
      }
      case "response.audio_transcript.done":
      case "response.done": {
        const text = assistantBuffer.trim();
        assistantBuffer = "";
        if (text && session) await pushTranscript(session, "agent", text);
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const text = (evt.transcript || "").trim();
        if (text && session) await pushTranscript(session, "counterparty", text);
        break;
      }
      case "input_audio_buffer.speech_started": {
        if (!streamSid) break;
        const msSinceDtmf = Date.now() - lastInboundDtmfAt;
        if (lastInboundDtmfAt && msSinceDtmf < BARGE_IN_CLEAR_IGNORE_MS) {
          console.log(
            `[${sessionId}] skip barge-in clear (${msSinceDtmf}ms after DTMF — likely trial keypress tone)`
          );
          break;
        }
        const msSinceTwilioStart = twilioStreamStartedAt ? Date.now() - twilioStreamStartedAt : Infinity;
        if (twilioStreamStartedAt && msSinceTwilioStart < 120) {
          console.log(`[${sessionId}] skip barge-in clear (${msSinceTwilioStart}ms after Twilio start — ordering)`);
          break;
        }
        twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
        break;
      }
      case "error": {
        console.error(`[${sessionId}] OpenAI error:`, JSON.stringify(evt));
        break;
      }
      default:
        break;
    }
  }

  twilioWs.on("message", (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }
    switch (data.event) {
      case "connected":
        console.log(`media-stream: Twilio connected`);
        break;
      case "start": {
        streamSid = data.start.streamSid;
        twilioStreamStartedAt = Date.now();
        // Twilio sends custom <Parameter> values here.
        const params = data.start.customParameters || {};
        const incomingSessionId = params.sessionId || params.sessionid || null;
        if (!incomingSessionId) {
          console.error(`media-stream: start with no sessionId param — closing. start=`, JSON.stringify(data.start));
          try { twilioWs.close(); } catch {}
          return;
        }
        sessionId = incomingSessionId;
        session = sessions.get(sessionId);
        if (!session) {
          console.error(`media-stream: unknown sessionId ${sessionId} — closing`);
          try { twilioWs.close(); } catch {}
          return;
        }
        console.log(`[${sessionId}] Twilio stream started ${streamSid}`);
        bootOpenAi();
        break;
      }
      case "dtmf":
        lastInboundDtmfAt = Date.now();
        console.log(`[${sessionId}] Twilio DTMF digit=${data.dtmf?.digit ?? "?"}`);
        break;
      case "media":
        if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
          openAiWs.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: data.media.payload,
            })
          );
        }
        break;
      case "stop":
        console.log(`[${sessionId}] Twilio stream stopped`);
        try { if (openAiWs) openAiWs.close(); } catch {}
        try { twilioWs.close(); } catch {}
        break;
      default:
        break;
    }
  });

  twilioWs.on("close", () => {
    console.log(`[${sessionId || "?"}] Twilio ws closed`);
    try { if (openAiWs) openAiWs.close(); } catch {}
  });
  twilioWs.on("error", (e) => console.error(`[${sessionId}] Twilio ws error:`, e.message));
}

async function pushTranscript(session, role, text) {
  const entry = { role, text, at: Date.now() };
  session.transcript.push(entry);
  broadcastToUI(session, { type: "transcript", ...entry });

  // Fire-and-forget translation to the user's language.
  if (session.language && session.language !== "en") {
    translateLine(text, session.language).then((translated) => {
      if (translated) {
        broadcastToUI(session, {
          type: "transcript-translation",
          at: entry.at,
          role,
          translated,
        });
      }
    });
  }
}

server.listen(PORT, () => {
  console.log(`\nCrossCall server listening on http://localhost:${PORT}`);
  if (realCallConfigured()) {
    console.log(`Public host (for Twilio + WSS):  ${PUBLIC_HOSTNAME}`);
    console.log(`Real outbound calls: enabled. Use ngrok (or similar) on port ${PORT}.`);
  } else {
    console.log(
      "Real outbound calls: disabled (set OPENAI_API_KEY, Twilio creds, TWILIO_FROM_NUMBER, PUBLIC_HOSTNAME)."
    );
    console.log('Mock calls: enabled — click "Run mock call (free)" in the UI.');
  }
});
