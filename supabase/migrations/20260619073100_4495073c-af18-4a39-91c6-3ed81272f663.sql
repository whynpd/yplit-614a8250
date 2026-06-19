
-- Expense reactions (one per user per emoji per expense)
CREATE TABLE public.expense_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expense_id, user_id, emoji)
);
GRANT SELECT, INSERT, DELETE ON public.expense_reactions TO authenticated;
GRANT ALL ON public.expense_reactions TO service_role;
ALTER TABLE public.expense_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view reactions" ON public.expense_reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_trip_member(e.trip_id, auth.uid())));
CREATE POLICY "Members add own reactions" ON public.expense_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_trip_member(e.trip_id, auth.uid())));
CREATE POLICY "Members delete own reactions" ON public.expense_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());
ALTER TABLE public.expense_reactions REPLICA IDENTITY FULL;

-- Expense comments
CREATE TABLE public.expense_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_comments
  ADD CONSTRAINT expense_comments_user_profile_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_comments TO authenticated;
GRANT ALL ON public.expense_comments TO service_role;
ALTER TABLE public.expense_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view comments" ON public.expense_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_trip_member(e.trip_id, auth.uid())));
CREATE POLICY "Members add comments" ON public.expense_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_trip_member(e.trip_id, auth.uid())));
CREATE POLICY "Members delete own comments" ON public.expense_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Trip scheduling config
ALTER TABLE public.trips
  ADD COLUMN bill_reveal_time time NOT NULL DEFAULT '21:00',
  ADD COLUMN mission_review_time time NOT NULL DEFAULT '21:00',
  ADD COLUMN mission_generate_time time NOT NULL DEFAULT '09:00',
  ADD COLUMN time_zone text NOT NULL DEFAULT 'Asia/Kolkata';

-- Mark expenses as revealed-for-guess
ALTER TABLE public.expenses
  ADD COLUMN revealed_at timestamptz;

-- Mission per-person + AI fields + review timestamp
ALTER TABLE public.missions
  ADD COLUMN assigned_to uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN ai_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN review_at timestamptz,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN due_date date;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_assigned_profile_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Bill guess scoring
ALTER TABLE public.bill_guesses
  ADD COLUMN points integer,
  ADD COLUMN scored_at timestamptz;

-- Helper: trip creator
CREATE OR REPLACE FUNCTION public.is_trip_creator(_trip_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.trips WHERE id = _trip_id AND created_by = _user_id)
$$;

-- Enable realtime publication for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_comments;
