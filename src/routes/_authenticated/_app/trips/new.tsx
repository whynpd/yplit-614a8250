import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateInviteCode } from "@/lib/yplit";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_app/trips/new")({
  head: () => ({ meta: [{ title: "New trip — Yplit" }] }),
  component: NewTrip,
});

function NewTrip() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    let cover_url: string | null = null;
    if (file) {
      const path = `${u.user.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("trip-covers").upload(path, file);
      if (!upErr) {
        const { data: signed } = await supabase.storage.from("trip-covers").createSignedUrl(path, 60 * 60 * 24 * 365);
        cover_url = signed?.signedUrl ?? null;
      }
    }
    const { data, error } = await supabase.from("trips").insert({
      name, destination: destination || null,
      start_date: start || null, end_date: end || null,
      base_currency: currency, cover_url,
      invite_code: generateInviteCode(),
      created_by: u.user.id,
    }).select("id").single();
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Trip created");
    navigate({ to: "/trips/$tripId", params: { tripId: data.id } });
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display text-3xl font-bold">New trip</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div><Label>Trip name</Label><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Goa 2026" /></div>
        <div><Label>Destination</Label><Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Goa, India" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Start</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label>End</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        <div><Label>Currency</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={4} /></div>
        <div><Label>Cover photo</Label><Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <Button type="submit" disabled={loading} className="w-full">Create trip</Button>
      </form>
    </div>
  );
}
