# Magica Trial frontend

Next.js App Router, React and strict TypeScript client for the Magica agent-chat
work trial. The separate backend owns contracts, persistence, tools, skills,
credits and durable execution. This client uses generated Zod schemas, centralized
typed services, TanStack Query and Zustand.

## Local setup

Use pnpm. Configure the same Clerk application as the backend and set
`NEXT_PUBLIC_API_BASE_URL=http://localhost:3001` in `.env.local`. Keep secrets out
of Git. Start the backend and Trigger.dev worker, then run:

```bash
pnpm install
pnpm dev --port 3000
```

Open `/chats`. The [workspace guide](docs/guides/chat-workspace.md) covers database
setup, recovery, account isolation, migration order and remaining limits. The UI
uses locally bundled reference fonts; see `public/brand/README.md` for provenance.

## Validation

Run `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build`. UI fixtures exercise
failure behavior; they do not replace real provider and durable-worker checks.

## Browser connection

Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001` in `.env.local` for local development.
In Vercel Production, use `https://trial-magica-backend.vercel.app` and rebuild/redeploy.
Use an origin without a trailing slash. Start the backend on port 3001 and this app on port 3000.
Visit `/connection` to verify browser-to-backend CORS, loading, success, and retry states.
The page checks HTTP availability and, while signed in, backend authentication. It does not test the database.

`src/generated/health.ts` is exported from the backend's authoritative Zod contract.
Regenerate it using the backend's `scripts/export-contracts.mjs`; do not edit it manually.
API requests live in `src/services`, with a timeout, cancellation, and runtime response validation.
Run `pnpm test`, `pnpm typecheck`, and `pnpm lint` before publishing.

## Authentication verification

Sign in, then open `/connection`. The account check obtains a Clerk session token on each request and calls the protected backend `/api/app/v1/me`.
The verified identity must match the signed-in frontend user. Session changes dispose of the account query cache and cancel in-flight requests.
Clerk tokens stay in request headers, never query keys, local storage, or application logs.
The backend and frontend must use the same Clerk application and instance. Configure keys separately in each Vercel project; never commit secrets.
The public health check remains available while signed out.


## Chat workspace

Open `/chats` to create a chat, browse your saved conversations, and load message
history. The home page opens this workspace. Chat creation and history use the
backend's shared contracts and authenticated endpoints. The composer now sends
real OpenRouter Free turns through the backend and Trigger.dev, with live updates,
saved replies, stop/retry controls, and reload recovery. Keep the local backend
and Trigger.dev worker running.

See the [chat workspace guide](docs/guides/chat-workspace.md) for local setup,
account isolation, retry behavior, rollout, and verification. Maintained guides
are listed in [docs/README.md](docs/README.md).

## Credits and media approvals

The chat workspace displays available and reserved M credits with paginated credit history. New media cards show settings and estimates with Approve and run / Decline controls. Decisions use authenticated backend endpoints and input fingerprints; pending approvals survive reloads, and expired or cancelled work removes stale controls. The backend owns balances, estimates, policy and settlement.

Skill loader results use the same saved tool cards as media tasks. Expand a Load skill or Read skill asset card to inspect its inputs and escaped text result. The backend owns skill discovery, versioning and access; adding a skill requires no frontend branch.


## First messages and plan mode

Start a text conversation directly from the home composer, with explicit,
idempotent retries after lost responses. Assistant replies render safe Markdown.
Enable Plan mode to review ordered steps before the run continues. Approval cards
survive reload and support decline, expiry and stop; later media credit reviews
still apply. See the workspace guide for verification and current limitations.


## Rich replies

Ordered reasoning, source citations, thinking duration and model usage survive
streaming and reloads. Generated audio uses native playback controls. Deploy this
reader before the matching backend and worker; retain it during execution rollback.
See the workspace guide for live verification and compatibility limits.

## Long conversations

Message history is virtualized with measured row heights, stable older-page
scrolling, and a Latest message control. Live replies and focused controls remain
mounted while browsing history. The composer stays pinned on desktop and mobile.
See the workspace guide for the 1,000-message verification and release limits.

## Deployment and remaining work

Deploy to the existing `trial-magica-frontend` Vercel project after the backend
database migrations and production Trigger tasks are ready. Production uses
`NEXT_PUBLIC_API_BASE_URL=https://trial-magica-backend.vercel.app`, the matching
Clerk keys, `/sign-in` and `/sign-up` auth routes, and `/chats` fallback redirects.
Keep the backend's exact `FRONTEND_ORIGIN` aligned with this application's public URL.
Public environment variables are embedded at build time, so changing them requires
a rebuild. Backend media, database, worker, object-storage, and webhook credentials
must never be added to this repository's environment.

Branch previews require their own backend/environment configuration; they are not
automatically allowed to call the production API. Before submission, repeat the
signed-in chat, reload recovery, upload, approval, media, and webhook acceptance
against the hosted app and record the demo. The concurrent-turn load target and
complete browser/device regression suite remain unverified.
