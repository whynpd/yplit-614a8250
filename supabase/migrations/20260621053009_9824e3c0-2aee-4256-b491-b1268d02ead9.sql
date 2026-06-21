CREATE POLICY "Trip creator scores guesses"
ON public.bill_guesses
FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = bill_guesses.expense_id AND public.is_trip_creator(e.trip_id, auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = bill_guesses.expense_id AND public.is_trip_creator(e.trip_id, auth.uid())));