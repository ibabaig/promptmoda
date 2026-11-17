# MoDA — Prompt Chains

The third MoDA app: a curator-only tool for building, reordering and running the prompt chains
behind the Museum of Digital Art. Same Supabase project as the museum (`modagallery`) and the
admin area (`adminmoda`).

## What it does

| Need | Where |
| --- | --- |
| Create / update / delete a prompt chain | `/` → **New chain**; `/chains/[id]` → Chain settings / Delete |
| Create / update / delete a step | `/chains/[id]` → Add a step; each step → **Edit step** / **Delete step** |
| Reorder steps | `/chains/[id]` → ↑ ↓ on each step, or **Move to** a position |
| Generate media from a chain | `/chains/[id]/generate` |
| View the media a chain produced | `/chains/[id]/media`, and `/runs/[id]` for the per-step trace |
| Light / dark / system theme | The switch in the header (stored in a cookie, so no flash on load) |

## Two kinds of chain

- **Sequential** — every step is its own model call. Step N gets step N−1's output as
  `{{previous}}` and any earlier step as `{{step_1}}`, `{{step_2}}`… If the chain takes an image,
  it is attached to step 1. The seeded `image-captions-v1` is the brief's example:
  image → description → what's funny → five captions.
- **Assembled** — every step is a *section* of one prompt, joined and sent as one call. This is
  how the museum's five daily-commission chains work, so a test run here sends the same prompt the
  museum would.

Sequential chains can never take a share of museum traffic: a database trigger refuses any mix
weight above 0 for them (migration 011).

## Access

Default-deny, four layers:

1. `proxy.ts` — `PUBLIC_PATHS` in `lib/supabase/proxy.ts` is the complete list of pages reachable
   without a verified superadmin session.
2. `requireSuperadmin()` at the top of every page **and** every server action
   (`profiles.is_superadmin`, read from the database, not the JWT).
3. RLS — the write policies on `prompt_chains` / `prompt_chain_steps` and the tool-run policies on
   `generation_requests` all require `is_superadmin()`.
4. No service-role key exists in this app.

Model-generated SVG is sanitised against an allowlist and rendered only through an `<img>`
`data:` URI.

## Setup

1. Apply `supabase/011_prompt_chain_tool.sql` (after 010). Paste it whole into the SQL Editor.
2. `cp .env.example .env.local` and fill in the Supabase URL, anon key and `GEMINI_API_KEY`.
3. In Supabase → Authentication → URL Configuration → Redirect URLs, add
   `https://promptmoda.vercel.app/**` and `https://promptmoda-*-humor-project1.vercel.app/**`
   (the second covers commit-specific deployment URLs). Google sign-in returns to `/auth/callback`.
4. `npm install && npm run dev` (port 3002).

Next.js 16: `proxy.ts` replaces `middleware.ts`, and `params` / `searchParams` are Promises. See
`AGENTS.md`.
