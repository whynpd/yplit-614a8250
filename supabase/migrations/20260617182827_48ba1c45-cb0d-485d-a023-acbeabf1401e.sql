
ALTER TABLE public.trip_members ADD CONSTRAINT trip_members_profile_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_payer_profile_fkey FOREIGN KEY (payer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.settlements ADD CONSTRAINT settlements_from_profile_fkey FOREIGN KEY (from_user) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.settlements ADD CONSTRAINT settlements_to_profile_fkey FOREIGN KEY (to_user) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.memories ADD CONSTRAINT memories_user_profile_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.bill_guesses ADD CONSTRAINT bill_guesses_user_profile_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.missions ADD CONSTRAINT missions_creator_profile_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.mission_completions ADD CONSTRAINT mission_completions_user_profile_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.market_bets ADD CONSTRAINT market_bets_user_profile_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.step_entries ADD CONSTRAINT step_entries_user_profile_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
