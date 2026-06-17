
CREATE POLICY "Auth read app buckets" ON storage.objects FOR SELECT TO authenticated USING (bucket_id IN ('avatars','trip-covers','receipts','memories','mission-proofs'));
CREATE POLICY "Auth upload app buckets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('avatars','trip-covers','receipts','memories','mission-proofs'));
CREATE POLICY "Owners update objects" ON storage.objects FOR UPDATE TO authenticated USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owners delete objects" ON storage.objects FOR DELETE TO authenticated USING (auth.uid() = owner);
