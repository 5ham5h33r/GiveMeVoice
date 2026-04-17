# CrossCall

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

**Voice-first agent that places real phone calls on behalf of a user**—in the callee’s language for the call, with a **live transcript** and **summary in the user’s language** (e.g. Hindi). Built with **Twilio** (PSTN + Media Streams) and **OpenAI Realtime** (speech-to-speech), plus a small **Express** server and browser UI.

> The phone call is the barrier. CrossCall is the follow-through: dial, negotiate, record, summarize.

## Table of contents

- [Features](#features)
- [Stack](#stack)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Real calls with Twilio trial](#real-calls-with-twilio-trial)
- [Real calls with paid Twilio](#real-calls-with-paid-twilio)
- [Architecture](#architecture)
- [HTTP & WebSocket routes](#http--websocket-routes)
- [Costs](#costs)
- [Troubleshooting](#troubleshooting)
- [Safety & compliance](#safety--compliance)
- [Repository layout](#repository-layout)
- [Background](#background)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Outbound calls** via Twilio; **real-time voice** via OpenAI Realtime bridged over μ-law audio.
- **Live UI**: transcript, optional line-by-line translation, post-call **outcome** JSON (commitment / partial / refused / unclear + next steps).
- **Mock mode**: full UI rehearsal with **no** Twilio, OpenAI, or tunnel—canned dialogue and outcome.
- **Scenarios** (prompted flows): landlord habitability (CA §1941.1 framing), utility hardship, wage-claim intake info, school records—see `prompts.js`.
- Agent framed as **acting on the user’s behalf**; disclaims **legal advice**; identifies as an assistant when asked.

## Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 18+ (ES modules) |
| Server | Express, [`ws`](https://github.com/websockets/ws) |
| Telephony | [Twilio Voice](https://www.twilio.com/docs/voice) + [Media Streams](https://www.twilio.com/docs/voice/twiml/stream) |
| Voice AI | [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime) |
| Text | OpenAI Chat Completions (translation + structured summary) |

## Requirements

- **Node.js** ≥ 18  
- **Mock only:** nothing else.  
- **Real calls:** [Twilio](https://www.twilio.com) account + Voice number, [OpenAI](https://platform.openai.com) API key with billing, public **HTTPS/WSS** URL (e.g. [ngrok](https://ngrok.com)) pointing at this server.

## Quick start

```bash
git clone https://github.com/<your-username>/crosscall.git
cd crosscall
npm install
npm start
```

Open **http://localhost:5050** (use a real `http://` URL so WebSockets work—not `file://`).

Click **Run mock call (free — no phone, no APIs)**. No `.env` file required.

```bash
# optional: watch mode
npm run dev
```

## Configuration

Copy the example env file and edit values:

```bash
cp .env.example .env   # Windows: copy .env.example .env
```

| Variable | Required for real calls | Description |
|----------|-------------------------|-------------|
| `PORT` | No | HTTP port (default `5050`) |
| `OPENAI_API_KEY` | Yes | OpenAI secret key |
| `OPENAI_REALTIME_MODEL` | No | Realtime model id (default in `.env.example`) |
| `OPENAI_TEXT_MODEL` | No | Chat model for translation + summary |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Auth Token (**never commit**) |
| `TWILIO_FROM_NUMBER` | Yes | Twilio Voice number, **E.164** (e.g. `+15551234567`) |
| `PUBLIC_HOSTNAME` | Yes | Public host only: `your-subdomain.ngrok.app`—no `https://`, no path |

**Security:** Add `.env` to `.gitignore` (already listed). Rotate keys if exposed.

## Real calls with Twilio trial

Use a **trial** Twilio project to avoid Twilio charges while developing; you still need **OpenAI billing** for Realtime + chat.

| | Trial | Paid / upgraded Twilio |
|--|-------|-------------------------|
| **Destination numbers** | Only **[Verified Caller IDs](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account)** | Normal dialing per Twilio rules and your region |
| **Cost** | ~$15 promotional credit (typical); see Twilio docs | Metered—see [Voice pricing](https://www.twilio.com/voice/pricing) |
| **Outbound intro** | Often a short “trial account” message before your audio | Normal PSTN behavior |

**Checklist**

1. Buy a **Voice-capable** Twilio number.  
2. Verify **every** number you will dial (Console → Phone Numbers → Manage → Verified Caller IDs).  
3. OpenAI: enable billing + create API key with Realtime access.  
4. Run `ngrok http 5050` (or match `PORT` in `.env`).  
5. Set `PUBLIC_HOSTNAME` to the ngrok **hostname** (no scheme). Restart the app after ngrok URL changes.  
6. `npm start` → open `http://localhost:5050` → fill **Their phone number** in **E.164** → **Make the call on my behalf**.

Trial behavior (verified numbers, trial message) is documented by Twilio:  
[How to use your free trial account](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account).

## Real calls with paid Twilio

1. **Upgrade** Twilio (payment method) when you need unverified destinations and production-style calls—confirm limits in Twilio Console.  
2. Keep the same `.env` contract; `PUBLIC_HOSTNAME` must accept **HTTPS** (`POST /twiml`, status callbacks) and **WSS** (`/media-stream`, `/ui`).  
3. For stability beyond ngrok free URLs, deploy behind HTTPS (e.g. Fly.io, Render, Railway) with WebSocket support.

**Compliance:** Call only numbers and use cases you are allowed to use; obtain consent where required. This project does not provide legal advice.

## Architecture

```
Browser (form + live transcript)
        │  WSS /ui
        ▼
Node (Express + ws)
  POST /api/call     → Twilio REST outbound call
  POST /twiml        → <Connect><Stream> → WSS /media-stream
  WSS /media-stream  → audio ↔ OpenAI Realtime (g711_ulaw)
  POST /call-status  → Twilio status → optional summary job
```

Audio is **8 kHz μ-law** end-to-end through Realtime; the server forwards base64 media frames and relays transcript events to the browser.

## HTTP & WebSocket routes

| Method / protocol | Path | Purpose |
|-------------------|------|---------|
| `GET` | `/` | Static UI (`public/`) |
| `GET` | `/api/scenarios` | JSON list of scenario ids |
| `POST` | `/api/call` | Start **real** call (requires full `.env`) |
| `POST` | `/api/call/mock` | Start **mock** session (no Twilio/OpenAI) |
| `POST` | `/twiml` | Twilio Voice webhook (TwiML) |
| `POST` | `/call-status` | Twilio status callback |
| `WS` | `/ui?sessionId=` | Browser transcript + outcome stream |
| `WS` | `/media-stream?sessionId=` | Twilio Media Stream ↔ OpenAI |

## Costs

| Service | Notes |
|---------|--------|
| **Twilio trial** | Short tests often $0 until trial credit is used |
| **Twilio paid** | Per-minute Voice rates—see Twilio pricing |
| **OpenAI Realtime** | Per connected minute—see OpenAI pricing |
| **OpenAI Chat** | Small cost per call for translation + JSON summary |

Rough rule: several **short** real tests are often **under a few dollars** on OpenAI if you hang up promptly.

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| `503` on **Make the call** | Incomplete `.env` for real mode (OpenAI + Twilio + `PUBLIC_HOSTNAME`) |
| Invalid number / not verified | Trial: add callee to **Verified Caller IDs**; use **E.164** `+1…` |
| Silence after answer | ngrok host mismatch; OpenAI key/billing/Realtime access—check server logs |
| No transcript in UI | Use `http://localhost:PORT`, not `file://`; WebSocket must reach same origin |
| TwiML never hits server | `PUBLIC_HOSTNAME` must be publicly reachable; keep ngrok running |
| Port mismatch | `ngrok http` port = `PORT` in `.env` |

## Safety & compliance

- The agent **identifies as an assistant** when asked; it does **not** give legal advice. It may **cite** statutes factually, like a scripted caller—not as a lawyer.  
- **Recording:** real calls use Twilio `record: true` so the user has a record of what was said on their behalf.  
- **User control:** facts and authorization come from the form; the UI shows both sides of the transcript.  
- **Mock data** is synthetic for UI testing only.

## Repository layout

| Path | Role |
|------|------|
| `server.js` | Express app, Twilio + OpenAI Realtime bridge, UI WebSocket |
| `mockCall.js` | Scripted mock conversation + outcome |
| `prompts.js` | Scenario system prompts |
| `public/` | Static UI (`index.html`, `app.js`, `style.css`) |
| `.env.example` | Environment template |

## Background

Originated as a **GVO Spring Buildathon 2026** (USC) project—agentic voice access for situations where the PSTN call itself is the barrier (language, time, anxiety, disability, power imbalance).

<details>
<summary><strong>Optional: 3-minute demo narrative</strong></summary>

1. **Hook:** Many tenants cannot run a high-stakes English call with a landlord; navigation tools stop at “what to do,” not “doing the call.”  
2. **UI:** Show scenario + language + “acts on your behalf” copy.  
3. **Live call:** Teammate answers as the office; agent opens, states issue, cites §1941.1 calmly, negotiates time.  
4. **Hang up:** Outcome + next steps appear in the user’s language.  
5. **Roadmap:** Other scenarios, escalation partners—see issues / PRs.

</details>

## Contributing

Issues and pull requests are welcome. For real-call changes, avoid committing secrets; use `.env` locally only.

## License

[MIT](LICENSE).
