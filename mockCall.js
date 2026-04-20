/**
 * Simulated phone call for local / hackathon testing — no Twilio, no OpenAI.
 * Drives the same WebSocket transcript + outcome shape as a real call.
 */

import { WebSocket } from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function t(ctx, en, translations = {}) {
  return { en, translations };
}

function landlordScript(ctx) {
  const name = ctx.userName || "the tenant";
  const addr = ctx.address || "the unit";
  const co = ctx.counterpartyName || "the property office";
  return {
    turns: [
      {
        delayMs: 0,
        role: "agent",
        ...t(ctx, `Hello, this is an authorized assistant calling on behalf of ${name}, who rents at ${addr}. I'm calling to arrange a repair. Am I speaking with the right person for maintenance at ${co}?`, {
          hi: `नमस्ते, मैं ${name} की ओर से एक अधिकृत सहायक बोल रहा/रही हूँ, जो ${addr} पर किराए पर रहते/रहती हैं। मैं मरम्मत के लिए फोन कर रहा/रही हूँ। क्या मैं ${co} के लिए सही व्यक्ति से बात कर रहा/रही हूँ?`,
          es: `Hola, soy un asistente autorizado que llama en nombre de ${name}, quien alquila en ${addr}. Llamo para coordinar una reparación. ¿Hablo con la persona correcta de mantenimiento en ${co}?`,
        }),
      },
      {
        delayMs: 1400,
        role: "counterparty",
        ...t(ctx, "This is the office. What's the issue?", {
          hi: "यह ऑफिस है। समस्या क्या है?",
          es: "Oficina. ¿Cuál es el problema?",
        }),
      },
      {
        delayMs: 1600,
        role: "agent",
        ...t(
          ctx,
          `The heating has been out for some time at ${addr}. It is affecting habitability. Under California Civil Code section 1941.1, the landlord must maintain the premises in habitable condition. ${name} is formally requesting a repair appointment.`,
          {
            hi: `${addr} पर काफ़ी समय से हीटिंग बंद है। यह रहने योग्यता को प्रभावित कर रहा है। कैलिफ़ोर्निया सिविल कोड धारा 1941.1 के तहत मकान मालिक को परिसर को रहने योग्य रखना होता है। ${name} औपचारिक रूप से मरम्मत का समय माँग रहे/रही हैं।`,
            es: `La calefacción lleva tiempo sin funcionar en ${addr}. Afecta la habitabilidad. Bajo el Código Civil de California sección 1941.1, el arrendador debe mantener la vivienda habitable. ${name} solicita formalmente una cita de reparación.`,
          }
        ),
      },
      {
        delayMs: 1500,
        role: "counterparty",
        ...t(ctx, "We're very backed up. Maybe next month.", {
          hi: "हमारे पास बहुत काम है। शायद अगले महीने।",
          es: "Estamos muy ocupados. Quizá el próximo mes.",
        }),
      },
      {
        delayMs: 1800,
        role: "agent",
        ...t(
          ctx,
          `I understand you're busy. The issue is urgent for health and safety. Can we schedule a technician within the next few days? If not, I will note that no appointment was offered today.`,
          {
            hi: "मैं समझता/समझती हूँ कि आप व्यस्त हैं। स्वास्थ्य और सुरक्षा के लिए यह ज़रूरी है। क्या हम अगले कुछ दिनों में तकनीशियन का समय निर्धारित कर सकते हैं? यदि नहीं, तो मैं दर्ज करूँगा/गी कि आज कोई समय नहीं दिया गया।",
            es: "Entiendo que están ocupados. Es urgente por salud y seguridad. ¿Podemos programar un técnico en los próximos días? Si no, registraré que hoy no se ofreció cita.",
          }
        ),
      },
      {
        delayMs: 1600,
        role: "counterparty",
        ...t(ctx, "Okay — we'll send someone Saturday at 10 a.m. Name's Jake Martinez, maintenance coordinator.", {
          hi: "ठीक है — हम शनिवार सुबह 10 बजे किसी को भेजेंगे। नाम जेक मार्टिनेज़, मेंटेनेंस कोऑर्डिनेटर।",
          es: "Bien: enviaremos a alguien el sábado a las 10 a. m. Jake Martínez, coordinador de mantenimiento.",
        }),
      },
      {
        delayMs: 1400,
        role: "agent",
        ...t(
          ctx,
          `Thank you, Jake. To confirm: a technician will arrive Saturday at 10 a.m. for the heating at ${addr}. I'll share this with ${name}. Thank you for your time.`,
          {
            hi: `धन्यवाद, जेक। पुष्टि के लिए: ${addr} पर हीटिंग के लिए शनिवार सुबह 10 बजे तकनीशियन आएगा। मैं यह ${name} के साथ साझा करूँगा/गी। आपके समय के लिए धन्यवाद।`,
            es: `Gracias, Jake. Confirmo: un técnico llegará el sábado a las 10 a. m. por la calefacción en ${addr}. Lo compartiré con ${name}. Gracias por su tiempo.`,
          }
        ),
      },
    ],
    outcomeForLang(lang, c) {
      const n = c.userName || "the tenant";
      const a = c.address || "the unit";
      const coName = c.counterpartyName || "the property office";
      if (lang === "hi") {
        return {
          outcome: "commitment",
          summary_en: `CrossCall reached ${coName} on behalf of ${n}. The office initially delayed repairs but agreed after the agent held firm on habitability and Civil Code §1941.1. Jake Martinez committed to a Saturday 10 a.m. technician visit for heating at ${a}.`,
          summary_native: `${n} की ओर से CrossCall ने ${coName} से संपर्क किया। शुरू में मरम्मट टाली गई, लेकिन एजेंट ने रहने योग्यता और सिविल कोड §1941.1 पर ज़ोर देने के बाद सहमति मिली। जेक मार्टिनेज़ ने ${a} पर हीटिंग के लिए शनिवार सुबह 10 बजे तकनीशियन भेजने की प्रतिबद्धता जताई।`,
          next_steps_en: [
            "Be home or have someone admit the tech Saturday 10 a.m.",
            "Text photos of the heater/plate if anything changes before then.",
            "If they no-show, document and call back through CrossCall.",
          ],
          next_steps_native: [
            "शनिवार सुबह 10 बजे घर पर रहें या किसी को तकनीशियन को अंदर लाने दें।",
            "तब तक हीटर की तस्वीरें भेजें अगर स्थिति बदलती है।",
            "अगर वे न आएं, तो लिखित नोट रखें और CrossCall से दोबारा कॉल करवाएँ।",
          ],
          commitments: [
            { what: "Heating repair technician", when: "Saturday 10:00 a.m.", who: "Jake Martinez" },
          ],
        };
      }
      if (lang === "es") {
        return {
          outcome: "commitment",
          summary_en: `CrossCall reached ${coName} for ${n}. After pushback, Jake Martínez agreed to send a technician Saturday 10 a.m. for heating at ${a}.`,
          summary_native: `CrossCall contactó a ${co} por ${n}. Tras la resistencia inicial, Jake Martínez acordó enviar un técnico el sábado a las 10 a. m. por la calefacción en ${a}.`,
          next_steps_en: ["Be available Saturday 10 a.m.", "Photo-document the unit before/after if possible."],
          next_steps_native: ["Disponible sábado 10 a. m.", "Fotos antes/después si es posible."],
          commitments: [{ what: "Reparación de calefacción", when: "Sábado 10:00", who: "Jake Martínez" }],
        };
      }
      return {
        outcome: "commitment",
        summary_en: `CrossCall reached ${coName} for ${n}. Maintenance coordinator Jake Martinez scheduled a heating repair for Saturday at 10 a.m. at ${a}.`,
        summary_native: `CrossCall reached ${coName} for ${n}. Maintenance coordinator Jake Martinez scheduled a heating repair for Saturday at 10 a.m. at ${a}.`,
        next_steps_en: ["Be available Saturday 10 a.m.", "Keep a photo log if conditions worsen."],
        next_steps_native: ["Be available Saturday 10 a.m.", "Keep a photo log if conditions worsen."],
        commitments: [{ what: "Heating repair", when: "Saturday 10:00 a.m.", who: "Jake Martinez" }],
      };
    },
  };
}

