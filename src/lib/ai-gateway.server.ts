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
 * JSON helper for missions/games. Previously used the direct Google Gemini API,
 * but that key hits free-tier 429 quota errors. Route through the Lovable AI
 * Gateway instead — same Gemini family, managed quota, no user-supplied key.
 */
export async function geminiJson<T = unknown>(opts: {
  system?: string;
  user: string;
  model?: string;
  temperature?: number;
}): Promise<T> {
  return aiJson<T>({
    model: opts.model ?? "google/gemini-3.1-flash-lite",
    system: opts.system,
    user: opts.user,
    temperature: opts.temperature ?? 0.95,
  });
}

/** Score a bill guess: 0–100 pts using exponential decay on relative error. */
export function scoreGuess(actual: number, guess: number): number {
  if (!actual || actual <= 0) return 0;
  const diff = Math.abs(guess - actual) / actual;
  const pts = 100 * Math.exp(-3.2 * diff);
  return Math.round(Math.max(0, Math.min(100, pts)));
}
