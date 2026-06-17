import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { initials } from "@/lib/yplit";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_app/profile")({
  head: () => ({ meta: [{ title: "Profile — Yplit" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile } = useAuth();
  const [name, setName] = useState("");
  const [upi, setUpi] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.display_name ?? "");
      setUpi(profile.upi_handle ?? "");
      setAvatarUrl(profile.avatar_url ?? null);
    }
  }, [profile]);

  async function uploadAvatar(file: File) {
    if (!user) return;
    const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file);
    if (error) return toast.error(error.message);
    const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    setAvatarUrl(signed?.signedUrl ?? null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("profiles").update({
      display_name: name, upi_handle: upi || null, avatar_url: avatarUrl,
    }).eq("id", user.id);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-3xl font-bold">Profile</h1>
      <form onSubmit={save} className="mt-6 space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16"><AvatarImage src={avatarUrl ?? undefined} /><AvatarFallback>{initials(name)}</AvatarFallback></Avatar>
          <Input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
        </div>
        <div><Label>Display name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>UPI handle (for settling up)</Label><Input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="yash@upi" /></div>
        <Button type="submit" disabled={loading} className="w-full">Save</Button>
      </form>
    </div>
  );
}