function genericScript(scenarioId, ctx) {
  const name = ctx.userName || "the caller";
  const addr = ctx.address || "the address on file";
  const co = ctx.counterpartyName || "the office";
  const labels = {
    utility: "hardship extension on a shutoff notice",
    wagetheft: "how to start a wage claim in California",
    school: "student records and enrollment steps",
  };
  let topic;
  if (scenarioId === "custom") {
    const objective = (ctx.objective || "").trim();
    topic =
      (objective.split(/[.!?\n]/)[0] || "").trim().slice(0, 140) ||
      "your request";
  } else {
    topic = labels[scenarioId] || "your request";
  }

  return {
    turns: [
      {
        delayMs: 0,
        role: "agent",
        ...t(
          ctx,
          `Hello, I'm an authorized assistant calling on behalf of ${name}. I'm calling about ${topic} for ${addr}. Am I speaking with the right department at ${co}?`,
          {
            hi: `नमस्ते, मैं ${name} की ओर से एक अधिकृत सहायक हूँ। मैं ${addr} के लिए ${topic} के बारे में फोन कर रहा/रही हूँ। क्या मैं ${co} के सही विभाग से बात कर रहा/रही हूँ?`,
            es: `Hola, soy un asistente autorizado que llama en nombre de ${name}. Llamo sobre ${topic} para ${addr}. ¿Es el departamento correcto en ${co}?`,
          }
        ),
      },
      {
        delayMs: 1300,
        role: "counterparty",
        ...t(ctx, "Yes, this is the right desk. What do you need specifically?", {
          hi: "हाँ, यह सही डेस्क है। आपको विशेष रूप से क्या चाहिए?",
          es: "Sí, departamento correcto. ¿Qué necesita exactamente?",
        }),
      },
      {
        delayMs: 1500,
        role: "agent",
        ...t(
          ctx,
          `Please walk us through the forms, deadlines, and any phone numbers or portals ${name} should use. We're taking notes for them in real time.`,
          {
            hi: `कृपया फॉर्म, समय सीमा, और कोई फोन नंबर या पोर्टल बताएँ जो ${name} को उपयोग करना चाहिए। हम उनके लिए नोट्स ले रहे हैं।`,
            es: `Indique formularios, plazos y teléfonos o portales que ${name} deba usar. Estamos tomando notas.`,
          }
        ),
      },
      {
        delayMs: 1600,
        role: "counterparty",
        ...t(ctx, "Sure — start with Form A online, allow 10 business days, and call this main line if the portal stalls.", {
          hi: "ठीक है — ऑनलाइन फॉर्म A से शुरू करें, 10 कार्य दिवस लग सकते हैं, और अगर पोर्टल रुके तो इस मुख्य लाइन पर कॉल करें।",
          es: "Bien: empiece con el formulario A en línea, espere ~10 días hábiles y llame a la línea principal si el portal falla.",
        }),
      },
      {
        delayMs: 1200,
        role: "agent",
        ...t(ctx, `Thank you. I'll relay that to ${name} and they may follow up if anything is unclear.`, {
          hi: `धन्यवाद। मैं यह ${name} तक पहुँचाऊँगा/गी और अगर कुछ अस्पष्ट हो तो वे फिर से संपर्क कर सकते हैं।`,
          es: `Gracias. Lo transmitiré a ${name}; pueden volver a llamar si algo no queda claro.`,
        }),
      },
    ],
    outcomeForLang(lang, c) {
      const base = {
        outcome: "partial",
        summary_en: `CrossCall reached ${co} for ${c.userName || "the user"}. Staff shared procedural next steps (forms, timeline, main line). No firm appointment was locked in — user should complete online intake and keep receipts.`,
        commitments: [],
      };
      if (lang === "hi") {
        return {
          ...base,
          summary_native: `CrossCall ने ${co} तक ${c.userName || "उपयोगकर्ता"} के लिए पहुँच बनाई। स्टाफ ने प्रक्रिया के अगले चरण बताए (फॉर्म, समय, मुख्य लाइन)। कोई ठोस अपॉइंटमेंट तय नहीं हुआ — उपयोगकर्ता को ऑनलाइन आवेदन पूरा करना चाहिए और रसीदें रखनी चाहिए।`,
          next_steps_en: ["Complete Form A online", "Screenshot confirmation numbers", "Call back if portal errors"],
          next_steps_native: ["ऑनलाइन फॉर्म A पूरा करें", "पुष्टि नंबर का स्क्रीनशॉट लें", "पोर्टल में त्रुटि हो तो दोबारा कॉल करें"],
        };
      }
      return {
        ...base,
        summary_native: base.summary_en,
        next_steps_en: ["Complete Form A online", "Save confirmation IDs", "Call back if stuck"],
        next_steps_native: ["Complete Form A online", "Save confirmation IDs", "Call back if stuck"],
      };
    },
  };
}

