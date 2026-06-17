import type { Database } from "@/integrations/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Trip = Database["public"]["Tables"]["trips"]["Row"];
export type TripMember = Database["public"]["Tables"]["trip_members"]["Row"];
export type Expense = Database["public"]["Tables"]["expenses"]["Row"];
export type ExpenseSplit = Database["public"]["Tables"]["expense_splits"]["Row"];
export type Settlement = Database["public"]["Tables"]["settlements"]["Row"];
export type Memory = Database["public"]["Tables"]["memories"]["Row"];
export type Mission = Database["public"]["Tables"]["missions"]["Row"];
export type MissionCompletion = Database["public"]["Tables"]["mission_completions"]["Row"];
export type MarketBet = Database["public"]["Tables"]["market_bets"]["Row"];
export type StepEntry = Database["public"]["Tables"]["step_entries"]["Row"];
export type BillGuess = Database["public"]["Tables"]["bill_guesses"]["Row"];
export type ExpenseCategory = Database["public"]["Enums"]["expense_category"];

export const CATEGORY_META: Record<ExpenseCategory, { label: string; emoji: string; cls: string }> = {
  food:      { label: "Food",      emoji: "🍜", cls: "filmstrip-food" },
  transport: { label: "Transport", emoji: "🚆", cls: "filmstrip-transport" },
  stay:      { label: "Stay",      emoji: "🏨", cls: "filmstrip-stay" },
  activity:  { label: "Activity",  emoji: "🎟️", cls: "filmstrip-activity" },
  shopping:  { label: "Shopping",  emoji: "🛍️", cls: "filmstrip-shopping" },
  misc:      { label: "Misc",      emoji: "✨", cls: "filmstrip-misc" },
};

export function formatMoney(amount: number, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function generateInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "YPLIT-";
  for (let i = 0; i < 5; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

// Simplify debts: greedy match largest creditor with largest debtor.
export type Balance = { userId: string; net: number };
export type Transfer = { from: string; to: string; amount: number };

export function simplifyDebts(balances: Balance[]): Transfer[] {
  const debtors = balances.filter((b) => b.net < -0.01).map((b) => ({ ...b, net: -b.net })).sort((a, b) => b.net - a.net);
  const creditors = balances.filter((b) => b.net > 0.01).map((b) => ({ ...b })).sort((a, b) => b.net - a.net);
  const transfers: Transfer[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const amt = Math.min(d.net, c.net);
    transfers.push({ from: d.userId, to: c.userId, amount: Math.round(amt * 100) / 100 });
    d.net -= amt; c.net -= amt;
    if (d.net < 0.01) i++;
    if (c.net < 0.01) j++;
  }
  return transfers;
}

export function computeBalances(
  expenses: { payer_id: string; amount: number }[],
  splits: { expense_id: string; user_id: string; amount: number }[],
  settlements: { from_user: string; to_user: string; amount: number }[],
  memberIds: string[],
): Balance[] {
  const net = new Map<string, number>();
  memberIds.forEach((id) => net.set(id, 0));
  const expenseById = new Map(expenses.map((e, idx) => [idx, e] as const));
  // sum what each member paid - what they owe
  for (const e of expenses) {
    net.set(e.payer_id, (net.get(e.payer_id) ?? 0) + Number(e.amount));
  }
  for (const s of splits) {
    net.set(s.user_id, (net.get(s.user_id) ?? 0) - Number(s.amount));
  }
  for (const st of settlements) {
    // from paid to: from increases (debt reduced), to decreases (received money back)
    net.set(st.from_user, (net.get(st.from_user) ?? 0) + Number(st.amount));
    net.set(st.to_user, (net.get(st.to_user) ?? 0) - Number(st.amount));
  }
  void expenseById;
  return Array.from(net.entries()).map(([userId, n]) => ({ userId, net: Math.round(n * 100) / 100 }));
}
