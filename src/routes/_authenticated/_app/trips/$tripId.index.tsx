import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CATEGORY_META, formatMoney, initials } from "@/lib/yplit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/trips/$tripId/")({
  component: Overview,
});

function Overview() {
  const { tripId } = useParams({ from: "/_authenticated/_app/trips/$tripId/" });
  const { data } = useQuery({
    queryKey: ["trip-overview", tripId],
    queryFn: async () => {
      const [members, expenses, trip] = await Promise.all([
        supabase.from("trip_members").select("user_id, role, profile:profiles(*)").eq("trip_id", tripId),
        supabase.from("expenses").select("*").eq("trip_id", tripId).order("occurred_at", { ascending: false }).limit(5),
        supabase.from("trips").select("base_currency").eq("id", tripId).maybeSingle(),
      ]);
      return { members: members.data ?? [], expenses: expenses.data ?? [], currency: trip.data?.base_currency ?? "INR" };
    },
  });

  const total = (data?.expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="md:col-span-2 space-y-6">
        <section>
          <h2 className="font-display text-lg font-semibold">Recent expenses</h2>
          <div className="mt-3 space-y-2">
            {(data?.expenses ?? []).length === 0
              ? <p className="text-sm text-muted-foreground">No expenses yet. Head to the Expenses tab to add one.</p>
              : data!.expenses.map((e) => {
                const meta = CATEGORY_META[e.category];
                return (
                  <div key={e.id} className={cn("filmstrip flex items-center justify-between p-4", meta.cls)}>
                    <div className="flex items-center gap-3">
                      <div className="text-xl">{meta.emoji}</div>
                      <div>
                        <div className="font-medium">{e.description}</div>
                        <div className="text-xs text-muted-foreground">{meta.label} · {new Date(e.occurred_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="font-semibold">{formatMoney(Number(e.amount), e.currency)}</div>
                  </div>
                );
              })}
          </div>
        </section>
      </div>
      <aside className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Last 5 expenses</div>
          <div className="mt-1 font-display text-2xl font-semibold">{formatMoney(total, data?.currency)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Members</div>
          <ul className="mt-3 space-y-2">
            {(data?.members ?? []).map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 text-sm">
                <Avatar className="size-7">
                  <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                  <AvatarFallback>{initials(m.profile?.display_name)}</AvatarFallback>
                </Avatar>
                <span>{m.profile?.display_name}</span>
                {m.role === "owner" && <span className="ml-auto rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">owner</span>}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
