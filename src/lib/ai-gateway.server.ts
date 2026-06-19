// Lightweight Lovable AI Gateway helper (OpenAI-compatible).
// Server-only: never import from browser code.

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function aiChat(opts: {
  model?: string;
  messages: ChatMessage[];
  json?: boolean;
  temperature?: number;
}): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const model = opts.model ?? "google/gemini-3-flash-preview";
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.8,
  };
  if (opts.json) body.response_format = { type: "json_object" };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
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
  // Strip ``` fences if model wrapped output
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned) as T;
}

/**
 * Smart points allocation for the "Guess the Bill" game.
 * 0–100 scale based on relative error vs the actual amount.
 *   - <=1%  diff → 100
 *   - <=5%  diff → 90–99
 *   - <=10% diff → 75–89
 *   - <=25% diff → 40–74
 *   - <=50% diff → 10–39
 *   - >50%  diff → 0–9
 */
export function scoreGuess(actual: number, guess: number): number {
  if (actual <= 0) return 0;
  const diff = Math.abs(guess - actual) / actual;
  if (diff <= 0.01) return 100;
  if (diff >= 1) return 0;
  // Smooth exponential decay
  const raw = 100 * Math.exp(-3.2 * diff);
  return Math.max(0, Math.min(100, Math.round(raw)));
}
