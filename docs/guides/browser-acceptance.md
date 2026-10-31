# Browser acceptance

The Playwright suite drives a real browser against the local or hosted trial app.
Clerk, the backend, PostgreSQL, OpenRouter Free and the Trigger worker remain real.
One test drops an already-accepted HTTP response to exercise idempotent recovery;
it does not mock the accepted turn or any model response.

## Setup

Use Node 24 and pnpm. Install dependencies and the Chromium browser:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

Configure the existing Clerk **development** instance's `CLERK_SECRET_KEY` and
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in the ignored `.env.local`. They must match
the application under test. Create a dedicated test user in that instance with a
`+clerk_test` email address; do not use a personal account. Set
`E2E_CLERK_USER_EMAIL` in the ignored `.env.e2e.local` to that existing user's email.
The setup uses Clerk's official testing helper to create the browser session.
Production Clerk keys are rejected. Never commit keys or authentication state.

Start the local frontend, backend and worker, then run:

```bash
pnpm test:e2e
```

The default address is `http://localhost:3000`. To explicitly test the hosted
trial using its matching development Clerk instance:

```bash
E2E_BASE_URL=https://trial-magica-frontend.vercel.app E2E_ALLOW_HOSTED=1 pnpm test:e2e
```

This creates retained test chats and uses the free model route. It does not run
billable media tools. Tests run serially without automatic retries, so a failing
provider response is visible and does not silently start extra work. Investigate
a failure before rerunning the affected test.

## Coverage

- Signed-out browsers cannot see the workspace or saved chat navigation.
- Create, search, favorite, move to Trash and restore an owned chat.
- Mobile navigation opens, closes with Escape, returns focus and keeps the composer visible.
- Losing the first send response, reloading and retrying reuses the request ID.
- A plan approval survives reload; approval completes one saved assistant reply.
- Stopping a waiting turn clears approval controls and preserves cancellation after reload.

`pnpm test` continues to run only Vitest unit/component tests; `e2e/` is excluded
from that runner. The browser suite is intentionally separate because it needs
real credentials, live services and network access.

## Evidence and limitations

The hosted checks on 2026-10-31 targeted frontend main
`0f3850efcd196c603ef67bfe8bc70d38e97a4430`, backend main
`8da07c9b83d79024aa6fedc4e40d22f28346a8f0`, and production Trigger worker
`20261031.1`. All four browser scenarios passed; the chat-management test was
rerun after correcting its hidden-sidebar locator and navigation wait.

Authentication state in `.auth/`, reports in `playwright-report/`, and screenshots
in `test-results/` are ignored. Authentication files use restricted permissions;
traces are disabled because they can contain bearer tokens. Review artifacts
before sharing them. Reports are local evidence, not committed product files.

This suite does not establish cross-account API isolation, all provider failures,
upload recovery, media-tool success, visual parity, every browser/device, or 1,000
concurrent turns. Those require their separate backend and live acceptance checks.
There is no database migration or application-runtime behavior change in this suite.

See [Clerk's Playwright helpers](https://clerk.com/docs/guides/development/testing/playwright/test-helpers)
for the authentication mechanism.
