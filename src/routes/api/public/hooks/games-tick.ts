import { createFileRoute } from "@tanstack/react-router";
import { scoreGuess, aiJson } from "@/lib/ai-gateway.server";

// Cron tick (every ~10 min): auto-reveal expenses past reveal time, generate daily missions.
export const Route = createFileRoute("/api/public/hooks/games-tick")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const log: string[] = [];

        // 1. Fetch all trips
        const { data: trips } = await supabaseAdmin
          .from("trips")
          .select("id, name, destination, created_by, bill_reveal_time, mission_review_time, mission_generate_time, time_zone");

        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);

        for (const trip of trips ?? []) {
          // --- AUTO REVEAL EXPENSES ---
          const [rhh, rmm] = String(trip.bill_reveal_time).split(":").map(Number);
          const todayRevealCutoff = new Date();
          todayRevealCutoff.setHours(rhh ?? 21, rmm ?? 0, 0, 0);

          if (now >= todayRevealCutoff) {
            const { data: pending } = await supabaseAdmin
              .from("expenses")
              .select("id, amount")
              .eq("trip_id", trip.id)
              .is("revealed_at", null)
              .lte("occurred_at", todayRevealCutoff.toISOString());
            for (const exp of pending ?? []) {
              await supabaseAdmin.from("expenses").update({ revealed_at: now.toISOString() }).eq("id", exp.id);
              const { data: guesses } = await supabaseAdmin
                .from("bill_guesses").select("id, guess").eq("expense_id", exp.id);
              for (const g of guesses ?? []) {
                await supabaseAdmin.from("bill_guesses").update({
                  points: scoreGuess(Number(exp.amount), Number(g.guess)),
                  scored_at: now.toISOString(),
                }).eq("id", g.id);
              }
              log.push(`reveal ${exp.id} (${guesses?.length ?? 0} guesses)`);
            }
          }

          // --- AUTO GENERATE MISSIONS at mission_generate_time today ---
          const [ghh, gmm] = String(trip.mission_generate_time).split(":").map(Number);
          const genCutoff = new Date();
          genCutoff.setHours(ghh ?? 9, gmm ?? 0, 0, 0);
          if (now >= genCutoff) {
            const { data: existing } = await supabaseAdmin
              .from("missions").select("id").eq("trip_id", trip.id).eq("ai_generated", true).eq("due_date", todayStr).limit(1);
            if ((existing ?? []).length === 0) {
              const { data: members } = await supabaseAdmin
                .from("trip_members")
                .select("user_id, profile:profiles!trip_members_profile_fkey(display_name)")
                .eq("trip_id", trip.id);
              const list = (members ?? []).map((m) => ({
                user_id: m.user_id,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                display_name: (m.profile as any)?.display_name ?? "Traveler",
              }));
              if (list.length > 0) {
                try {
                  const prompt = `Generate one UNIQUE fun mini-mission per traveler. Trip "${trip.name}", destination ${trip.destination ?? "unknown"}, date ${todayStr}. Travelers: ${list.map((l) => l.display_name).join(", ")}. Each unique, safe, single-day. Return JSON: {"missions":[{"display_name":"","title":"","description":"","points":20}]}. points 10-50.`;
                  const parsed = await aiJson<{ missions: Array<{ display_name: string; title: string; description: string; points: number }> }>({
                    system: "You output valid JSON only.",
                    user: prompt,
                  });
                  const [mhh, mmin] = String(trip.mission_review_time).split(":").map(Number);
                  const reviewAt = new Date();
                  reviewAt.setHours(mhh ?? 21, mmin ?? 0, 0, 0);
                  const inserts: Array<Record<string, unknown>> = [];
                  for (const m of parsed.missions ?? []) {
                    const mem = list.find((l) => l.display_name.toLowerCase().trim() === String(m.display_name).toLowerCase().trim());
                    if (!mem) continue;
                    inserts.push({
                      trip_id: trip.id,
                      title: String(m.title).slice(0, 140),
                      description: String(m.description ?? "").slice(0, 400),
                      points: Math.max(5, Math.min(100, Number(m.points) || 20)),
                      created_by: trip.created_by,
                      assigned_to: mem.user_id,
                      ai_generated: true,
                      due_date: todayStr,
                      review_at: reviewAt.toISOString(),
                    });
                  }
                  if (inserts.length > 0) {
                    await supabaseAdmin.from("missions").insert(inserts);
                    log.push(`missions ${trip.id} x${inserts.length}`);
                  }
                } catch (e) {
                  log.push(`mission_err ${trip.id}: ${(e as Error).message}`);
                }
              }
            }
          }
        }

        return Response.json({ ok: true, ran_at: now.toISOString(), log });
      },
    },
  },
});
