import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { geminiJson } from "./ai-gateway.server";

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

    if (!data.force) {
      const { data: existing } = await supabase
        .from("missions")
        .select("id").eq("trip_id", data.tripId).eq("ai_generated", true).eq("due_date", today).limit(1);
      if ((existing ?? []).length > 0) return { ok: true, created: 0, message: "Already generated for today" };
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

    // Pull today's itinerary so missions tie in to actual plans.
    const { data: itin } = await supabase
      .from("trip_itinerary")
      .select("time, title, notes")
      .eq("trip_id", data.tripId)
      .eq("day_date", today)
      .order("time", { ascending: true });
    const itineraryText = (itin ?? []).length
      ? (itin ?? [])
          .map((i) => `- ${i.time ? i.time.slice(0, 5) : "anytime"}: ${i.title}${i.notes ? ` (${i.notes})` : ""}`)
          .join("\n")
      : "(no itinerary planned for today — base missions on the destination)";

    const prompt = `You design playful daily challenges for travelers on a group trip.

Trip: "${trip.name}"
Destination: ${trip.destination ?? "unknown"}
Date: ${today}
Today's itinerary:
${itineraryText}

Travelers: ${memberList.map((m) => m.display_name).join(", ")}

Design ONE unique mission per traveler. Rules:
- Tie missions LOOSELY to the itinerary or destination — general & open-ended, NOT hyper-specific (e.g. "snap a candid of someone laughing during lunch" — good. "Order exactly the prawn curry at Anjuna Beach Cafe at 1:42pm" — bad).
- Missions must be achievable for an average traveler. No risky, illegal, or rude challenges.
- Vary difficulty AND vary points: mix easy (10-20 pts), medium (25-40), and ambitious (50-80). At least one of each tier across the group.
- 6-14 words for title. Short playful description (≤25 words).
- Each "display_name" MUST exactly match one traveler's name. One mission per traveler, all different.

Return STRICT JSON: { "missions": [{ "display_name": "...", "title": "...", "description": "...", "points": 25 }, ...] }`;

    const parsed = await geminiJson<{ missions: GeneratedMission[] }>({
      system: "You output valid JSON only. No prose, no markdown fences.",
      user: prompt,
      temperature: 0.95,
    });

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

/** Update trip scheduling (creator only). */
export const updateTripSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    tripId: string;
    bill_reveal_time?: string;
    mission_review_time?: string;
    mission_generate_time?: string;
    time_zone?: string;
    leaderboard_refresh_time?: string;
    photo_target_count?: number;
    photo_window_start?: string;
    photo_window_end?: string;
    photo_reveal_time?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trip } = await supabase.from("trips").select("created_by").eq("id", data.tripId).maybeSingle();
    if (!trip) throw new Error("Trip not found");
    if (trip.created_by !== userId) throw new Error("Only the trip creator can change schedule");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: any = {};
    for (const k of [
      "bill_reveal_time","mission_review_time","mission_generate_time","time_zone",
      "leaderboard_refresh_time","photo_target_count","photo_window_start","photo_window_end","photo_reveal_time",
    ] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("trips").update(patch).eq("id", data.tripId);
    if (error) throw error;
    return { ok: true };
  });
