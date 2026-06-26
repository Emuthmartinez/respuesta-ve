-- =====================================================================
-- 0007 — Storage RLS policies. Buckets were created in 0001 (private).
-- responder-docs: each responder manages files only under their own uid/
-- building-photos: anyone may upload; only verified responders may read.
-- =====================================================================

-- responder-docs ------------------------------------------------------
create policy "responder docs insert own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'responder-docs'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "responder docs read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'responder-docs'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- building-photos -----------------------------------------------------
create policy "building photos insert anyone"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'building-photos');

create policy "building photos read verified"
  on storage.objects for select to authenticated
  using (bucket_id = 'building-photos'
         and public.is_verified_responder(auth.uid()));
