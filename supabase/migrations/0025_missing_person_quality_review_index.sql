-- 0025 — Cover the quality reviewer foreign key introduced in 0024.

create index if not exists mpp_quality_reviewed_by_idx
  on public.missing_person_pins (quality_reviewed_by)
  where quality_reviewed_by is not null;
