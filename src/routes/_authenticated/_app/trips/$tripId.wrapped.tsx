import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_META, formatMoney, type ExpenseCategory } from "@/lib/yplit";

export const Route = createFileRoute("/_authenticated/_app/trips/$tripId/wrapped")({
  component: WrappedPage,
});

function WrappedPage() {
  const { tripId } = useParams({ from: "/_authenticated/_app/trips/$tripId/wrapped" });
  const { data } = useQuery({
    queryKey: ["wrapped", tripId],
    queryFn: async () => {
      const [trip, exps, members, memories] = await Promise.all([
        supabase.from("trips").select("*").eq("id", tripId).maybeSingle(),
        supabase.from("expenses").select("*").eq("trip_id", tripId),
        supabase.from("trip_members").select("user_id, profile:profiles(*)").eq("trip_id", tripId),
        supabase.from("memories").select("id").eq("trip_id", tripId),
      ]);
      return { trip: trip.data, expenses: exps.data ?? [], members: members.data ?? [], memoriesCount: memories.data?.length ?? 0 };
    },
  });

  const exps = data?.expenses ?? [];
  const total = exps.reduce((s, e) => s + Number(e.amount), 0);
  const byCat = new Map<ExpenseCategory, number>();
  exps.forEach((e) => byCat.set(e.category as ExpenseCategory, (byCat.get(e.category as ExpenseCategory) ?? 0) + Number(e.amount)));
  const topCat = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])[0];
  const biggest = exps.slice().sort((a, b) => Number(b.amount) - Number(a.amount))[0];

  // Top spender
  const spendBy = new Map<string, number>();
  exps.forEach((e) => spendBy.set(e.payer_id, (spendBy.get(e.payer_id) ?? 0) + Number(e.amount)));
  const topPayer = Array.from(spendBy.entries()).sort((a, b) => b[1] - a[1])[0];
  const topPayerName = (data?.members ?? []).find((m) => m.user_id === topPayer?.[0])?.profile?.display_name;

  return (
    <div className="mx-auto max-w-md">
      <div className="wrapped-gradient relative overflow-hidden rounded-3xl p-6 text-white shadow-2xl">
        <div className="text-xs uppercase tracking-widest opacity-80">Yplit · Trip Wrapped</div>
        <h1 className="mt-2 font-display text-4xl font-bold leading-tight">{data?.trip?.name ?? "Trip"}</h1>
        <div className="text-sm opacity-90">{data?.trip?.destination} · {data?.trip?.start_date} → {data?.trip?.end_date}</div>

        <div className="mt-8 space-y-5">
          <Stat label="Total spent" value={formatMoney(total, data?.trip?.base_currency ?? "INR")} />
          <Stat label="Expenses logged" value={String(exps.length)} />
          <Stat label="Top category" value={topCat ? `${CATEGORY_META[topCat[0]].emoji} ${CATEGORY_META[topCat[0]].label}` : "—"} />
          <Stat label="Biggest splurge" value={biggest ? `${biggest.description} · ${formatMoney(Number(biggest.amount), biggest.currency)}` : "—"} />
          <Stat label="MVP wallet" value={topPayerName ?? "—"} />
          <Stat label="Memories captured" value={String(data?.memoriesCount ?? 0)} />
          <Stat label="Crew" value={String((data?.members ?? []).length)} />
        </div>

        <div className="mt-8 text-right font-display text-sm font-semibold opacity-90">— Yplit</div>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">Screenshot to share with your crew.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/20 pb-2">
      <span className="text-xs uppercase tracking-wide opacity-80">{label}</span>
      <span className="font-display text-lg font-semibold">{value}</span>
    </div>
  );
}
