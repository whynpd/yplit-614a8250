// AI helpers — server only.
// Uses GEMINI_API_KEY (direct Google API) for mission generation per user request;
// falls back to Lovable AI Gateway for other helpers.

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function aiChat(opts: {
  model?: string;
  messages: ChatMessage[];
  json?: boolean;
  temperature?: number;
}): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const body: Record<string, unknown> = {
    model: opts.model ?? "google/gemini-3.1-flash-lite",
    messages: opts.messages,
    temperature: opts.temperature ?? 0.8,
  };
  if (opts.json) body.response_format = { type: "json_object" };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content ?? "";
}

export async function aiJson<T = unknown>(opts: {
  model?: string;
  system?: string;
  user: string;
  temperature?: number;
}): Promise<T> {
  const messages: ChatMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });
  const text = await aiChat({ model: opts.model, messages, json: true, temperature: opts.temperature });
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned) as T;
}

/**
 * Call Google Gemini directly with a fallback chain. The free-tier quota is
 * per-model, so if one model hits 429 we try the next. Order: lightest/cheapest
 * (highest quota) first, escalating to stronger models.
 */
const GEMINI_FALLBACK_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-2.5-pro",
] as const;

export async function geminiJson<T = unknown>(opts: {
  system?: string;
  user: string;
  model?: string;
  temperature?: number;
}): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY missing");
  const models = opts.model ? [opts.model, ...GEMINI_FALLBACK_MODELS] : [...GEMINI_FALLBACK_MODELS];
  const fullPrompt = opts.system ? `${opts.system}\n\n${opts.user}` : opts.user;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.95,
      responseMimeType: "application/json",
    },
  });

  const errors: string[] = [];
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (e) {
      errors.push(`${model}: network ${(e as Error).message}`);
      continue;
    }
    if (res.status === 429 || res.status === 503 || res.status === 404) {
      errors.push(`${model}: ${res.status}`);
      continue;
    }
    if (!res.ok) {
      const txt = (await res.text()).slice(0, 300);
      // Retryable on rate/quota wording even with other status codes
      if (/quota|rate/i.test(txt)) {
        errors.push(`${model}: ${res.status} ${txt.slice(0, 80)}`);
        continue;
      }
      throw new Error(`Gemini ${model} ${res.status}: ${txt}`);
    }
    const j = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      errors.push(`${model}: invalid JSON`);
      continue;
    }
  }
  throw new Error(`All Gemini models failed: ${errors.join(" | ")}`);
}

/** Score a bill guess: 0–100 pts using exponential decay on relative error. */
export function scoreGuess(actual: number, guess: number): number {
  if (!actual || actual <= 0) return 0;
  const diff = Math.abs(guess - actual) / actual;
  const pts = 100 * Math.exp(-3.2 * diff);
  return Math.round(Math.max(0, Math.min(100, pts)));
}
