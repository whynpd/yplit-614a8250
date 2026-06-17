import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { Camera } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_app/trips/$tripId/memories")({
  component: MemoriesPage,
});

function MemoriesPage() {
  const { tripId } = useParams({ from: "/_authenticated/_app/trips/$tripId/memories" });
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data } = useQuery({
    queryKey: ["memories", tripId],
    queryFn: async () => {
      const { data } = await supabase.from("memories").select("*, author:profiles!memories_user_profile_fkey(*)").eq("trip_id", tripId).order("taken_at", { ascending: false });
      return data ?? [];
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !file) return;
    const path = `${tripId}/${user.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("memories").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    const { data: signed } = await supabase.storage.from("memories").createSignedUrl(path, 60 * 60 * 24 * 365);
    const { error } = await supabase.from("memories").insert({
      trip_id: tripId, user_id: user.id, photo_url: signed?.signedUrl ?? "", caption: caption || null, location: location || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Memory added");
    setOpen(false); setCaption(""); setLocation(""); setFile(null);
    qc.invalidateQueries({ queryKey: ["memories", tripId] });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Memories</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Camera className="mr-1 size-4" />Add memory</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Capture a moment</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div><Label>Photo</Label><Input required type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
              <div><Label>Caption</Label><Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Sunset at Anjuna" /></div>
              <div><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Anjuna Beach" /></div>
              <Button type="submit" className="w-full">Save memory</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {(data ?? []).length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No memories yet. The first photo always becomes the story.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {data!.map((m) => (
            <figure key={m.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <img src={m.photo_url} alt={m.caption ?? ""} className="aspect-square w-full object-cover" loading="lazy" />
              <figcaption className="p-3">
                <div className="line-clamp-2 text-sm">{m.caption ?? "—"}</div>
                <div className="mt-1 text-xs text-muted-foreground">{m.author?.display_name} · {m.location ?? new Date(m.taken_at).toLocaleDateString()}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
