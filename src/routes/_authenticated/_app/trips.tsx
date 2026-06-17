import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Users, Calendar, MapPin } from "lucide-react";
import { formatMoney } from "@/lib/yplit";

export const Route = createFileRoute("/_authenticated/_app/trips")({
  head: () => ({ meta: [{ title: "My Trips — Yplit" }] }),
  component: TripsPage,
});

function TripsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-trips"],
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from("trip_members")
        .select("trip:trips(*)")
        .order("joined_at", { ascending: false });
      return (memberships ?? []).map((m) => m.trip).filter(Boolean) as NonNullable<typeof memberships>[number]["trip"][];
    },
  });

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">My Trips</h1>
          <p className="text-sm text-muted-foreground">Pick up where you left off, or start a new adventure.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/trips/join"><Button variant="secondary"><Users className="mr-1 size-4" />Join</Button></Link>
          <Link to="/trips/new"><Button><Plus className="mr-1 size-4" />New trip</Button></Link>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-10 text-center text-muted-foreground">Loading…</div>
      ) : !data || data.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center">
          <h2 className="font-display text-xl">Create a trip or join one with a code.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Yplit shines once a group is together — invite your crew.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Link to="/trips/new"><Button>New trip</Button></Link>
            <Link to="/trips/join"><Button variant="secondary">Join with code</Button></Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {data.map((t) => t && (
            <Link key={t.id} to="/trips/$tripId" params={{ tripId: t.id }}
              className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/40">
              <div className="relative h-32 bg-secondary">
                {t.cover_url
                  ? <img src={t.cover_url} alt="" className="size-full object-cover" />
                  : <div className="wrapped-gradient size-full opacity-70" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-white">{t.name}</h3>
                    {t.destination && <p className="flex items-center gap-1 text-xs text-white/80"><MapPin className="size-3" />{t.destination}</p>}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Calendar className="size-3" />{t.start_date ?? "—"}</span>
                <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[10px]">{t.invite_code}</span>
                <span>{formatMoney(0, t.base_currency)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
