import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, Users, Camera, Gamepad2, Sparkles, ArrowLeft, MapPin, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/trips/$tripId")({
  component: TripLayout,
});

function TripLayout() {
  const { tripId } = useParams({ from: "/_authenticated/_app/trips/$tripId" });
  const { data: trip } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: async () => {
      const { data } = await supabase.from("trips").select("*").eq("id", tripId).maybeSingle();
      return data;
    },
  });

  const tabs = [
    { to: "/trips/$tripId" as const, label: "Overview", icon: Receipt, exact: true },
    { to: "/trips/$tripId/expenses" as const, label: "Expenses", icon: Receipt },
    { to: "/trips/$tripId/balances" as const, label: "Balances", icon: Users },
    { to: "/trips/$tripId/memories" as const, label: "Memories", icon: Camera },
    { to: "/trips/$tripId/games" as const, label: "Games", icon: Gamepad2 },
    { to: "/trips/$tripId/wrapped" as const, label: "Wrapped", icon: Sparkles },
  ];

  return (
    <div>
      <Link to="/trips" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> All trips
      </Link>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative h-40 bg-secondary">
          {trip?.cover_url
            ? <img src={trip.cover_url} className="size-full object-cover" alt="" />
            : <div className="wrapped-gradient size-full opacity-70" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
            <div>
              <h1 className="font-display text-2xl font-bold text-white">{trip?.name ?? "Trip"}</h1>
              {trip?.destination && <p className="flex items-center gap-1 text-xs text-white/80"><MapPin className="size-3" />{trip.destination}</p>}
              {trip?.start_date && <p className="flex items-center gap-1 text-xs text-white/80"><Calendar className="size-3" />{trip.start_date} → {trip.end_date}</p>}
            </div>
            <span className="rounded-md bg-black/40 px-2 py-1 font-mono text-[11px] text-white">{trip?.invite_code}</span>
          </div>
        </div>
        <nav className="flex overflow-x-auto border-t border-border">
          {tabs.map((t) => (
            <Link
              key={t.label}
              to={t.to}
              params={{ tripId }}
              activeOptions={{ exact: t.exact ?? false }}
              className={cn("inline-flex items-center gap-1 border-b-2 border-transparent px-4 py-3 text-sm text-muted-foreground transition hover:text-foreground")}
              activeProps={{ className: "inline-flex items-center gap-1 border-b-2 border-primary px-4 py-3 text-sm text-primary" }}
            >
              <t.icon className="size-4" />{t.label}
            </Link>
          ))}
        </nav>

      </div>
      <div className="mt-6"><Outlet /></div>
    </div>
  );
}
