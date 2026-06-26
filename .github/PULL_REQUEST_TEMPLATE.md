## What changed

-

## Safety / privacy

- [ ] No precise coordinates, contact info, cedulas, raw missing-person photos, credentials, or local metadata were added to tracked files.
- [ ] Public reads still go through `*_public` views or redacted API responses.
- [ ] Anonymous life-safety reporting remains ungated.
- [ ] Moderation, responder access, RLS, and partner API behavior are unchanged, or the change is explained.

## Validation

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:logic`
- [ ] `pnpm build`
- [ ] DB/RLS tests and Supabase advisors, if this changes migrations/RPCs.
