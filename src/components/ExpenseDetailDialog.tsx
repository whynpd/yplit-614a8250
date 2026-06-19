import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CATEGORY_META, formatMoney, type ExpenseCategory } from "@/lib/yplit";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Trash2, Send } from "lucide-react";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉"] as const;

type Member = { user_id: string; profile: { display_name: string | null } | null };

export function ExpenseDetailDialog({
  expenseId,
  open,
  onOpenChange,
  members,
  tripId,
}: {
  expenseId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  members: Member[];
  tripId: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["expense-detail", expenseId],
    enabled: !!expenseId && open,
    queryFn: async () => {
      const [exp, splits, reactions, comments] = await Promise.all([
        supabase.from("expenses").select("*").eq("id", expenseId!).maybeSingle(),
        supabase.from("expense_splits").select("*").eq("expense_id", expenseId!),
        supabase.from("expense_reactions").select("*").eq("expense_id", expenseId!),
        supabase.from("expense_comments")
          .select("*, profile:profiles!expense_comments_user_profile_fkey(display_name, avatar_url)")
          .eq("expense_id", expenseId!)
          .order("created_at", { ascending: true }),
      ]);
      return {
        expense: exp.data,
        splits: splits.data ?? [],
        reactions: reactions.data ?? [],
        comments: comments.data ?? [],
      };
    },
  });

  // Edit form state
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("misc");
  const [payerId, setPayerId] = useState("");
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [perPerson, setPerPerson] = useState<Record<string, string>>({});
  const [splitMethod, setSplitMethod] = useState<"equal" | "unequal">("equal");
  const [saving, setSaving] = useState(false);
  const [commentBody, setCommentBody] = useState("");

  useEffect(() => {
    if (!data?.expense) return;
    setDescription(data.expense.description);
    setAmount(String(data.expense.amount));
    setCategory(data.expense.category as ExpenseCategory);
    setPayerId(data.expense.payer_id);
    setSplitMethod((data.expense.split_method === "unequal" ? "unequal" : "equal") as "equal" | "unequal");
    const ids = new Set(data.splits.map((s) => s.user_id));
    setParticipants(ids);
    const map: Record<string, string> = {};
    for (const s of data.splits) map[s.user_id] = String(s.amount);
    setPerPerson(map);
  }, [data?.expense?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(uid: string) {
    setParticipants((prev) => {
      const n = new Set(prev);
      if (n.has(uid)) n.delete(uid); else n.add(uid);
      return n;
    });
  }

  async function save() {
    if (!data?.expense) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Invalid amount");
    const ids = Array.from(participants);
    if (ids.length === 0) return toast.error("Pick at least one participant");

    let splitRows: Array<{ expense_id: string; user_id: string; share: number; amount: number }>;
    if (splitMethod === "equal") {
      const share = Math.round((amt / ids.length) * 100) / 100;
      splitRows = ids.map((uid) => ({ expense_id: data.expense!.id, user_id: uid, share: 1, amount: share }));
    } else {
      const total = ids.reduce((sum, uid) => sum + (parseFloat(perPerson[uid] ?? "0") || 0), 0);
      if (Math.abs(total - amt) > 0.02) return toast.error(`Splits sum ${total.toFixed(2)} ≠ amount ${amt.toFixed(2)}`);
      splitRows = ids.map((uid) => ({
        expense_id: data.expense!.id, user_id: uid, share: 1,
        amount: Math.round((parseFloat(perPerson[uid] ?? "0") || 0) * 100) / 100,
      }));
    }

    setSaving(true);
    const { error: e1 } = await supabase.from("expenses").update({
      description, amount: amt, category, payer_id: payerId, split_method: splitMethod,
    }).eq("id", data.expense.id);
    if (e1) { setSaving(false); return toast.error(e1.message); }
    const { error: e2 } = await supabase.from("expense_splits").delete().eq("expense_id", data.expense.id);
    if (e2) { setSaving(false); return toast.error(e2.message); }
    const { error: e3 } = await supabase.from("expense_splits").insert(splitRows);
    setSaving(false);
    if (e3) return toast.error(e3.message);
    toast.success("Expense updated");
    qc.invalidateQueries({ queryKey: ["expense-detail", expenseId] });
    qc.invalidateQueries({ queryKey: ["expenses", tripId] });
    qc.invalidateQueries({ queryKey: ["balances", tripId] });
    qc.invalidateQueries({ queryKey: ["trip-overview", tripId] });
  }

  async function toggleReaction(emoji: string) {
    if (!user || !data?.expense) return;
    const mine = data.reactions.find((r) => r.user_id === user.id && r.emoji === emoji);
    if (mine) {
      await supabase.from("expense_reactions").delete().eq("id", mine.id);
    } else {
      await supabase.from("expense_reactions").insert({
        expense_id: data.expense.id, user_id: user.id, emoji,
      });
    }
    qc.invalidateQueries({ queryKey: ["expense-detail", expenseId] });
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !data?.expense || !commentBody.trim()) return;
    const { error } = await supabase.from("expense_comments").insert({
      expense_id: data.expense.id, user_id: user.id, body: commentBody.trim(),
    });
    if (error) return toast.error(error.message);
    setCommentBody("");
    qc.invalidateQueries({ queryKey: ["expense-detail", expenseId] });
  }

  async function deleteComment(id: string) {
    await supabase.from("expense_comments").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["expense-detail", expenseId] });
  }

  if (!expenseId) return null;
  const exp = data?.expense;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {exp ? `${CATEGORY_META[exp.category as ExpenseCategory].emoji} ${exp.description}` : "Expense"}
          </DialogTitle>
        </DialogHeader>
        {isLoading || !exp ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <Tabs defaultValue="edit">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="edit">Edit & Splits</TabsTrigger>
              <TabsTrigger value="reactions">Reactions ({data!.reactions.length})</TabsTrigger>
              <TabsTrigger value="comments">Comments ({data!.comments.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="space-y-3">
              <div><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
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
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Paid by</Label>
                  <Select value={payerId} onValueChange={setPayerId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.profile?.display_name ?? "?"}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Split method</Label>
                  <Select value={splitMethod} onValueChange={(v) => setSplitMethod(v as "equal" | "unequal")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equal">Equal</SelectItem>
                      <SelectItem value="unequal">Exact amounts (unequal)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Split between</Label>
                <div className="mt-2 space-y-1 rounded-lg border border-border p-2">
                  {members.map((m) => {
                    const checked = participants.has(m.user_id);
                    const equalShare = participants.size > 0 ? (parseFloat(amount || "0") / participants.size) : 0;
                    return (
                      <div key={m.user_id} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-secondary">
                        <label className="flex flex-1 cursor-pointer items-center gap-2">
                          <Checkbox checked={checked} onCheckedChange={() => toggle(m.user_id)} />
                          <span className="text-sm">{m.profile?.display_name ?? "?"}</span>
                        </label>
                        {checked && splitMethod === "equal" && (
                          <span className="text-xs text-muted-foreground">{formatMoney(equalShare, exp.currency)}</span>
                        )}
                        {checked && splitMethod === "unequal" && (
                          <Input className="w-24" type="number" step="0.01" value={perPerson[m.user_id] ?? ""}
                            onChange={(e) => setPerPerson((p) => ({ ...p, [m.user_id]: e.target.value }))} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : "Save changes"}</Button>
            </TabsContent>

            <TabsContent value="reactions" className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {REACTION_EMOJIS.map((emoji) => {
                  const list = data!.reactions.filter((r) => r.emoji === emoji);
                  const mine = list.some((r) => r.user_id === user?.id);
                  return (
                    <button
                      key={emoji}
                      onClick={() => toggleReaction(emoji)}
                      className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition ${
                        mine ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-secondary"
                      }`}
                    >
                      <span className="text-base">{emoji}</span>
                      <span className="text-xs tabular-nums">{list.length}</span>
                    </button>
                  );
                })}
              </div>
              <div className="space-y-1">
                {REACTION_EMOJIS.map((e) => {
                  const list = data!.reactions.filter((r) => r.emoji === e);
                  if (!list.length) return null;
                  return (
                    <div key={e} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{e}</span>
                      <span>{list.map((r) => members.find((m) => m.user_id === r.user_id)?.profile?.display_name ?? "?").join(", ")}</span>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="comments" className="space-y-3">
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {data!.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
                {data!.comments.map((c) => (
                  <div key={c.id} className="group rounded-lg border border-border bg-card p-2">
                    <div className="flex items-baseline justify-between gap-2">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <span className="text-xs font-semibold">{(c as any).profile?.display_name ?? "?"}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                    {c.user_id === user?.id && (
                      <Button size="icon" variant="ghost" className="ml-auto mt-1 size-6 opacity-0 group-hover:opacity-100" onClick={() => deleteComment(c.id)}>
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={postComment} className="flex gap-2">
                <Textarea
                  rows={1}
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Write a comment…"
                  className="min-h-[40px] flex-1"
                />
                <Button type="submit" size="icon" disabled={!commentBody.trim()}>
                  <Send className="size-4" />
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
