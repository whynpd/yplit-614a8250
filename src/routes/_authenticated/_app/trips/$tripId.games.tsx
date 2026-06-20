import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney } from "@/lib/yplit";
import { toast } from "sonner";
import { Trophy, Target, TrendingUp, Footprints, Settings, Sparkles, Eye, Lock, Camera, Upload } from "lucide-react";
import { getGuessExpenses, revealExpense } from "@/lib/games.functions";
import { generateMissionsForToday, updateTripSchedule } from "@/lib/missions.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/_app/trips/$tripId/games")({
  component: GamesPage,
});

type TripCfg = {
  created_by: string;
  bill_reveal_time: string;
  mission_review_time: string;
  mission_generate_time: string;
  time_zone: string | null;
  leaderboard_refresh_time: string;
  photo_target_count: number;
  photo_window_start: string;
  photo_window_end: string;
  photo_reveal_time: string;
};

function useTripId() {
  return useParams({ from: "/_authenticated/_app/trips/$tripId/games" }).tripId;
}

function GamesPage() {
  const tripId = useTripId();
  const { user } = useAuth();
  const { data: trip } = useQuery({
    queryKey: ["trip-cfg", tripId],
    queryFn: async () => {
      const { data } = await supabase.from("trips").select(
        "created_by, bill_reveal_time, mission_review_time, mission_generate_time, time_zone, leaderboard_refresh_time, photo_target_count, photo_window_start, photo_window_end, photo_reveal_time"
      ).eq("id", tripId).maybeSingle();
      return data as TripCfg | null;
    },
  });
  const isCreator = trip?.created_by === user?.id;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Games</h2>
        {isCreator && trip && <ScheduleSettings tripId={tripId} trip={trip} />}
      </div>
      <Tabs defaultValue="leaderboard">
        <TabsList className="grid w-full grid-cols-6 text-[11px]">
          <TabsTrigger value="leaderboard"><Trophy className="size-3" /></TabsTrigger>
          <TabsTrigger value="guess">Guess</TabsTrigger>
          <TabsTrigger value="missions"><Target className="size-3" /></TabsTrigger>
          <TabsTrigger value="photos"><Camera className="size-3" /></TabsTrigger>
          <TabsTrigger value="market"><TrendingUp className="size-3" /></TabsTrigger>
          <TabsTrigger value="steps"><Footprints className="size-3" /></TabsTrigger>
        </TabsList>
        <TabsContent value="leaderboard" className="mt-4"><Leaderboards trip={trip} /></TabsContent>
        <TabsContent value="guess" className="mt-4"><GuessGame /></TabsContent>
        <TabsContent value="missions" className="mt-4"><MissionsGame isCreator={isCreator} /></TabsContent>
        <TabsContent value="photos" className="mt-4"><PhotoChallenge trip={trip} isCreator={isCreator} /></TabsContent>
        <TabsContent value="market" className="mt-4"><MarketGame /></TabsContent>
        <TabsContent value="steps" className="mt-4"><StepsGame /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- SCHEDULE SETTINGS (creator only) ---------- */
function ScheduleSettings({ tripId, trip }: { tripId: string; trip: TripCfg }) {
  const [open, setOpen] = useState(false);
  const [billReveal, setBillReveal] = useState(trip.bill_reveal_time);
  const [missionReview, setMissionReview] = useState(trip.mission_review_time);
  const [missionGen, setMissionGen] = useState(trip.mission_generate_time);
  const [leaderRefresh, setLeaderRefresh] = useState(trip.leaderboard_refresh_time);
  const [photoCount, setPhotoCount] = useState(String(trip.photo_target_count));
  const [photoStart, setPhotoStart] = useState(trip.photo_window_start);
  const [photoEnd, setPhotoEnd] = useState(trip.photo_window_end);
  const [photoReveal, setPhotoReveal] = useState(trip.photo_reveal_time);
  const [saving, setSaving] = useState(false);
  const updateFn = useServerFn(updateTripSchedule);
  const qc = useQueryClient();

  async function save() {
    setSaving(true);
    try {
      await updateFn({ data: {
        tripId,
        bill_reveal_time: billReveal,
        mission_review_time: missionReview,
        mission_generate_time: missionGen,
        leaderboard_refresh_time: leaderRefresh,
        photo_target_count: Math.max(0, parseInt(photoCount) || 0),
        photo_window_start: photoStart,
        photo_window_end: photoEnd,
        photo_reveal_time: photoReveal,
      }});
      toast.success("Schedule updated");
      qc.invalidateQueries({ queryKey: ["trip-cfg", tripId] });
      setOpen(false);
    } catch (e) { toast.error((e as Error).message); }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Settings className="mr-1 size-3" />Schedule</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Trip settings (creator only)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Bill reveal time</Label><Input type="time" value={billReveal.slice(0,5)} onChange={(e) => setBillReveal(e.target.value)} /></div>
          <div><Label>Mission generate time</Label><Input type="time" value={missionGen.slice(0,5)} onChange={(e) => setMissionGen(e.target.value)} /></div>
          <div><Label>Mission review time</Label><Input type="time" value={missionReview.slice(0,5)} onChange={(e) => setMissionReview(e.target.value)} /></div>
          <div><Label>Leaderboard refresh time</Label><Input type="time" value={leaderRefresh.slice(0,5)} onChange={(e) => setLeaderRefresh(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Daily leaderboard counts points earned since this time.</p></div>
          <hr className="border-border" />
          <div className="text-sm font-semibold">Photo challenge</div>
          <div><Label>Photos required per pair</Label><Input type="number" min="0" value={photoCount} onChange={(e) => setPhotoCount(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">How many photos each member must take of every other member, per day. 0 disables.</p></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Window start</Label><Input type="time" value={photoStart.slice(0,5)} onChange={(e) => setPhotoStart(e.target.value)} /></div>
            <div><Label>Window end</Label><Input type="time" value={photoEnd.slice(0,5)} onChange={(e) => setPhotoEnd(e.target.value)} /></div>
          </div>
          <div><Label>Photo reveal time</Label><Input type="time" value={photoReveal.slice(0,5)} onChange={(e) => setPhotoReveal(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">When everyone sees the day's collected photos.</p></div>
          <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- LEADERBOARDS ---------- */
function Leaderboards({ trip }: { trip: TripCfg | null | undefined }) {
  const tripId = useTripId();
  const { data: members } = useQuery({
    queryKey: ["trip-members-names", tripId],
    queryFn: async () => {
      const { data } = await supabase.from("trip_members").select("user_id, profile:profiles!trip_members_profile_fkey(display_name)").eq("trip_id", tripId);
      return data ?? [];
    },
  });
  const nameOf = (id: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((members ?? []).find((m) => m.user_id === id)?.profile as any)?.display_name ?? "?";

  // Compute "since" timestamp from leaderboard_refresh_time (today @ that time, or yesterday if not yet)
  const sinceISO = (() => {
    if (!trip?.leaderboard_refresh_time) return null;
    const [h, m] = trip.leaderboard_refresh_time.split(":").map(Number);
    const t = new Date(); t.setHours(h ?? 0, m ?? 0, 0, 0);
    if (t > new Date()) t.setDate(t.getDate() - 1);
    return t.toISOString();
  })();

  const { data } = useQuery({
    queryKey: ["leaderboards", tripId, sinceISO],
    queryFn: async () => {
      const [{ data: guesses }, { data: comps }, { data: steps }] = await Promise.all([
        supabase.from("bill_guesses").select("user_id, points, scored_at, expense:expenses!inner(trip_id)").eq("expense.trip_id", tripId),
        supabase.from("mission_completions").select("user_id, completed_at, mission:missions!inner(trip_id, points)").eq("mission.trip_id", tripId),
        supabase.from("step_entries").select("user_id, steps, day").eq("trip_id", tripId),
      ]);
      return { guesses: guesses ?? [], comps: comps ?? [], steps: steps ?? [] };
    },
  });

  const totals = new Map<string, { all: number; today: number }>();
  const bump = (uid: string, pts: number, when: string | null) => {
    const cur = totals.get(uid) ?? { all: 0, today: 0 };
    cur.all += pts;
    if (sinceISO && when && when >= sinceISO) cur.today += pts;
    totals.set(uid, cur);
  };
  for (const g of data?.guesses ?? []) bump(g.user_id, Number(g.points) || 0, g.scored_at);
  for (const c of data?.comps ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bump(c.user_id, Number((c.mission as any)?.points) || 0, c.completed_at);
  }

  const board = Array.from(totals.entries()).sort((a, b) => b[1].all - a[1].all);

  const stepTotals = new Map<string, number>();
  for (const s of data?.steps ?? []) stepTotals.set(s.user_id, (stepTotals.get(s.user_id) ?? 0) + Number(s.steps));
  const stepsBoard = Array.from(stepTotals.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <Tabs defaultValue="points">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="points">Points</TabsTrigger>
        <TabsTrigger value="steps">Steps</TabsTrigger>
      </TabsList>
      <TabsContent value="points" className="mt-3">
        <p className="mb-2 text-xs text-muted-foreground">Guesses + missions. Resets daily at {trip?.leaderboard_refresh_time?.slice(0,5) ?? "00:00"}.</p>
        {(members ?? []).map((m) => {
          if (!totals.has(m.user_id)) totals.set(m.user_id, { all: 0, today: 0 });
          return null;
        })}
        <ol className="space-y-1 rounded-xl border border-border bg-card p-3">
          {Array.from(totals.entries()).sort((a, b) => b[1].all - a[1].all).map(([uid, v], i) => (
            <li key={uid} className="flex items-center justify-between text-sm">
              <span><span className="mr-2 font-mono text-muted-foreground">#{i + 1}</span>{nameOf(uid)}</span>
              <span className="tabular-nums"><strong>{v.all}</strong> <span className="text-xs text-muted-foreground">({v.today} today)</span></span>
            </li>
          ))}
          {board.length === 0 && <li className="text-sm text-muted-foreground">No points yet.</li>}
        </ol>
      </TabsContent>
      <TabsContent value="steps" className="mt-3">
        <ol className="space-y-1 rounded-xl border border-border bg-card p-3">
          {stepsBoard.map(([uid, n], i) => (
            <li key={uid} className="flex items-center justify-between text-sm">
              <span><span className="mr-2 font-mono text-muted-foreground">#{i + 1}</span>{nameOf(uid)}</span>
              <span className="font-semibold tabular-nums">{n.toLocaleString()}</span>
            </li>
          ))}
          {stepsBoard.length === 0 && <li className="text-sm text-muted-foreground">No steps logged.</li>}
        </ol>
      </TabsContent>
    </Tabs>
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

  const { data: members } = useQuery({
    queryKey: ["trip-members-names", tripId],
    queryFn: async () => {
      const { data } = await supabase.from("trip_members").select("user_id, profile:profiles!trip_members_profile_fkey(display_name)").eq("trip_id", tripId);
      return data ?? [];
    },
  });
  const nameOf = (id: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((members ?? []).find((m) => m.user_id === id)?.profile as any)?.display_name ?? "?";

  const board = (() => {
    const totals = new Map<string, number>();
    for (const e of data?.expenses ?? []) for (const g of e.guesses) {
      if (g.points == null) continue;
      totals.set(g.user_id, (totals.get(g.user_id) ?? 0) + g.points);
    }
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  })();

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
      <p className="text-sm text-muted-foreground">Guess the actual bill before reveal time. Closer = more points (0–100).</p>

      {board.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Trophy className="size-3" /> Guess leaderboard</div>
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
                  <Button size="sm" variant="outline" className="mt-1" onClick={() => reveal(e.id)}><Eye className="mr-1 size-3" />Reveal</Button>
                )}
              </div>
            </div>
            {myGuess ? (
              <div className="mt-2 text-xs text-muted-foreground">Your guess: {formatMoney(myGuess.guess, e.currency)} {myGuess.points != null && <span className="ml-2 font-semibold text-foreground">+{myGuess.points} pts</span>}</div>
            ) : !e.revealed ? (
              <GuessInput onSubmit={(v) => guess(e.id, v)} />
            ) : null}
            {e.revealed && e.guesses.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs">
                {e.guesses.slice().sort((a, b) => Math.abs(a.guess - (e.amount ?? 0)) - Math.abs(b.guess - (e.amount ?? 0))).map((g, i) => (
                  <li key={g.id} className="flex items-center justify-between">
                    <span>{i === 0 && "🏆 "}{nameOf(g.user_id)} — {formatMoney(g.guess, e.currency)}</span>
                    {g.points != null && <span className="font-semibold tabular-nums">+{g.points}</span>}
                  </li>
                ))}
              </ul>
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

  // RLS limits the result set: assignee + creator + trip-creator can see.
  const { data } = useQuery({
    queryKey: ["missions-v3", tripId],
    queryFn: async () => {
      const { data: missions } = await supabase
        .from("missions")
        .select("*, assignee:profiles!missions_assigned_profile_fkey(display_name)")
        .eq("trip_id", tripId)
        .order("due_date", { ascending: false });
      const ids = (missions ?? []).map((m) => m.id);
      const { data: comps } = ids.length
        ? await supabase.from("mission_completions").select("*").in("mission_id", ids)
        : { data: [] };
      return { missions: missions ?? [], comps: comps ?? [] };
    },
  });

  async function generate() {
    setGenerating(true);
    try {
      const res = await genFn({ data: { tripId, force: false } });
      toast.success(res.message ?? `Generated ${res.created} missions`);
      qc.invalidateQueries({ queryKey: ["missions-v3", tripId] });
    } catch (e) { toast.error((e as Error).message); }
    setGenerating(false);
  }

  async function complete(missionId: string) {
    if (!user) return;
    const { error } = await supabase.from("mission_completions").insert({ mission_id: missionId, user_id: user.id });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["missions-v3", tripId] });
  }

  const today = new Date().toISOString().slice(0, 10);
  const yours = (data?.missions ?? []).filter((m) => m.assigned_to === user?.id);
  // Only trip creator's UI surfaces missions for others (RLS already enforces this).
  const others = isCreator ? (data?.missions ?? []).filter((m) => m.assigned_to !== user?.id && m.due_date === today) : [];

  return (
    <div className="space-y-4">
      {isCreator && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
          <div>
            <div className="font-semibold">AI missions for today</div>
            <div className="text-xs text-muted-foreground">Generated from today's itinerary, with varied difficulty.</div>
          </div>
          <Button onClick={generate} disabled={generating} size="sm"><Sparkles className="mr-1 size-3" />{generating ? "Generating…" : "Generate"}</Button>
        </div>
      )}

      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your missions</div>
        {yours.length === 0 ? (
          <p className="text-sm text-muted-foreground">No missions assigned to you yet.</p>
        ) : (
          <div className="space-y-2">
            {yours.map((m) => {
              const done = (data?.comps ?? []).filter((c) => c.mission_id === m.id);
              const youDid = done.some((d) => d.user_id === user?.id);
              return <MissionCard key={m.id} m={m} youDid={youDid} onComplete={() => complete(m.id)} />;
            })}
          </div>
        )}
      </section>

      {isCreator && others.length > 0 && (
        <section>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">All travelers (today) — creator view</div>
          <div className="space-y-2">
            {others.map((m) => {
              const done = (data?.comps ?? []).filter((c) => c.mission_id === m.id);
              const finished = done.length > 0;
              return <MissionCard key={m.id} m={m} youDid={finished} readonly />;
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MissionCard({ m, youDid, readonly, onComplete }: { m: any; youDid: boolean; readonly?: boolean; onComplete?: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium">{m.title}</div>
            {m.ai_generated && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary">AI</span>}
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold">{m.points} pts</span>
          </div>
          {m.description && <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>}
          <div className="mt-1 text-[11px] text-muted-foreground">
            {readonly && m.assignee?.display_name && <>for <strong>{m.assignee.display_name}</strong> · </>}
            {m.due_date}
          </div>
        </div>
        {!readonly && onComplete && (
          <Button size="sm" variant={youDid ? "secondary" : "default"} disabled={youDid} onClick={onComplete}>{youDid ? "Done" : "Mark done"}</Button>
        )}
        {readonly && youDid && <span className="text-xs text-success">✓ Done</span>}
      </div>
    </div>
  );
}

/* ---------- PHOTO CHALLENGE ---------- */
function PhotoChallenge({ trip, isCreator }: { trip: TripCfg | null | undefined; isCreator: boolean }) {
  const tripId = useTripId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const fileRef = useRef<HTMLInputElement>(null);
  const [subjectId, setSubjectId] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  const { data: members } = useQuery({
    queryKey: ["trip-members-names", tripId],
    queryFn: async () => {
      const { data } = await supabase.from("trip_members").select("user_id, profile:profiles!trip_members_profile_fkey(display_name, avatar_url)").eq("trip_id", tripId);
      return data ?? [];
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nameOf = (id: string) => ((members ?? []).find((m) => m.user_id === id)?.profile as any)?.display_name ?? "?";

  const { data: photos } = useQuery({
    queryKey: ["member-photos", tripId, today],
    queryFn: async () => {
      const { data } = await supabase.from("member_photos")
        .select("*").eq("trip_id", tripId).eq("day_date", today)
        .order("created_at", { ascending: false });
      // Get signed URLs lazily client-side
      const withUrls = await Promise.all((data ?? []).map(async (p) => {
        const { data: s } = await supabase.storage.from("member-photos").createSignedUrl(p.storage_path, 60 * 60);
        return { ...p, url: s?.signedUrl ?? null };
      }));
      return withUrls;
    },
  });

  const target = trip?.photo_target_count ?? 0;
  const inWindow = (() => {
    if (!trip) return false;
    const now = new Date();
    const [sh, sm] = trip.photo_window_start.split(":").map(Number);
    const [eh, em] = trip.photo_window_end.split(":").map(Number);
    const start = new Date(); start.setHours(sh ?? 9, sm ?? 0, 0, 0);
    const end = new Date(); end.setHours(eh ?? 22, em ?? 0, 0, 0);
    return now >= start && now <= end;
  })();
  const revealTime = trip?.photo_reveal_time?.slice(0,5) ?? "22:30";

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !user || !subjectId || !trip) return;
    if (subjectId === user.id) { toast.error("Pick another member as the subject"); return; }
    setUploading(true);
    try {
      const path = `${tripId}/${today}/${user.id}-${subjectId}-${crypto.randomUUID()}-${f.name}`;
      const { error: upErr } = await supabase.storage.from("member-photos").upload(path, f);
      if (upErr) throw upErr;
      const { error } = await supabase.from("member_photos").insert({
        trip_id: tripId, day_date: today,
        photographer_id: user.id, subject_id: subjectId,
        storage_path: path,
      });
      if (error) throw error;
      toast.success("Photo uploaded");
      qc.invalidateQueries({ queryKey: ["member-photos", tripId, today] });
    } catch (e) { toast.error((e as Error).message); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function manualReveal() {
    const { error } = await supabase.from("member_photos")
      .update({ revealed_at: new Date().toISOString() })
      .eq("trip_id", tripId).eq("day_date", today).is("revealed_at", null);
    if (error) return toast.error(error.message);
    toast.success("Today's photos revealed");
    qc.invalidateQueries({ queryKey: ["member-photos", tripId, today] });
  }

  if (!trip) return null;
  if (target === 0) {
    return <p className="text-sm text-muted-foreground">Photo challenge is off. {isCreator && "Enable it in Schedule settings (set photos per pair > 0)."}</p>;
  }

  // Per-subject progress for current photographer
  const mineBySubject = new Map<string, number>();
  for (const p of photos ?? []) if (p.photographer_id === user?.id) {
    mineBySubject.set(p.subject_id, (mineBySubject.get(p.subject_id) ?? 0) + 1);
  }
  const otherMembers = (members ?? []).filter((m) => m.user_id !== user?.id);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="text-sm">
          <strong>{target}</strong> photo{target === 1 ? "" : "s"} of every other member, today.
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Window {trip.photo_window_start.slice(0,5)}–{trip.photo_window_end.slice(0,5)} · reveals at {revealTime}
        </div>
      </div>

      {/* Upload */}
      {inWindow ? (
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <Label>Take a photo of…</Label>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={subjectId} onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">Choose a member</option>
            {otherMembers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {nameOf(m.user_id)} — {mineBySubject.get(m.user_id) ?? 0}/{target}
              </option>
            ))}
          </select>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={upload} className="hidden" id="photo-file" />
          <Button asChild className="w-full" disabled={!subjectId || uploading}>
            <label htmlFor="photo-file" className="cursor-pointer">
              <Upload className="mr-1 size-4" />{uploading ? "Uploading…" : "Upload photo"}
            </label>
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Photo window closed for today.</p>
      )}

      {isCreator && (
        <Button size="sm" variant="outline" onClick={manualReveal}><Eye className="mr-1 size-3" />Reveal all now</Button>
      )}

      {/* Your progress */}
      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your progress today</div>
        <ul className="space-y-1 rounded-xl border border-border bg-card p-3 text-sm">
          {otherMembers.map((m) => {
            const n = mineBySubject.get(m.user_id) ?? 0;
            const done = n >= target;
            return (
              <li key={m.user_id} className="flex items-center justify-between">
                <span>{nameOf(m.user_id)}</span>
                <span className={done ? "text-success font-semibold" : "tabular-nums"}>{n}/{target}{done && " ✓"}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Revealed gallery (photos.url is null when RLS hides them) */}
      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today's photos</div>
        <div className="grid grid-cols-3 gap-2">
          {(photos ?? []).map((p) => {
            const visible = !!p.revealed_at || p.photographer_id === user?.id || p.subject_id === user?.id || isCreator;
            return (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-secondary">
                {visible && p.url ? (
                  <img src={p.url} className="size-full object-cover" alt={`of ${nameOf(p.subject_id)}`} />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground"><Lock className="size-5" /></div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-0.5 text-[9px] text-white">
                  of {nameOf(p.subject_id)}
                </div>
              </div>
            );
          })}
          {(photos ?? []).length === 0 && <p className="col-span-3 text-sm text-muted-foreground">No photos yet today.</p>}
        </div>
      </section>
    </div>
  );
}

/* ---------- MARKET (points removed) ---------- */
function MarketGame() {
  const tripId = useTripId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [prediction, setPrediction] = useState("");

  const { data } = useQuery({
    queryKey: ["bets", tripId],
    queryFn: async () => {
      const { data } = await supabase.from("market_bets")
        .select("*, profile:profiles!market_bets_user_profile_fkey(display_name)")
        .eq("trip_id", tripId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !prediction) return;
    // stake column still exists; we just don't surface points anymore.
    const { error } = await supabase.from("market_bets").insert({ trip_id: tripId, user_id: user.id, prediction, stake: 0 });
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
      <p className="text-sm text-muted-foreground">Make playful predictions. Just for bragging rights — no points.</p>
      <form onSubmit={add} className="flex gap-2">
        <Input placeholder="Rahul will lose his sunglasses" value={prediction} onChange={(e) => setPrediction(e.target.value)} />
        <Button type="submit">Predict</Button>
      </form>
      <div className="space-y-2">
        {(data ?? []).map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
            <div>
              <div className="font-medium">{b.prediction}</div>
              <div className="text-xs text-muted-foreground">{b.profile?.display_name}</div>
            </div>
            {b.resolved ? (
              <span className={b.won ? "text-success" : "text-destructive"}>{b.won ? "✓ Right" : "✗ Wrong"}</span>
            ) : (
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => resolve(b.id, true)}>Right</Button>
                <Button size="sm" variant="ghost" onClick={() => resolve(b.id, false)}>Wrong</Button>
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
    const { error } = await supabase.from("step_entries").upsert(
      { trip_id: tripId, user_id: user.id, day, steps: n },
      { onConflict: "trip_id,user_id,day" },
    );
    if (error) return toast.error(error.message);
    setSteps("");
    qc.invalidateQueries({ queryKey: ["steps", tripId] });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={log} className="flex gap-2">
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-40" />
        <Input type="number" placeholder="Steps" value={steps} onChange={(e) => setSteps(e.target.value)} />
        <Button type="submit">Log</Button>
      </form>
      <div className="space-y-1">
        {(data ?? []).map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm">
            <span>{s.profile?.display_name} · {s.day}</span>
            <span className="font-semibold tabular-nums">{s.steps.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
