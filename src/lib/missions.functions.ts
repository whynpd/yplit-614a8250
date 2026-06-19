import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiJson } from "./ai-gateway.server";

type GeneratedMission = { display_name: string; title: string; description: string; points: number };

/** Generate one unique mission per trip member for "today". Creator only. */
export const generateMissionsForToday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tripId: string; force?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trip } = await supabase
      .from("trips")
      .select("id, name, destination, created_by, mission_review_time")
      .eq("id", data.tripId)
      .maybeSingle();
    if (!trip) throw new Error("Trip not found");
    if (trip.created_by !== userId) throw new Error("Only the trip creator can generate missions");

    const today = new Date().toISOString().slice(0, 10);

    // Skip if already generated today (unless force)
    if (!data.force) {
      const { data: existing } = await supabase
        .from("missions")
        .select("id")
        .eq("trip_id", data.tripId)
        .eq("ai_generated", true)
        .eq("due_date", today)
        .limit(1);
      if ((existing ?? []).length > 0) {
        return { ok: true, created: 0, message: "Already generated for today" };
      }
    }

    const { data: members } = await supabase
      .from("trip_members")
      .select("user_id, profile:profiles!trip_members_profile_fkey(display_name)")
      .eq("trip_id", data.tripId);
    if (!members || members.length === 0) return { ok: true, created: 0 };

    const memberList = members.map((m) => ({
      user_id: m.user_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      display_name: (m.profile as any)?.display_name ?? "Traveler",
    }));

    const prompt = `You are a witty trip activity designer. Generate one UNIQUE mini-mission for each traveler on a group trip.
Trip name: "${trip.name}"
Destination: ${trip.destination ?? "unknown"}
Date: ${today}
Travelers: ${memberList.map((m) => m.display_name).join(", ")}

Rules:
- Each mission must be DIFFERENT, fun, achievable in a single day, safe, and tailored to the destination if known.
- 6-14 words for title. Short playful description (max 20 words).
- Points: integer 10-50 based on difficulty (easy=10-20, medium=21-35, ambitious=36-50).
- Return STRICT JSON object: { "missions": [{ "display_name": "...", "title": "...", "description": "...", "points": 25 }, ...] }
- The "display_name" in each mission MUST exactly match one traveler's name. One mission per traveler, in any order.`;

    let parsed: { missions: GeneratedMission[] };
    try {
      parsed = await aiJson<{ missions: GeneratedMission[] }>({
        system: "You output valid JSON only. No prose, no markdown fences.",
        user: prompt,
        temperature: 0.95,
      });
    } catch (e) {
      throw new Error(`AI generation failed: ${(e as Error).message}`);
    }

    const reviewAt = new Date();
    const [hh, mm] = String(trip.mission_review_time).split(":").map(Number);
    reviewAt.setHours(hh ?? 21, mm ?? 0, 0, 0);

    const inserts = [];
    for (const m of parsed.missions ?? []) {
      const member = memberList.find(
        (x) => x.display_name.toLowerCase().trim() === String(m.display_name).toLowerCase().trim(),
      );
      if (!member) continue;
      inserts.push({
        trip_id: data.tripId,
        title: String(m.title).slice(0, 140),
        description: String(m.description ?? "").slice(0, 400),
        points: Math.max(5, Math.min(100, Number(m.points) || 20)),
        created_by: userId,
        assigned_to: member.user_id,
        ai_generated: true,
        due_date: today,
        review_at: reviewAt.toISOString(),
      });
    }
    if (inserts.length === 0) throw new Error("AI returned no usable missions");

    const { error } = await supabase.from("missions").insert(inserts);
    if (error) throw error;
    return { ok: true, created: inserts.length };
  });

/** Update trip scheduling/timezone (creator only). */
export const updateTripSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    tripId: string;
    bill_reveal_time?: string;
    mission_review_time?: string;
    mission_generate_time?: string;
    time_zone?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trip } = await supabase.from("trips").select("created_by").eq("id", data.tripId).maybeSingle();
    if (!trip) throw new Error("Trip not found");
    if (trip.created_by !== userId) throw new Error("Only the trip creator can change schedule");
    const patch: Record<string, string> = {};
    if (data.bill_reveal_time) patch.bill_reveal_time = data.bill_reveal_time;
    if (data.mission_review_time) patch.mission_review_time = data.mission_review_time;
    if (data.mission_generate_time) patch.mission_generate_time = data.mission_generate_time;
    if (data.time_zone) patch.time_zone = data.time_zone;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("trips").update(patch).eq("id", data.tripId);
    if (error) throw error;
    return { ok: true };
  });
