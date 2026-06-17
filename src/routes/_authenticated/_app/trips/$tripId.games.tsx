import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney } from "@/lib/yplit";
import { toast } from "sonner";
import { Trophy, Target, TrendingUp, Footprints } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_app/trips/$tripId/games")({
  component: GamesPage,
});

function GamesPage() {
  return (
    <Tabs defaultValue="guess">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="guess"><Trophy className="mr-1 size-4" />Guess</TabsTrigger>
        <TabsTrigger value="missions"><Target className="mr-1 size-4" />Missions</TabsTrigger>
        <TabsTrigger value="market"><TrendingUp className="mr-1 size-4" />Market</TabsTrigger>
        <TabsTrigger value="steps"><Footprints className="mr-1 size-4" />Steps</TabsTrigger>
      </TabsList>
      <TabsContent value="guess" className="mt-4"><GuessGame /></TabsContent>
      <TabsContent value="missions" className="mt-4"><MissionsGame /></TabsContent>
      <TabsContent value="market" className="mt-4"><MarketGame /></TabsContent>
      <TabsContent value="steps" className="mt-4"><StepsGame /></TabsContent>
    </Tabs>
  );
}

function useTripId() {
  return useParams({ from: "/_authenticated/_app/trips/$tripId/games" }).tripId;
}

