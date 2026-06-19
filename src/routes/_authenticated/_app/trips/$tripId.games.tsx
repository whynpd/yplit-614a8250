import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney } from "@/lib/yplit";
import { toast } from "sonner";
import { Trophy, Target, TrendingUp, Footprints, Settings, Sparkles, Eye, EyeOff, Lock } from "lucide-react";
import { getGuessExpenses, revealExpense } from "@/lib/games.functions";
import { generateMissionsForToday, updateTripSchedule } from "@/lib/missions.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/_app/trips/$tripId/games")({
  component: GamesPage,
});

function GamesPage() {
  const tripId = useParams({ from: "/_authenticated/_app/trips/$tripId/games" }).tripId;
  const { user } = useAuth();
  const { data: trip } = useQuery({
    queryKey: ["trip-creator", tripId],
    queryFn: async () => {
      const { data } = await supabase.from("trips").select("created_by, bill_reveal_time, mission_review_time, mission_generate_time, time_zone").eq("id", tripId).maybeSingle();
      return data;
    },
  });
  const isCreator = trip?.created_by === user?.id;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Games</h2>
        {isCreator && <ScheduleSettings tripId={tripId} trip={trip} />}
      </div>
      <Tabs defaultValue="guess">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="guess"><Trophy className="mr-1 size-4" />Guess</TabsTrigger>
          <TabsTrigger value="missions"><Target className="mr-1 size-4" />Missions</TabsTrigger>
          <TabsTrigger value="market"><TrendingUp className="mr-1 size-4" />Market</TabsTrigger>
          <TabsTrigger value="steps"><Footprints className="mr-1 size-4" />Steps</TabsTrigger>
        </TabsList>
        <TabsContent value="guess" className="mt-4"><GuessGame /></TabsContent>
        <TabsContent value="missions" className="mt-4"><MissionsGame isCreator={isCreator} /></TabsContent>
        <TabsContent value="market" className="mt-4"><MarketGame /></TabsContent>
        <TabsContent value="steps" className="mt-4"><StepsGame /></TabsContent>
      </Tabs>
    </div>
  );
}

function useTripId() {
  return useParams({ from: "/_authenticated/_app/trips/$tripId/games" }).tripId;
}

