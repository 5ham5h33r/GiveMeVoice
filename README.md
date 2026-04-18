# GiveMeVoice

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

**Voice-first agent that places and answers real phone calls on behalf of a user**—in the callee’s language for the call, with a **live transcript** and **summary in the user’s language** (e.g. Hindi). Built with **Twilio** (PSTN + Media Streams) and **OpenAI Realtime** (speech-to-speech), plus a small **Express** server and browser UI.

> The phone call is the barrier. GiveMeVoice is the follow-through: dial, negotiate, answer, record, summarize.

## Table of contents

- [Features](#features)
- [Stack](#stack)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Full local setup: real calls and ngrok](#full-local-setup-real-calls-and-ngrok)
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

- **Outbound & Inbound calls** via Twilio; **real-time voice** via OpenAI Realtime bridged over μ-law audio.
- **Inbound Persona Options**: The agent can act on your behalf to answer calls, speak in a custom designated language, and operate under personalized instructions.
- **Live UI**: transcript, optional line-by-line translation, post-call **outcome** JSON (commitment / partial / refused / unclear + next steps).
- **Mock mode**: full UI rehearsal with **no** Twilio, OpenAI, or tunnel—canned dialogue and outcome.
- **Scenarios** (prompted flows): landlord habitability (CA §1941.1 framing), utility hardship, wage-claim intake info, school records, and inbound message taking—see `prompts.js`.
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

After you clone the repo:

```bash
git clone https://github.com/5ham5h33r/GiveMeVoice.git
cd GiveMeVoice
npm install
npm start
```

Open **http://localhost:5050** in the browser (use a real `http://` URL so WebSockets work—not `file://`).

- **Try the UI without phones or APIs:** click **Run mock call (free — no phone, no APIs)**. No `.env` file required.
- **Place or receive real calls:** you need a filled-in `.env`, **and** a public HTTPS URL (usually **ngrok**) so Twilio can reach your laptop. Follow **[Full local setup: real calls and ngrok](#full-local-setup-real-calls-and-ngrok)** below.

```bash
# optional: watch mode
npm run dev
```

## Full local setup: real calls and ngrok

Twilio runs in the cloud. It must **POST** webhooks to your server and open a **WSS** media stream to your machine. **`localhost` is not reachable from the internet**, so on your own computer you expose port `5050` (or whatever you set in `PORT`) with a tunnel. This repo assumes **[ngrok](https://ngrok.com/)**; any similar HTTPS + WebSocket–capable tunnel works if you point Twilio at it the same way.

### 1. Install dependencies and create `.env`

```bash
cd GiveMeVoice
npm install
cp .env.example .env
# Windows (cmd/PowerShell):  copy .env.example .env
```

Edit `.env` and set at least: `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID` (must start with `AC`), `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (E.164, e.g. `+15551234567`). You can leave `PUBLIC_HOSTNAME` empty until step 4.

### 2. Start GiveMeVoice (first terminal)

```bash
npm start
```

Leave this running. Confirm the log shows the server on **http://localhost:5050** (or your `PORT`).

### 3. Start ngrok (second terminal)

1. Install ngrok: [ngrok download](https://ngrok.com/download). One-time setup: add your authtoken from the [ngrok dashboard](https://dashboard.ngrok.com/) (`ngrok config add-authtoken <your-token>`).
2. Open a **new** terminal (keep `npm start` running).
3. Run ngrok on the **same port** as the app (default `5050`):

   ```bash
   ngrok http 5050
   ```

   If you set `PORT=3000` in `.env`, use `ngrok http 3000` instead.

4. In the ngrok terminal output, find the **Forwarding** line, for example:

   ```text
   Forwarding   https://monsoon-example.ngrok-free.dev -> http://localhost:5050
   ```

   Copy **only the hostname** — here `monsoon-example.ngrok-free.dev`.  
   **Do not** include `https://`, paths, or query strings. That string is your `PUBLIC_HOSTNAME`.

5. Optional: open **http://127.0.0.1:4040** for ngrok’s local inspector (every HTTP request Twilio sends will show up there — useful when debugging webhooks).

### 4. Put the hostname in `.env` and restart Node

In `.env`:

```env
PUBLIC_HOSTNAME=monsoon-example.ngrok-free.dev
```

Stop the server (Ctrl+C in the first terminal) and run `npm start` again. The startup log should print your public host so you know Twilio and WSS URLs will match.

### 5. Point Twilio at this tunnel (inbound)

For **incoming** calls to your Twilio number:

1. [Twilio Console](https://console.twilio.com/) → **Phone Numbers** → **Manage** → **Active numbers** → select your Voice number.
2. Under **Voice Configuration**, set **A call comes in** to **Webhook** (or compatible handler).
3. URL: `https://<PUBLIC_HOSTNAME>/incoming-call` — for example `https://monsoon-example.ngrok-free.dev/incoming-call`.
4. HTTP method: **POST** → **Save**.

Outbound calls use URLs built from `PUBLIC_HOSTNAME` when the app creates the call; they still require ngrok (or your deployed host) to be up and the hostname to match.

### 6. Use the app

- **Outbound:** [http://localhost:5050](http://localhost:5050) — choose a scenario and place a call.
- **Inbound:** [http://localhost:5050/inbound](http://localhost:5050/inbound) — set persona/language, save, then call your Twilio number.

### ngrok checklist (when something fails)

| Check | Why it matters |
|--------|----------------|
| **Two processes running** | `npm start` **and** `ngrok http <PORT>` must both be active while you test. |
| **Same port** | `ngrok http` port = `PORT` in `.env` (default `5050`). |
| **No `https://` in `PUBLIC_HOSTNAME`** | Should be hostname only, e.g. `something.ngrok-free.dev`. |
| **Restart after `.env` change** | Node only reads env at startup. |
| **New ngrok URL** | Free ngrok URLs often change when you restart ngrok. Put the new hostname in `.env`, restart the server, and **update the Twilio inbound webhook** to the new `https://…/incoming-call` URL. |
| **Twilio logs** | If Twilio never hits your machine, confirm the webhook URL in Console matches your current `PUBLIC_HOSTNAME`. |

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
4. Complete **[Full local setup: real calls and ngrok](#full-local-setup-real-calls-and-ngrok)** (two terminals, `PUBLIC_HOSTNAME`, inbound webhook `https://<PUBLIC_HOSTNAME>/incoming-call` if you test inbound).  
5. Open `http://localhost:5050` → fill **Their phone number** in **E.164** → **Make the call on my behalf**.

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
  POST /incoming-call→ Twilio webhook for inbound calls
  POST /twiml        → <Connect><Stream> → WSS /media-stream
  WSS /media-stream  → audio ↔ OpenAI Realtime (g711_ulaw)
  POST /call-status  → Twilio status → optional summary job
```

Audio is **8 kHz μ-law** end-to-end through Realtime; the server forwards base64 media frames and relays transcript events to the browser.

## HTTP & WebSocket routes

| Method / protocol | Path | Purpose |
|-------------------|------|---------|
| `GET` | `/` | Static UI (`public/index.html`) for outbound calls |
| `GET` | `/inbound` | Static UI (`public/inbound.html`) for configuring inbound calls |
| `GET` | `/api/scenarios` | JSON list of scenario ids |
| `POST` | `/api/call` | Start **real** outbound call (requires full `.env`) |
| `POST` | `/api/call/mock` | Start **mock** session (no Twilio/OpenAI) |
| `POST` | `/incoming-call` | Twilio Voice webhook for inbound calls |
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
| Lost after clone — what order? | See [Full local setup: real calls and ngrok](#full-local-setup-real-calls-and-ngrok): install → `.env` → `npm start` → **second terminal** `ngrok http <PORT>` → set `PUBLIC_HOSTNAME` → restart Node |

## Safety & compliance

- The agent **identifies as an assistant** when asked; it does **not** give legal advice. It may **cite** statutes factually, like a scripted caller—not as a lawyer.  
- **Recording:** real calls use Twilio `record: true` so the user has a record of what was said on their behalf.  
- **User control:** facts and authorization come from the form; the UI shows both sides of the transcript.  
- **Mock data** is synthetic for UI testing only.

## Repository layout

| Path | Role |
|------|------|
| `server.js` | Express app, Twilio + OpenAI Realtime bridge, UI WebSocket |
| `inbound-config.json` | Configured inbound settings (language, persona) |
| `mockCall.js` | Scripted mock conversation + outcome |
| `prompts.js` | Scenario system prompts |
| `public/` | Static UI (`index.html`, `inbound.html`, `outbound.js`, `inbound.js`, `shared.js`, `style.css`) |
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
