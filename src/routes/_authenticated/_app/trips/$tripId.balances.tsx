import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeBalances, formatMoney, initials, simplifyDebts } from "@/lib/yplit";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, HandCoins } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_app/trips/$tripId/balances")({
  component: BalancesPage,
});

function BalancesPage() {
  const { tripId } = useParams({ from: "/_authenticated/_app/trips/$tripId/balances" });
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["balances", tripId],
    queryFn: async () => {
      const [members, exps, splits, sets, trip] = await Promise.all([
        supabase.from("trip_members").select("user_id, profile:profiles!trip_members_profile_fkey(*)").eq("trip_id", tripId),
        supabase.from("expenses").select("id, payer_id, amount").eq("trip_id", tripId),
        supabase.from("expense_splits").select("expense_id, user_id, amount").in("expense_id",
          (await supabase.from("expenses").select("id").eq("trip_id", tripId)).data?.map((x) => x.id) ?? ["00000000-0000-0000-0000-000000000000"]),
        supabase.from("settlements").select("*").eq("trip_id", tripId),
        supabase.from("trips").select("base_currency").eq("id", tripId).maybeSingle(),
      ]);
      return {
        members: members.data ?? [],
        expenses: exps.data ?? [],
        splits: splits.data ?? [],
        settlements: sets.data ?? [],
        currency: trip.data?.base_currency ?? "INR",
      };
    },
  });

  const members = data?.members ?? [];
  const balances = computeBalances(
    (data?.expenses ?? []).map((e) => ({ payer_id: e.payer_id, amount: Number(e.amount) })),
    (data?.splits ?? []).map((s) => ({ expense_id: s.expense_id, user_id: s.user_id, amount: Number(s.amount) })),
    (data?.settlements ?? []).map((s) => ({ from_user: s.from_user, to_user: s.to_user, amount: Number(s.amount) })),
    members.map((m) => m.user_id),
  );
  const transfers = simplifyDebts(balances);
  const profileById = new Map(members.map((m) => [m.user_id, m.profile]));

  async function settle(t: { from: string; to: string; amount: number }) {
    if (!user) return;
    if (t.from !== user.id && t.to !== user.id) return toast.error("Only the payer or receiver can record this");
    const { error } = await supabase.from("settlements").insert({
      trip_id: tripId, from_user: t.from, to_user: t.to, amount: t.amount, currency: data?.currency ?? "INR",
    });
    if (error) return toast.error(error.message);
    toast.success("Settlement recorded");
    qc.invalidateQueries({ queryKey: ["balances", tripId] });
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section>
        <h2 className="font-display text-lg font-semibold">Balances</h2>
        <div className="mt-3 space-y-2">
          {members.map((m) => {
            const b = balances.find((x) => x.userId === m.user_id);
            const net = b?.net ?? 0;
            return (
              <div key={m.user_id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="size-9"><AvatarImage src={m.profile?.avatar_url ?? undefined} /><AvatarFallback>{initials(m.profile?.display_name)}</AvatarFallback></Avatar>
                  <span>{m.profile?.display_name}</span>
                </div>
                <span className={net > 0.01 ? "text-success font-semibold" : net < -0.01 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                  {net > 0.01 ? "+" : ""}{formatMoney(net, data?.currency)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Simplified settle-up</h2>
          <RecordPaymentDialog tripId={tripId} members={members} currency={data?.currency ?? "INR"} onSaved={() => qc.invalidateQueries({ queryKey: ["balances", tripId] })} />
        </div>
        <div className="mt-3 space-y-2">
          {transfers.length === 0
            ? <p className="text-sm text-muted-foreground">All settled. 🌴</p>
            : transfers.map((t, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-sm">
                  <span>{profileById.get(t.from)?.display_name ?? "?"}</span>
                  <ArrowRight className="size-4 text-muted-foreground" />
                  <span>{profileById.get(t.to)?.display_name ?? "?"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatMoney(t.amount, data?.currency)}</span>
                  <Button size="sm" variant="secondary" onClick={() => settle(t)}><HandCoins className="mr-1 size-3" />Settle</Button>
                </div>
              </div>
            ))}
        </div>
      </section>

      <section className="md:col-span-2">
        <SettlementAuditLog tripId={tripId} profileById={profileById} currency={data?.currency ?? "INR"} />
      </section>
    </div>
  );
}

function SettlementAuditLog({ tripId, profileById, currency }: { tripId: string; profileById: Map<string, { display_name: string } | null>; currency: string }) {
  const { data } = useQuery({
    queryKey: ["settlement-audit", tripId],
    queryFn: async () => {
      const { data } = await supabase
        .from("settlement_audit")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });
  if (!data || data.length === 0) return null;
  const nameOf = (id: string | null) => (id && profileById.get(id)?.display_name) || "?";
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">Settlement history</h2>
      <p className="mt-1 text-xs text-muted-foreground">Every settlement is logged for transparency.</p>
      <ul className="mt-3 space-y-2">
        {data.map((row) => (
          <li key={row.id} className="rounded-xl border border-border bg-card p-3 text-sm">
            <div className="flex items-center justify-between">
              <span>
                <span className={
                  row.action === "created" ? "text-success font-semibold" :
                  row.action === "deleted" ? "text-destructive font-semibold" :
                  "text-muted-foreground font-semibold"
                }>{row.action}</span>
                {" · "}
                <span>{nameOf(row.from_user)} → {nameOf(row.to_user)}</span>
                {row.amount != null && <span className="ml-2 font-semibold">{formatMoney(Number(row.amount), row.currency ?? currency)}</span>}
              </span>
              <span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">by {nameOf(row.actor_id)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecordPaymentDialog({ tripId, members, currency, onSaved }: { tripId: string; members: Array<{ user_id: string; profile: { display_name: string } | null }>; currency: string; onSaved: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(user?.id ?? "");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter an amount");
    if (!from || !to || from === to) return toast.error("Pick two different people");
    const { error } = await supabase.from("settlements").insert({ trip_id: tripId, from_user: from, to_user: to, amount: amt, currency });
    if (error) return toast.error(error.message);
    toast.success("Recorded");
    setOpen(false); setAmount("");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="secondary">Record payment</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record a payment</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>From</Label>
            <Select value={from} onValueChange={setFrom}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.profile?.display_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>To</Label>
            <Select value={to} onValueChange={setTo}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.profile?.display_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <Button type="submit" className="w-full">Record</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
