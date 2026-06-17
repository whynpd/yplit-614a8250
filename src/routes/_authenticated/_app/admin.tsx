import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_app/admin")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw redirect({ to: "/trips" });
  },
  head: () => ({ meta: [{ title: "Admin — Yplit" }] }),
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const { data } = useQuery({
    queryKey: ["allowed-emails"],
    queryFn: async () => {
      const { data } = await supabase.from("allowed_emails").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("allowed_emails").insert({ email: email.trim().toLowerCase(), is_admin: isAdmin });
    if (error) return toast.error(error.message);
    toast.success("Email whitelisted");
    setEmail(""); setIsAdmin(false);
    qc.invalidateQueries({ queryKey: ["allowed-emails"] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("allowed_emails").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["allowed-emails"] });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-bold">Admin · Allow list</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Only emails listed here can sign up or sign in with Google. Add a teammate before they try to join.
      </p>

      <form onSubmit={add} className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex-1 min-w-[220px]">
          <Label>Email</Label>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@gmail.com" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Checkbox checked={isAdmin} onCheckedChange={(v) => setIsAdmin(Boolean(v))} /> Make admin
        </label>
        <Button type="submit">Add to allow list</Button>
      </form>

      <div className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
        {(data ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground">No entries yet.</p>}
        {(data ?? []).map((a) => (
          <div key={a.id} className="flex items-center justify-between p-3">
            <div>
              <div className="font-medium">{a.email}</div>
              <div className="text-xs text-muted-foreground">added {new Date(a.created_at).toLocaleDateString()}</div>
            </div>
            <div className="flex items-center gap-3">
              {a.is_admin && <span className="rounded-md bg-primary/20 px-2 py-0.5 text-xs text-primary">admin</span>}
              <Button size="icon" variant="ghost" onClick={() => remove(a.id)}><Trash2 className="size-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
