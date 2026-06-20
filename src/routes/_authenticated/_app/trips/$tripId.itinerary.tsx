import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_app/trips/$tripId/itinerary")({
  component: ItineraryPage,
});

function ItineraryPage() {
  const { tripId } = useParams({ from: "/_authenticated/_app/trips/$tripId/itinerary" });
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState(today);
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  const { data: items } = useQuery({
    queryKey: ["itinerary", tripId],
    queryFn: async () => {
      const { data } = await supabase
        .from("trip_itinerary")
        .select("*")
        .eq("trip_id", tripId)
        .order("day_date", { ascending: true })
        .order("time", { ascending: true, nullsFirst: false });
      return data ?? [];
    },
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !title.trim() || !day) return;
    const { error } = await supabase.from("trip_itinerary").insert({
      trip_id: tripId, day_date: day, time: time || null,
      title: title.trim(), notes: notes.trim() || null,
      created_by: user.id,
    });
    if (error) return toast.error(error.message);
    setTitle(""); setNotes(""); setTime("");
    qc.invalidateQueries({ queryKey: ["itinerary", tripId] });
  }

  async function del(id: string) {
    const { error } = await supabase.from("trip_itinerary").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["itinerary", tripId] });
  }

  // Group by day
  const grouped = new Map<string, typeof items>();
  for (const it of items ?? []) {
    const arr = grouped.get(it.day_date) ?? [];
    arr.push(it);
    grouped.set(it.day_date, arr);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold">Day-wise itinerary</h2>
        <p className="text-sm text-muted-foreground">Plan it together — AI uses today's plan to design daily missions.</p>
      </div>

      <form onSubmit={add} className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Day</Label><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} required /></div>
          <div><Label>Time (optional)</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>
        <div><Label>Title</Label><Input placeholder="Sunset at Anjuna Beach" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
        <div><Label>Notes (optional)</Label><Textarea rows={2} placeholder="Bring sunscreen, ride bikes there" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <Button type="submit" className="w-full"><Plus className="mr-1 size-4" />Add to itinerary</Button>
      </form>

      {[...grouped.entries()].map(([d, list]) => (
        <section key={d}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{d}</div>
          <div className="space-y-2">
            {(list ?? []).map((it) => (
              <div key={it.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {it.time && <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground"><Clock className="size-3" />{it.time.slice(0,5)}</span>}
                    <div className="font-medium">{it.title}</div>
                  </div>
                  {it.notes && <p className="mt-1 text-xs text-muted-foreground">{it.notes}</p>}
                </div>
                {it.created_by === user?.id && (
                  <Button size="icon" variant="ghost" onClick={() => del(it.id)}><Trash2 className="size-4" /></Button>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {(items ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nothing planned yet — add the first activity above.</p>}
    </div>
  );
}