/* ---------- GUESS THE BILL ---------- */
function GuessGame() {
  const tripId = useTripId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["guess-data", tripId],
    queryFn: async () => {
      const { data: exps } = await supabase.from("expenses").select("id, description, amount, currency, occurred_at").eq("trip_id", tripId).order("occurred_at", { ascending: false }).limit(20);
      const ids = (exps ?? []).map((e) => e.id);
      const { data: guesses } = ids.length
        ? await supabase.from("bill_guesses").select("*, profile:profiles!bill_guesses_user_profile_fkey(display_name)").in("expense_id", ids)
        : { data: [] };
      return { expenses: exps ?? [], guesses: guesses ?? [] };
    },
  });

  async function guess(expenseId: string, value: number) {
    if (!user) return;
    const { error } = await supabase.from("bill_guesses").insert({ expense_id: expenseId, user_id: user.id, guess: value });
    if (error) return toast.error(error.message);
    toast.success("Guess locked in");
    qc.invalidateQueries({ queryKey: ["guess-data", tripId] });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Guess the actual bill amount. Closest to the real total wins bragging rights.</p>
      {(data?.expenses ?? []).map((e) => {
        const eGuesses = (data?.guesses ?? []).filter((g) => g.expense_id === e.id);
        const myGuess = eGuesses.find((g) => g.user_id === user?.id);
        const closest = eGuesses.length ? eGuesses.slice().sort((a, b) => Math.abs(Number(a.guess) - Number(e.amount)) - Math.abs(Number(b.guess) - Number(e.amount)))[0] : null;
        return (
          <div key={e.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{e.description}</div>
                <div className="text-xs text-muted-foreground">{new Date(e.occurred_at).toLocaleDateString()}</div>
              </div>
              <div className="font-display text-lg font-semibold">{formatMoney(Number(e.amount), e.currency)}</div>
            </div>
            {myGuess ? (
              <div className="mt-3 text-sm">
                Your guess: <span className="font-semibold">{formatMoney(Number(myGuess.guess), e.currency)}</span>
                {closest && <span className="ml-2 text-xs text-muted-foreground">closest: {closest.profile?.display_name} ({formatMoney(Number(closest.guess), e.currency)})</span>}
              </div>
            ) : (
              <GuessInput onSubmit={(v) => guess(e.id, v)} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function GuessInput({ onSubmit }: { onSubmit: (v: number) => void }) {
  const [v, setV] = useState("");
  return (
    <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = parseFloat(v); if (n > 0) onSubmit(n); }}>
      <Input type="number" step="0.01" placeholder="Your guess" value={v} onChange={(e) => setV(e.target.value)} />
      <Button type="submit">Lock</Button>
    </form>
  );
}

/* ---------- MISSIONS ---------- */
function MissionsGame() {
  const tripId = useTripId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [points, setPoints] = useState("10");

  const { data } = useQuery({
    queryKey: ["missions", tripId],
    queryFn: async () => {
      const { data: missions } = await supabase.from("missions").select("*, author:profiles!missions_creator_profile_fkey(display_name)").eq("trip_id", tripId);
      const ids = (missions ?? []).map((m) => m.id);
      const { data: comps } = ids.length
        ? await supabase.from("mission_completions").select("*, profile:profiles!mission_completions_user_profile_fkey(display_name)").in("mission_id", ids)
        : { data: [] };
      return { missions: missions ?? [], comps: comps ?? [] };
    },
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !title) return;
    const { error } = await supabase.from("missions").insert({ trip_id: tripId, title, points: parseInt(points) || 10, created_by: user.id });
    if (error) return toast.error(error.message);
    setTitle("");
    qc.invalidateQueries({ queryKey: ["missions", tripId] });
  }

  async function complete(missionId: string) {
    if (!user) return;
    const { error } = await supabase.from("mission_completions").insert({ mission_id: missionId, user_id: user.id });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["missions", tripId] });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex gap-2">
        <Input placeholder="New mission e.g. 'Try a local breakfast'" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input type="number" className="w-20" value={points} onChange={(e) => setPoints(e.target.value)} />
        <Button type="submit">Add</Button>
      </form>
      <div className="space-y-2">
        {(data?.missions ?? []).map((m) => {
          const done = (data?.comps ?? []).filter((c) => c.mission_id === m.id);
          const youDid = done.some((d) => d.user_id === user?.id);
          return (
            <div key={m.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
              <div>
                <div className="font-medium">{m.title}</div>
                <div className="text-xs text-muted-foreground">{m.points} pts · by {m.author?.display_name}</div>
                {done.length > 0 && <div className="mt-1 text-xs text-success">✓ {done.map((d) => d.profile?.display_name).join(", ")}</div>}
              </div>
              <Button size="sm" variant={youDid ? "secondary" : "default"} disabled={youDid} onClick={() => complete(m.id)}>
                {youDid ? "Done" : "Mark done"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- MARKET ---------- */
function MarketGame() {
  const tripId = useTripId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [prediction, setPrediction] = useState("");
  const [stake, setStake] = useState("10");

  const { data } = useQuery({
    queryKey: ["bets", tripId],
    queryFn: async () => {
      const { data } = await supabase.from("market_bets").select("*, profile:profiles!market_bets_user_profile_fkey(display_name)").eq("trip_id", tripId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !prediction) return;
    const { error } = await supabase.from("market_bets").insert({ trip_id: tripId, user_id: user.id, prediction, stake: parseInt(stake) || 10 });
    if (error) return toast.error(error.message);
    setPrediction("");
    qc.invalidateQueries({ queryKey: ["bets", tripId] });
  }

  async function resolve(id: string, won: boolean) {
    const { error } = await supabase.from("market_bets").update({ resolved: true, won }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["bets", tripId] });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Bet on trip outcomes: "Rahul will lose his sunglasses", "We'll miss the train", etc.</p>
      <form onSubmit={add} className="flex gap-2">
        <Input placeholder="Prediction" value={prediction} onChange={(e) => setPrediction(e.target.value)} />
        <Input type="number" className="w-20" value={stake} onChange={(e) => setStake(e.target.value)} />
        <Button type="submit">Bet</Button>
      </form>
      <div className="space-y-2">
        {(data ?? []).map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
            <div>
              <div className="font-medium">{b.prediction}</div>
              <div className="text-xs text-muted-foreground">{b.profile?.display_name} · {b.stake} pts</div>
            </div>
            {b.resolved ? (
              <span className={b.won ? "text-success" : "text-destructive"}>{b.won ? "Won" : "Lost"}</span>
            ) : (
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => resolve(b.id, true)}>Won</Button>
                <Button size="sm" variant="ghost" onClick={() => resolve(b.id, false)}>Lost</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- STEPS ---------- */
function StepsGame() {
  const tripId = useTripId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [steps, setSteps] = useState("");
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));

  const { data } = useQuery({
    queryKey: ["steps", tripId],
    queryFn: async () => {
      const { data } = await supabase.from("step_entries").select("*, profile:profiles!step_entries_user_profile_fkey(display_name)").eq("trip_id", tripId).order("day", { ascending: false });
      return data ?? [];
    },
  });

  async function log(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const n = parseInt(steps);
    if (!n || n < 0) return toast.error("Enter steps");
    const { error } = await supabase.from("step_entries").upsert({ trip_id: tripId, user_id: user.id, day, steps: n }, { onConflict: "trip_id,user_id,day" });
    if (error) return toast.error(error.message);
    setSteps("");
    qc.invalidateQueries({ queryKey: ["steps", tripId] });
  }

  // Leaderboard total
  const totals = new Map<string, { name: string; total: number }>();
  (data ?? []).forEach((s) => {
    const cur = totals.get(s.user_id) ?? { name: s.profile?.display_name ?? "?", total: 0 };
    cur.total += s.steps;
    totals.set(s.user_id, cur);
  });
  const board = Array.from(totals.values()).sort((a, b) => b.total - a.total);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form onSubmit={log} className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="font-display text-lg font-semibold">Log steps</div>
        <div><Label>Day</Label><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></div>
        <div><Label>Steps</Label><Input type="number" value={steps} onChange={(e) => setSteps(e.target.value)} /></div>
        <Button type="submit" className="w-full">Save</Button>
      </form>
      <div>
        <div className="font-display text-lg font-semibold">Leaderboard</div>
        <ol className="mt-3 space-y-2">
          {board.length === 0 && <p className="text-sm text-muted-foreground">No steps logged yet.</p>}
          {board.map((b, i) => (
            <li key={i} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
              <span><span className="mr-2 font-mono text-muted-foreground">#{i + 1}</span>{b.name}</span>
              <span className="font-semibold">{b.total.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
