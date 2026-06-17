
CREATE TYPE public.app_role AS ENUM ('admin', 'member');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  upi_handle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.allowed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allowed_emails TO authenticated;
GRANT ALL ON public.allowed_emails TO service_role;
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage allowed emails" ON public.allowed_emails FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.allowed_emails (email, is_admin) VALUES ('yash@yplit.app', true);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_allowed public.allowed_emails%ROWTYPE;
  v_email TEXT := lower(NEW.email);
  v_name TEXT := COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(v_email, '@', 1));
  v_avatar TEXT := NEW.raw_user_meta_data->>'avatar_url';
BEGIN
  SELECT * INTO v_allowed FROM public.allowed_emails WHERE lower(email) = v_email;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email % is not whitelisted. Ask your admin to add you.', v_email USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.profiles (id, email, display_name, avatar_url) VALUES (NEW.id, v_email, v_name, v_avatar);
  IF v_allowed.is_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  destination TEXT,
  start_date DATE,
  end_date DATE,
  cover_url TEXT,
  invite_code TEXT NOT NULL UNIQUE,
  base_currency TEXT NOT NULL DEFAULT 'INR',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.trip_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_members TO authenticated;
GRANT ALL ON public.trip_members TO service_role;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_trip_member(_trip_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = _trip_id AND user_id = _user_id)
$$;

CREATE POLICY "Members view their trips" ON public.trips FOR SELECT TO authenticated USING (public.is_trip_member(id, auth.uid()));
CREATE POLICY "Authenticated create trips" ON public.trips FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Members update trips" ON public.trips FOR UPDATE TO authenticated USING (public.is_trip_member(id, auth.uid())) WITH CHECK (public.is_trip_member(id, auth.uid()));
CREATE POLICY "Creators delete trips" ON public.trips FOR DELETE TO authenticated USING (created_by = auth.uid());

CREATE POLICY "Members view trip members" ON public.trip_members FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "Users join trips themselves" ON public.trip_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users leave trips themselves" ON public.trip_members FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.add_creator_as_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.trip_members (trip_id, user_id, role) VALUES (NEW.id, NEW.created_by, 'owner') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trips_add_creator AFTER INSERT ON public.trips FOR EACH ROW EXECUTE FUNCTION public.add_creator_as_member();

-- Lookup trip by invite code (bypasses RLS so non-members can preview)
CREATE OR REPLACE FUNCTION public.find_trip_by_code(_code TEXT)
RETURNS TABLE (id UUID, name TEXT, destination TEXT, start_date DATE, end_date DATE, cover_url TEXT, member_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, t.destination, t.start_date, t.end_date, t.cover_url,
         (SELECT COUNT(*) FROM public.trip_members tm WHERE tm.trip_id = t.id)
  FROM public.trips t WHERE upper(t.invite_code) = upper(_code) LIMIT 1
$$;

CREATE TYPE public.expense_category AS ENUM ('food', 'transport', 'stay', 'activity', 'shopping', 'misc');
CREATE TYPE public.split_method AS ENUM ('equal', 'unequal', 'shares', 'percent');

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  payer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  category expense_category NOT NULL DEFAULT 'misc',
  split_method split_method NOT NULL DEFAULT 'equal',
  receipt_url TEXT,
  location TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view trip expenses" ON public.expenses FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "Members add trip expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "Members update trip expenses" ON public.expenses FOR UPDATE TO authenticated USING (public.is_trip_member(trip_id, auth.uid())) WITH CHECK (public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "Members delete trip expenses" ON public.expenses FOR DELETE TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));

CREATE TABLE public.expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share NUMERIC(12,4) NOT NULL DEFAULT 1,
  amount NUMERIC(12,2) NOT NULL,
  UNIQUE (expense_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_splits TO authenticated;
GRANT ALL ON public.expense_splits TO service_role;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view splits" ON public.expense_splits FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_trip_member(e.trip_id, auth.uid()))
);
CREATE POLICY "Members manage splits" ON public.expense_splits FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_trip_member(e.trip_id, auth.uid()))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_trip_member(e.trip_id, auth.uid()))
);

CREATE TABLE public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  from_user UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  note TEXT,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlements TO authenticated;
GRANT ALL ON public.settlements TO service_role;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view settlements" ON public.settlements FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "Members add settlements" ON public.settlements FOR INSERT TO authenticated WITH CHECK (public.is_trip_member(trip_id, auth.uid()) AND (from_user = auth.uid() OR to_user = auth.uid()));
CREATE POLICY "Participants delete settlements" ON public.settlements FOR DELETE TO authenticated USING (from_user = auth.uid() OR to_user = auth.uid());

CREATE TABLE public.memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  location TEXT,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memories TO authenticated;
GRANT ALL ON public.memories TO service_role;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view memories" ON public.memories FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "Members add memories" ON public.memories FOR INSERT TO authenticated WITH CHECK (public.is_trip_member(trip_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "Authors delete memories" ON public.memories FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.bill_guesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guess NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (expense_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_guesses TO authenticated;
GRANT ALL ON public.bill_guesses TO service_role;
ALTER TABLE public.bill_guesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view guesses" ON public.bill_guesses FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_trip_member(e.trip_id, auth.uid()))
);
CREATE POLICY "Members add own guess" ON public.bill_guesses FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_trip_member(e.trip_id, auth.uid()))
);

CREATE TABLE public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  points INTEGER NOT NULL DEFAULT 10,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missions TO authenticated;
GRANT ALL ON public.missions TO service_role;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view missions" ON public.missions FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "Members add missions" ON public.missions FOR INSERT TO authenticated WITH CHECK (public.is_trip_member(trip_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Members delete own missions" ON public.missions FOR DELETE TO authenticated USING (created_by = auth.uid());

CREATE TABLE public.mission_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proof_url TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mission_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_completions TO authenticated;
GRANT ALL ON public.mission_completions TO service_role;
ALTER TABLE public.mission_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view completions" ON public.mission_completions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_id AND public.is_trip_member(m.trip_id, auth.uid()))
);
CREATE POLICY "Members add own completion" ON public.mission_completions FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_id AND public.is_trip_member(m.trip_id, auth.uid()))
);

CREATE TABLE public.market_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prediction TEXT NOT NULL,
  stake INTEGER NOT NULL DEFAULT 10,
  resolved BOOLEAN NOT NULL DEFAULT false,
  won BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_bets TO authenticated;
GRANT ALL ON public.market_bets TO service_role;
ALTER TABLE public.market_bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view bets" ON public.market_bets FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "Members add own bets" ON public.market_bets FOR INSERT TO authenticated WITH CHECK (public.is_trip_member(trip_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "Members update own bets" ON public.market_bets FOR UPDATE TO authenticated USING (public.is_trip_member(trip_id, auth.uid())) WITH CHECK (public.is_trip_member(trip_id, auth.uid()));

CREATE TABLE public.step_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  steps INTEGER NOT NULL CHECK (steps >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.step_entries TO authenticated;
GRANT ALL ON public.step_entries TO service_role;
ALTER TABLE public.step_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view steps" ON public.step_entries FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "Members log own steps" ON public.step_entries FOR INSERT TO authenticated WITH CHECK (public.is_trip_member(trip_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "Members update own steps" ON public.step_entries FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_trips_updated BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