export function getMockScript(scenarioId, ctx) {
  if (scenarioId === "landlord") return landlordScript(ctx);
  return genericScript(scenarioId, ctx);
}

export async function runMockCall(session) {
  const script = getMockScript(session.scenarioId, session.ctx || {});
  const lang = session.language || "en";

  broadcast(session, { type: "call-status", status: "ringing" });
  await sleep(700);
  broadcast(session, { type: "call-status", status: "answered" });
  await sleep(350);
  broadcast(session, { type: "call-status", status: "in-progress" });

  let tick = 0;
  for (const step of script.turns) {
    // If the user hung up from the UI, bail out cleanly.
    if (session.closed || session.userEnded) break;
    if (step.delayMs) await sleep(step.delayMs);
    if (session.closed || session.userEnded) break;
    const at = session.startedAt + ++tick;
    const translated = step.translations?.[lang] || null;
    pushMockTurn(session, step.role, step.en, at, translated);
  }

  await sleep(500);
  const wasEndedByUser = session.userEnded;
  session.closed = true;
  if (!session.endedAt) session.endedAt = Date.now();
  broadcast(session, { type: "call-status", status: "completed" });
  // Still surface an outcome so the user sees a summary even if they hung up
  // mid-script — the partial transcript is usually enough for a useful summary.
  session.outcome = script.outcomeForLang(lang, session.ctx || {});
  if (wasEndedByUser && session.outcome && typeof session.outcome === "object") {
    session.outcome.outcome = session.outcome.outcome || "partial";
  }
  broadcast(session, { type: "outcome", outcome: session.outcome });
}

function broadcast(session, msg) {
  const data = JSON.stringify(msg);
  for (const ws of session.uiSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch {}
    }
  }
}

function pushMockTurn(session, role, text, at, translated) {
  session.transcript.push({ role, text, at });
  broadcast(session, { type: "transcript", role, text, at });
  if (translated && langNeedsNative(session.language)) {
    broadcast(session, { type: "transcript-translation", role, at, translated });
  }
}

function langNeedsNative(lang) {
  return lang && lang !== "en";
}
