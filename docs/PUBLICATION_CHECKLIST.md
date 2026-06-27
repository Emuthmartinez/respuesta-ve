# Public Repository Checklist

Use this before flipping the GitHub repository visibility to public.

## Must pass

- [ ] `git status --short` contains only intentional public-readiness changes.
- [ ] `git ls-files supabase/.temp` prints nothing.
- [ ] No `.env*`, `.dev.vars`, `.wrangler`, `.next`, `.open-next`, or local
      assistant settings are tracked.
- [ ] No service-role key, ingest token, worker run token, personal operator
      account, or private contact detail appears in tracked files.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test:logic`, and `pnpm build` pass on
      the branch being published.
- [ ] The README, CONTRIBUTING, SECURITY, issue templates, and license render
      correctly on GitHub.

## Production gates before inviting non-technical users

- [ ] Set `REPORT_IP_SALT`, `PUBLIC_INTAKE_RPC_SECRET`, `INGEST_TOKEN`, and
      `RUN_TOKEN` with Wrangler secrets, not tracked config.
- [ ] Configure Supabase Auth redirect allowlist for every production domain.
- [ ] Replace raw OSM tiles with a production map-tile provider.
- [ ] Confirm no sample/test rows are public:
      `delete from public.buildings where is_sample_data;`
- [ ] Smoke-test the live domains after deploy.

## Suggested first public issues

- [ ] Add a small partner API client example for `/api/v1/match`.
- [ ] Improve bilingual copy on the volunteer registration flow.
- [ ] Add accessibility pass notes for the map/list toggle on mobile.
- [ ] Add a source adapter proposal for another public missing-person registry.
- [ ] Document how partner registries should use status sync without auto-closing
      records.
