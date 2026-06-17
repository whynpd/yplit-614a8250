import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MapPin, Receipt, Sparkles, Camera } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/trips" });
  },
  head: () => ({
    meta: [
      { title: "Yplit — Split the bill. Share the story." },
      { name: "description", content: "Trip-first expense splitting with memories and games for friend groups." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="font-display text-2xl font-bold tracking-tight">
          <span className="text-primary">Y</span>plit
        </div>
        <Link to="/auth"><Button variant="secondary">Sign in</Button></Link>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-24 pt-12 sm:pt-20">
        <h1 className="font-display text-5xl font-bold leading-tight sm:text-7xl">
          Split the bill.<br />
          <span className="text-primary">Share the story.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Yplit is the travel-first expense splitter for friend groups — pair every rupee with the
          memories, games, and people behind it.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/auth"><Button size="lg">Get started</Button></Link>
          <a href="#features"><Button size="lg" variant="secondary">See features</Button></a>
        </div>

        <section id="features" className="mt-24 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className={`filmstrip ${f.cls} p-6`}>
              <f.icon className="size-6 text-primary" />
              <h3 className="mt-3 font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.copy}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Made for trips you'll be talking about for years.
      </footer>
    </div>
  );
}

const FEATURES = [
  { title: "Smart splitting", copy: "Equal, unequal, shares, percent — and one-tap settle up.", icon: Receipt, cls: "filmstrip-food" },
  { title: "Trip memories", copy: "Pin photos to expenses and replay the trip later.", icon: Camera, cls: "filmstrip-stay" },
  { title: "Trip games", copy: "Guess the Bill, Missions, Trip Market, Step-bet.", icon: Sparkles, cls: "filmstrip-activity" },
  { title: "Travel journal", copy: "End your trip with a beautiful Wrapped poster.", icon: MapPin, cls: "filmstrip-transport" },
];
