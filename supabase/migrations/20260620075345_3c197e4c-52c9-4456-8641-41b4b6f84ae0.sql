
CREATE TABLE public.trip_itinerary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  time time NULL,
  title text NOT NULL,
  notes text NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_itinerary TO authenticated;
GRANT ALL ON public.trip_itinerary TO service_role;
ALTER TABLE public.trip_itinerary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view itinerary" ON public.trip_itinerary FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "Members add itinerary" ON public.trip_itinerary FOR INSERT TO authenticated WITH CHECK (public.is_trip_member(trip_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Members edit itinerary" ON public.trip_itinerary FOR UPDATE TO authenticated USING (public.is_trip_member(trip_id, auth.uid())) WITH CHECK (public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "Creators delete itinerary" ON public.trip_itinerary FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.is_trip_creator(trip_id, auth.uid()));
CREATE TRIGGER trg_itinerary_updated BEFORE UPDATE ON public.trip_itinerary FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_itinerary_trip_day ON public.trip_itinerary(trip_id, day_date);

CREATE TABLE public.settlement_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NULL,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('created','updated','deleted')),
  actor_id uuid NULL,
  from_user uuid NULL,
  to_user uuid NULL,
  amount numeric NULL,
  currency text NULL,
  note text NULL,
  payload jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.settlement_audit TO authenticated;
GRANT ALL ON public.settlement_audit TO service_role;
ALTER TABLE public.settlement_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view settlement audit" ON public.settlement_audit FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));
CREATE INDEX idx_settlement_audit_trip ON public.settlement_audit(trip_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_settlement_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.settlement_audit(settlement_id, trip_id, action, actor_id, from_user, to_user, amount, currency, note, payload)
    VALUES (NEW.id, NEW.trip_id, 'created', auth.uid(), NEW.from_user, NEW.to_user, NEW.amount, NEW.currency, NEW.note, to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.settlement_audit(settlement_id, trip_id, action, actor_id, from_user, to_user, amount, currency, note, payload)
    VALUES (NEW.id, NEW.trip_id, 'updated', auth.uid(), NEW.from_user, NEW.to_user, NEW.amount, NEW.currency, NEW.note,
            jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.settlement_audit(settlement_id, trip_id, action, actor_id, from_user, to_user, amount, currency, note, payload)
    VALUES (OLD.id, OLD.trip_id, 'deleted', auth.uid(), OLD.from_user, OLD.to_user, OLD.amount, OLD.currency, OLD.note, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_settlement_audit
AFTER INSERT OR UPDATE OR DELETE ON public.settlements
FOR EACH ROW EXECUTE FUNCTION public.log_settlement_change();

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS photo_target_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photo_window_start time NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS photo_window_end time NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS photo_reveal_time time NOT NULL DEFAULT '22:30',
  ADD COLUMN IF NOT EXISTS leaderboard_refresh_time time NOT NULL DEFAULT '00:00';

CREATE TABLE public.member_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  photographer_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  storage_path text NOT NULL,
  revealed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (photographer_id <> subject_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_photos TO authenticated;
GRANT ALL ON public.member_photos TO service_role;
ALTER TABLE public.member_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View member photos" ON public.member_photos FOR SELECT TO authenticated USING (
  public.is_trip_member(trip_id, auth.uid())
  AND (photographer_id = auth.uid() OR subject_id = auth.uid() OR revealed_at IS NOT NULL OR public.is_trip_creator(trip_id, auth.uid()))
);
CREATE POLICY "Photographers add photos" ON public.member_photos FOR INSERT TO authenticated WITH CHECK (
  public.is_trip_member(trip_id, auth.uid()) AND photographer_id = auth.uid()
);
CREATE POLICY "Photographers delete own" ON public.member_photos FOR DELETE TO authenticated USING (photographer_id = auth.uid());
CREATE INDEX idx_member_photos_trip_day ON public.member_photos(trip_id, day_date);

CREATE POLICY "Trip members upload member-photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'member-photos');
CREATE POLICY "Trip members read member-photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'member-photos');
CREATE POLICY "Owners delete member-photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'member-photos' AND owner = auth.uid());

DROP POLICY IF EXISTS "Members view missions" ON public.missions;
CREATE POLICY "View own or as creator" ON public.missions FOR SELECT TO authenticated USING (
  assigned_to = auth.uid()
  OR created_by = auth.uid()
  OR public.is_trip_creator(trip_id, auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_missions_trip_due ON public.missions(trip_id, due_date);
