import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_app/trips/join")({
  head: () => ({ meta: [{ title: "Join trip — Yplit" }] }),
  component: JoinTrip,
});

function JoinTrip() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<{ id: string; name: string; destination: string | null; member_count: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup() {
    setLoading(true);
    const { data, error } = await supabase.rpc("find_trip_by_code", { _code: code.trim() });
    setLoading(false);
    if (error) return toast.error(error.message);
    const row = data?.[0];
    if (!row) return toast.error("No trip with that code");
    setPreview({ id: row.id, name: row.name, destination: row.destination, member_count: Number(row.member_count) });
  }

  async function join() {
    if (!preview) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("trip_members").insert({ trip_id: preview.id, user_id: u.user.id });
    if (error && !error.message.includes("duplicate")) return toast.error(error.message);
    toast.success(`Joined ${preview.name}`);
    navigate({ to: "/trips/$tripId", params: { tripId: preview.id } });
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-3xl font-bold">Join a trip</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter the 11-character invite code your friend shared.</p>
      <div className="mt-6 space-y-3">
        <div><Label>Invite code</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="YPLIT-J8KQ2" className="font-mono" />
        </div>
        <Button onClick={lookup} disabled={loading || !code} className="w-full">Find trip</Button>
      </div>
      {preview && (
        <div className="mt-6 rounded-xl border border-border bg-card p-4">
          <div className="font-display text-lg font-semibold">{preview.name}</div>
          <div className="text-xs text-muted-foreground">{preview.destination ?? "—"} · {preview.member_count} member(s)</div>
          <Button onClick={join} className="mt-4 w-full">Confirm join</Button>
        </div>
      )}
    </div>
  );
}
