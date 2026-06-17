import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CATEGORY_META, formatMoney, type ExpenseCategory } from "@/lib/yplit";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/_app/trips/$tripId/expenses")({
  component: ExpensesPage,
});

function ExpensesPage() {
  const { tripId } = useParams({ from: "/_authenticated/_app/trips/$tripId/expenses" });
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["expenses", tripId],
    queryFn: async () => {
      const [exps, members] = await Promise.all([
        supabase.from("expenses").select("*, splits:expense_splits(*), payer:profiles!expenses_payer_profile_fkey(*)").eq("trip_id", tripId).order("occurred_at", { ascending: false }),
        supabase.from("trip_members").select("user_id, profile:profiles!trip_members_profile_fkey(*)").eq("trip_id", tripId),
      ]);
      return { expenses: exps.data ?? [], members: members.data ?? [] };
    },
  });

  async function del(id: string) {
    if (!confirm("Delete this expense?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["expenses", tripId] });
    qc.invalidateQueries({ queryKey: ["trip-overview", tripId] });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Expenses</h2>
        <AddExpenseDialog tripId={tripId} members={data?.members ?? []} onAdded={() => {
          qc.invalidateQueries({ queryKey: ["expenses", tripId] });
          qc.invalidateQueries({ queryKey: ["trip-overview", tripId] });
          qc.invalidateQueries({ queryKey: ["balances", tripId] });
        }} />
      </div>

      <div className="mt-4 space-y-2">
        {(data?.expenses ?? []).length === 0 && <p className="text-sm text-muted-foreground">No expenses yet — tap "Add expense".</p>}
        {(data?.expenses ?? []).map((e) => {
          const meta = CATEGORY_META[e.category as ExpenseCategory];
          return (
            <div key={e.id} className={cn("filmstrip flex items-center justify-between gap-3 p-4", meta.cls)}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="text-2xl">{meta.emoji}</div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{e.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.payer?.display_name ?? "?"} paid · {meta.label} · {new Date(e.occurred_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-semibold">{formatMoney(Number(e.amount), e.currency)}</div>
                  <div className="text-[10px] text-muted-foreground">{e.split_method}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => del(e.id)}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddExpenseDialog({ tripId, members, onAdded }: { tripId: string; members: Array<{ user_id: string; profile: { display_name: string } | null }>; onAdded: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("food");
  const [payerId, setPayerId] = useState<string>(user?.id ?? "");
  const [participants, setParticipants] = useState<Set<string>>(new Set(members.map((m) => m.user_id)));
  const [loading, setLoading] = useState(false);

  function toggle(id: string) {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    const ids = Array.from(participants);
    if (ids.length === 0) return toast.error("Pick at least one participant");
    const share = Math.round((amt / ids.length) * 100) / 100;
    setLoading(true);
    const { data: exp, error } = await supabase.from("expenses").insert({
      trip_id: tripId,
      payer_id: payerId || user.id,
      description, amount: amt, category, split_method: "equal",
    }).select("id").single();
    if (error) { setLoading(false); return toast.error(error.message); }
    const rows = ids.map((uid) => ({ expense_id: exp.id, user_id: uid, share: 1, amount: share }));
    const { error: spErr } = await supabase.from("expense_splits").insert(rows);
    setLoading(false);
    if (spErr) return toast.error(spErr.message);
    toast.success("Expense added");
    setOpen(false);
    setDescription(""); setAmount("");
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && user) setPayerId(user.id); }}>
      <DialogTrigger asChild><Button><Plus className="mr-1 size-4" />Add expense</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add expense</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>What</Label><Input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Beach shack dinner" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount</Label><Input required type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_META) as ExpenseCategory[]).map((k) => (
                    <SelectItem key={k} value={k}>{CATEGORY_META[k].emoji} {CATEGORY_META[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Paid by</Label>
            <Select value={payerId} onValueChange={setPayerId}>
              <SelectTrigger><SelectValue placeholder="Select payer" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.profile?.display_name ?? "?"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Split equally between</Label>
            <div className="mt-2 space-y-1">
              {members.map((m) => (
                <label key={m.user_id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-secondary">
                  <Checkbox checked={participants.has(m.user_id)} onCheckedChange={() => toggle(m.user_id)} />
                  <span>{m.profile?.display_name ?? "?"}</span>
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>Add</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