/* ---------- SCHEDULE SETTINGS (creator only) ---------- */
function ScheduleSettings({ tripId, trip }: { tripId: string; trip: { bill_reveal_time?: string; mission_review_time?: string; mission_generate_time?: string; time_zone?: string } | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [billRevealTime, setBillRevealTime] = useState(trip?.bill_reveal_time ?? "21:00");
  const [missionReviewTime, setMissionReviewTime] = useState(trip?.mission_review_time ?? "21:00");
  const [missionGenerateTime, setMissionGenerateTime] = useState(trip?.mission_generate_time ?? "09:00");
  const [saving, setSaving] = useState(false);
  const updateFn = useServerFn(updateTripSchedule);
  const qc = useQueryClient();

  async function save() {
    setSaving(true);
    try {
      await updateFn({ data: { tripId, bill_reveal_time: billRevealTime, mission_review_time: missionReviewTime, mission_generate_time: missionGenerateTime } });
      toast.success("Schedule updated");
      qc.invalidateQueries({ queryKey: ["trip-creator", tripId] });
      setOpen(false);
    } catch (e) { toast.error((e as Error).message); }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Settings className="mr-1 size-3" />Schedule</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Game schedule (creator only)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Bill reveal time</Label>
            <Input type="time" value={billRevealTime.slice(0, 5)} onChange={(e) => setBillRevealTime(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Each day at this time, hidden expense amounts auto-reveal and guesses are scored (0–100 pts based on closeness).</p>
          </div>
          <div>
            <Label>Mission generate time</Label>
            <Input type="time" value={missionGenerateTime.slice(0, 5)} onChange={(e) => setMissionGenerateTime(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">AI generates a unique mission per traveler each day at this time.</p>
          </div>
          <div>
            <Label>Mission review time</Label>
            <Input type="time" value={missionReviewTime.slice(0, 5)} onChange={(e) => setMissionReviewTime(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Time of day when missions are tallied for review.</p>
          </div>
          <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- GUESS THE BILL ---------- */
function GuessGame() {
  const tripId = useTripId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const getGuess = useServerFn(getGuessExpenses);
  const revealFn = useServerFn(revealExpense);

  const { data } = useQuery({
    queryKey: ["guess-data-v2", tripId],
    queryFn: () => getGuess({ data: { tripId } }),
  });

  // Map of user_id -> total points across this trip (leaderboard)
  const board = (() => {
    const totals = new Map<string, number>();
    for (const e of data?.expenses ?? []) {
      for (const g of e.guesses) {
        if (g.points == null) continue;
        totals.set(g.user_id, (totals.get(g.user_id) ?? 0) + g.points);
      }
    }
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  })();

  // Member names
  const { data: members } = useQuery({
    queryKey: ["trip-members-names", tripId],
    queryFn: async () => {
      const { data } = await supabase.from("trip_members").select("user_id, profile:profiles!trip_members_profile_fkey(display_name)").eq("trip_id", tripId);
      return data ?? [];
    },
  });
  const nameOf = (id: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (members ?? []).find((m) => m.user_id === id)?.profile && ((members ?? []).find((m) => m.user_id === id)!.profile as any).display_name || "?";

  async function guess(expenseId: string, value: number) {
    if (!user) return;
    const { error } = await supabase.from("bill_guesses").insert({ expense_id: expenseId, user_id: user.id, guess: value });
    if (error) return toast.error(error.message);
    toast.success("Guess locked in");
    qc.invalidateQueries({ queryKey: ["guess-data-v2", tripId] });
  }

  async function reveal(expenseId: string) {
    try {
      const res = await revealFn({ data: { expenseId } });
      toast.success(`Revealed — scored ${res.scored} guesses`);
      qc.invalidateQueries({ queryKey: ["guess-data-v2", tripId] });
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Guess the actual bill amount before reveal time. Closer guess = more points (0–100).</p>

      {board.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Trophy className="size-3" /> Leaderboard
          </div>
          <ol className="space-y-1">
            {board.map(([uid, pts], i) => (
              <li key={uid} className="flex items-center justify-between text-sm">
                <span><span className="mr-2 font-mono text-muted-foreground">#{i + 1}</span>{nameOf(uid)}</span>
                <span className="font-semibold tabular-nums">{pts} pts</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(data?.expenses ?? []).map((e) => {
        const myGuess = e.guesses.find((g) => g.user_id === user?.id);
        const sortedGuesses = e.revealed && e.amount != null
          ? e.guesses.slice().sort((a, b) => Math.abs(a.guess - e.amount!) - Math.abs(b.guess - e.amount!))
          : e.guesses;
        return (
          <div key={e.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{e.description}</div>
                <div className="text-xs text-muted-foreground">{new Date(e.occurred_at).toLocaleDateString()} · {e.guesses.length} guess{e.guesses.length === 1 ? "" : "es"}</div>
              </div>
              <div className="text-right">
                {e.revealed && e.amount != null ? (
                  <div className="font-display text-lg font-semibold">{formatMoney(e.amount, e.currency)}</div>
                ) : (
                  <div className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground"><Lock className="size-3" />Hidden</div>
                )}
                {!e.revealed && data?.isCreator && (
                  <Button size="sm" variant="outline" className="mt-1" onClick={() => reveal(e.id)}>
                    <Eye className="mr-1 size-3" />Reveal now
                  </Button>
                )}
                {!e.revealed && data?.isCreator && e.actual_amount != null && (
                  <div className="mt-1 text-[10px] text-muted-foreground">Actual: {formatMoney(e.actual_amount, e.currency)}</div>
                )}
              </div>
            </div>

            {myGuess ? (
              <div className="mt-3 text-sm">
                Your guess: <span className="font-semibold">{formatMoney(myGuess.guess, e.currency)}</span>
                {myGuess.points != null && <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">+{myGuess.points} pts</span>}
              </div>
            ) : !e.revealed ? (
              <GuessInput onSubmit={(v) => guess(e.id, v)} />
            ) : (
              <p className="mt-3 text-xs text-muted-foreground"><EyeOff className="mr-1 inline size-3" />Reveal passed — no guess locked.</p>
            )}

            {e.revealed && sortedGuesses.length > 0 && (
              <div className="mt-3 border-t border-border pt-2 text-xs">
                <div className="mb-1 font-semibold text-muted-foreground">Standings</div>
                <ul className="space-y-1">
                  {sortedGuesses.map((g, i) => (
                    <li key={g.id} className="flex items-center justify-between">
                      <span>{i === 0 && "🏆 "}{nameOf(g.user_id)} — {formatMoney(g.guess, e.currency)}</span>
                      {g.points != null && <span className="font-semibold tabular-nums">+{g.points}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}

      {(data?.expenses ?? []).length === 0 && <p className="text-sm text-muted-foreground">No expenses to guess on yet.</p>}
    </div>
  );
}

function GuessInput({ onSubmit }: { onSubmit: (v: number) => void }) {
  const [v, setV] = useState("");
  return (
    <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = parseFloat(v); if (n > 0) { onSubmit(n); setV(""); } }}>
      <Input type="number" step="0.01" placeholder="Your guess" value={v} onChange={(e) => setV(e.target.value)} />
      <Button type="submit">Lock</Button>
    </form>
  );
}

/* ---------- MISSIONS ---------- */
function MissionsGame({ isCreator }: { isCreator: boolean }) {
  const tripId = useTripId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const genFn = useServerFn(generateMissionsForToday);
  const today = new Date().toISOString().slice(0, 10);

  const { data } = useQuery({
    queryKey: ["missions-v2", tripId],
    queryFn: async () => {
      const { data: missions } = await supabase
        .from("missions")
        .select("*, author:profiles!missions_creator_profile_fkey(display_name), assignee:profiles!missions_assigned_profile_fkey(display_name)")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false });
      const ids = (missions ?? []).map((m) => m.id);
      const { data: comps } = ids.length
        ? await supabase.from("mission_completions").select("*, profile:profiles!mission_completions_user_profile_fkey(display_name)").in("mission_id", ids)
        : { data: [] };
      return { missions: missions ?? [], comps: comps ?? [] };
    },
  });

  async function generate() {
    setGenerating(true);
    try {
      const res = await genFn({ data: { tripId, force: false } });
      toast.success(res.message ?? `Generated ${res.created} missions`);
      qc.invalidateQueries({ queryKey: ["missions-v2", tripId] });
    } catch (e) { toast.error((e as Error).message); }
    setGenerating(false);
  }

  async function complete(missionId: string) {
    if (!user) return;
    const { error } = await supabase.from("mission_completions").insert({ mission_id: missionId, user_id: user.id });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["missions-v2", tripId] });
  }

  const myMissions = (data?.missions ?? []).filter((m) => m.assigned_to === user?.id);
  const todayMissions = (data?.missions ?? []).filter((m) => m.due_date === today);
  const otherMissions = (data?.missions ?? []).filter((m) => m.assigned_to && m.assigned_to !== user?.id && m.due_date === today);

  return (
    <div className="space-y-4">
      {isCreator && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
          <div>
            <div className="font-semibold">AI missions for today</div>
            <div className="text-xs text-muted-foreground">Generate one unique mission per traveler.</div>
          </div>
          <Button onClick={generate} disabled={generating} size="sm">
            <Sparkles className="mr-1 size-3" />{generating ? "Generating…" : "Generate"}
          </Button>
        </div>
      )}

      {myMissions.length > 0 && (
        <section>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your missions</div>
          <div className="space-y-2">
            {myMissions.map((m) => {
              const done = (data?.comps ?? []).filter((c) => c.mission_id === m.id);
              const youDid = done.some((d) => d.user_id === user?.id);
              return <MissionCard key={m.id} m={m} done={done} youDid={youDid} onComplete={() => complete(m.id)} />;
            })}
          </div>
        </section>
      )}

      {otherMissions.length > 0 && (
        <section>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Other travelers (today)</div>
          <div className="space-y-2">
            {otherMissions.map((m) => {
              const done = (data?.comps ?? []).filter((c) => c.mission_id === m.id);
              return <MissionCard key={m.id} m={m} done={done} youDid={false} readonly />;
            })}
          </div>
        </section>
      )}

      {todayMissions.length === 0 && !isCreator && (
        <p className="text-sm text-muted-foreground">No missions for today yet — they'll be generated automatically at the scheduled time.</p>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MissionCard({ m, done, youDid, readonly, onComplete }: { m: any; done: any[]; youDid: boolean; readonly?: boolean; onComplete?: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium">{m.title}</div>
            {m.ai_generated && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary">AI</span>}
          </div>
          {m.description && <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>}
          <div className="mt-1 text-[11px] text-muted-foreground">
            {m.points} pts
            {m.assignee?.display_name && <> · for <strong>{m.assignee.display_name}</strong></>}
            {m.review_at && <> · review {new Date(m.review_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>}
          </div>
          {done.length > 0 && <div className="mt-1 text-xs text-success">✓ {done.map((d) => d.profile?.display_name).join(", ")}</div>}
        </div>
        {!readonly && onComplete && (
          <Button size="sm" variant={youDid ? "secondary" : "default"} disabled={youDid} onClick={onComplete}>
            {youDid ? "Done" : "Mark done"}
          </Button>
        )}
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
