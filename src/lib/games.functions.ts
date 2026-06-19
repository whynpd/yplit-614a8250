import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scoreGuess } from "./ai-gateway.server";

/**
 * Returns expenses for the guess game with amounts hidden until reveal.
 * If the caller is the trip creator, they always see actual amounts (UI may still hide).
 */
export const getGuessExpenses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tripId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trip } = await supabase
      .from("trips")
      .select("id, created_by, bill_reveal_time, time_zone")
      .eq("id", data.tripId)
      .maybeSingle();
    if (!trip) throw new Error("Trip not found");

    const { data: rows } = await supabase
      .from("expenses")
      .select("id, description, amount, currency, occurred_at, revealed_at, payer_id, trip_id")
      .eq("trip_id", data.tripId)
      .order("occurred_at", { ascending: false })
      .limit(50);

    const { data: guesses } = await supabase
      .from("bill_guesses")
      .select("id, expense_id, user_id, guess, points, scored_at")
      .in("expense_id", (rows ?? []).map((r) => r.id));

    const isCreator = trip.created_by === userId;
    const now = new Date();

    const expenses = (rows ?? []).map((e) => {
      const eGuesses = (guesses ?? []).filter((g) => g.expense_id === e.id);
      const revealed = Boolean(e.revealed_at);
      // Hide amount from non-creators until revealed
      const amount = revealed ? Number(e.amount) : null;
      return {
        id: e.id,
        description: e.description,
        occurred_at: e.occurred_at,
        currency: e.currency,
        payer_id: e.payer_id,
        revealed,
        revealed_at: e.revealed_at,
        amount,                                  // null = hidden
        actual_amount: isCreator ? Number(e.amount) : null, // only creator sees pre-reveal
        guesses: eGuesses.map((g) => ({
          id: g.id,
          user_id: g.user_id,
          guess: Number(g.guess),
          points: g.points,
          scored_at: g.scored_at,
        })),
      };
    });

    return {
      isCreator,
      bill_reveal_time: trip.bill_reveal_time as string,
      now: now.toISOString(),
      expenses,
    };
  });

/** Manually reveal an expense's amount and score all guesses. Creator only. */
export const revealExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { expenseId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: exp } = await supabase
      .from("expenses")
      .select("id, amount, trip_id, revealed_at, trip:trips!inner(created_by)")
      .eq("id", data.expenseId)
      .maybeSingle();
    if (!exp) throw new Error("Expense not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createdBy = (exp.trip as any)?.created_by;
    if (createdBy !== userId) throw new Error("Only the trip creator can reveal");

    const revealedAt = exp.revealed_at ?? new Date().toISOString();
    if (!exp.revealed_at) {
      await supabase.from("expenses").update({ revealed_at: revealedAt }).eq("id", exp.id);
    }
    // Score all guesses
    const { data: guesses } = await supabase
      .from("bill_guesses")
      .select("id, guess")
      .eq("expense_id", exp.id);
    const actual = Number(exp.amount);
    const scoredAt = new Date().toISOString();
    for (const g of guesses ?? []) {
      const pts = scoreGuess(actual, Number(g.guess));
      await supabase.from("bill_guesses").update({ points: pts, scored_at: scoredAt }).eq("id", g.id);
    }
    return { ok: true, revealed_at: revealedAt, scored: guesses?.length ?? 0 };
  });
