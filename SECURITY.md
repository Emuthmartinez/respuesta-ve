# Security Policy

## Reporting a vulnerability

Please do not open a public issue for vulnerabilities, credentials, precise
locations, private contact data, cedula values, or raw missing-person photos.

Use GitHub private vulnerability reporting if it is enabled on the repository.
If not, email `api@respuestave.org` with `[SECURITY]` in the subject and a short
description of the impact. Do not include exploit steps that expose real people
or private data unless requested in a private channel.

## What we treat as sensitive

- Precise coordinates for reports, requests, and missing-person records.
- Reporter contact info, volunteer/responder private contact info, and cedulas.
- Management tokens returned after citizen submissions.
- Partner API keys, ingest tokens, Cloudflare secrets, and Supabase local link
  metadata.
- Any path that weakens moderation, RLS, or the `*_public` view boundary.

## Expected response

We prioritize issues that can expose vulnerable people, publish private
locations, bypass moderation, or mutate missing-person records incorrectly.
Confirmed vulnerabilities will be patched before public disclosure whenever
possible.
