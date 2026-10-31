# Chat workspace

The home route opens `/chats`. Signed-in users can create a named or default chat,
page through their history, and open `/chats/:chatId`. Opening or reloading a chat
fetches saved details, newest messages, and active-run state from the backend.
The pinned multiline composer sends real OpenRouter Free turns through Trigger.dev,
with typed realtime snapshots, PostgreSQL readback, stop, and explicit retries.

## Run locally

1. Start Docker Desktop.
2. In Magica Backend, run `docker compose up -d --wait`, `pnpm db:deploy`, and
   `pnpm db:generate`, then `pnpm dev --port 3001`.
3. Set the backend's `FRONTEND_ORIGIN` to `http://localhost:3000`.
4. Set this frontend's `NEXT_PUBLIC_API_BASE_URL` to `http://localhost:3001`.
5. Configure both repositories for the same Clerk application and instance.
6. In the backend, configure the agent environment and keep `pnpm trigger:dev` running.
7. Run `pnpm dev --port 3000` here and open `http://localhost:3000/chats`.

A deployed backend needs hosted PostgreSQL. Deploy the additive chat migration and
backend routes before deploying this frontend. Vercel cannot use laptop Docker.
Frontend API origins are compiled at build time, so rebuild after changing them.

## Contracts and account isolation

`src/generated/chats.ts` and `src/generated/runs.ts` are exported from the backend's authoritative Zod schemas.
From the backend repository, regenerate using:

```bash
node scripts/export-contracts.mjs "../Magica Frontend/src/generated"
```

The frontend uses the existing `/api/app/v1/chats` creation/list routes and owned
chat detail/message routes. Validation, title limits, defaults, and DTOs come from
the generated contract. Pagination follows backend-provided cursors.

The API client obtains a fresh Clerk bearer token for each request, omits cookies,
validates responses, and supports cancellation and a network timeout. It displays
safe error messages without server details. Tokens and chat data are never stored
in localStorage or logged.

A QueryClient is owned by the current user and session. Account changes replace
and clear the old cache; protected page content immediately disappears on sign-out.
In-flight creation is aborted on unmount, and late responses cannot navigate the
next user's session. POST requests are not queued offline or automatically retried.
A manual retry reuses the same request ID and immutable body to prevent duplicate
creation when the first response is lost. Cancelling an ambiguous request does
not undo a server-side creation; reload history to check whether it was saved.

The layout always renders its page children. The page-level auth guard controls
which content is visible. The Next.js development instant-navigation validator
currently reports a nonblocking warning; production builds succeed. The
Tailwind loader targets `globals.css` only; CSS modules and generated font modules
must retain native processing so their exported class names work.

## Verification

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
UI tests cover signed-out behavior, creation, ambiguous retries, pagination,
reloading messages, safe errors, account switches, and late responses after
sign-out. They mock Clerk and HTTP; backend ownership enforcement is separately
tested against real PostgreSQL in the backend's integration suite.

Manual local verification on 2026-10-28 used a real signed-in Clerk session:
created the `Browser verification` chat, opened it from history, and reloaded its
stable URL successfully. The chat remains in the local trial database. Desktop
and 390px layouts were checked for history. Later verification in `Live chat verification`
covered real generation, reload during a run, persisted output, cancellation,
retry, and a real free-model timeout. Unit/UI fixtures also cover malformed stream
frames, ambiguous-send idempotency, and unmount cancellation.

For release, repeat creation, reload, sign-out, and another account's access check
against the deployed frontend and hosted database. Reverting this frontend does
not alter saved chats; the backend migration is additive.

## Current limits

The workspace renders typed tool cards, on-demand skill activity, attachments,
credit balances, plan approvals, virtualized message history, and persisted
image/video outputs. Pixel-level reference acceptance remains upcoming work.
The backend uses the documented compatibility text transport locally after an
S2 stream connection timeout; REST readback remains the durable recovery path.
Free-router responses can vary in quality and availability; no paid fallback is enabled.


## Media results

Backend-generated contracts define ordered text/tool anchors, invocation details and image/video/audio assets. Tool labels and validated results come from the backend registry. Owned history reads hydrate the cards; a realtime frame carries ordered content, while bounded REST polling refreshes tool state and survives reconnects. Polling continues for submitted media after a reply stops because accepted work may still finish.

Cards expose pending/running/completed/failed/cancelled/unresolved states, input/output details, elapsed time and M-credit usage. Native dialogs provide preview focus management and Escape dismissal. Closing a preview unmounts its media so audio/video playback stops. The generic reply retry button is limited to text-only turns; a media follow-up can reuse the saved results without silently rerunning a whole paid turn.

Keep MAGICA_API_KEY in the backend/worker only. The frontend has no provider key or direct media execution calls. Live acceptance requires the trial key; fixture previews and unit tests do not prove real generation success.

## Search, favorites, and Trash

The sidebar submits title/message searches through the typed service module. All chats, Favorites, and Trash have separate query keys and backend-scoped cursors. Favorite writes set a boolean explicitly. Delete requires confirmation and moves an inactive chat to Trash; Restore recovers it. Busy chats display the backend's explanation. Files remain available in the media library. Account changes abort pending mutations and ignore late navigation callbacks.

Deploy the backend chat-management migration/routes first, export the authoritative contracts, then deploy this frontend. Existing chat lists and creation remain compatible. The search uses full words and quoted phrases, not arbitrary substring matching. The UI does not reorder paginated All chats when a favorite changes.


## Reference UI pass

The chat shell uses the supplied live Magica reference (observed October 30,
2026): a 256px navigation column, rounded light sidebar, local Circular fonts,
900px conversation/composer width, plain assistant messages, and gray user
bubbles. The trial keeps its actual OpenRouter Free label and working controls.
Unimplemented product navigation is not presented as a working feature.

Navigation collapses on desktop and opens as a native modal drawer below 700px.
Escape dismisses the mobile drawer and returns focus to its opener. Navigation
and conversation history scroll independently; the composer and account menu
remain accessible. Text and media growth follow the latest reply only while the
reader stays near the bottom. Generated media opens in a side preview with
native dialog focus handling; the media picker retains its separate dialog.

This is a visual foundation, not full pixel-fidelity acceptance. Remaining work includes
comparison of active streaming/approval states with the reference. Public
deployment remains separate from local checks.


## Home composer, Markdown, and plan mode

The home composer creates a chat and sends its first text message through typed
service modules. It stores the draft and immutable creation/send request IDs in
sessionStorage scoped to the signed-in user and session. A lost response or reload
does not resend automatically; Retry reuses the same bodies and IDs. Account
teardown aborts pending requests and ignores late responses. Attachments can be
added after opening the conversation.

Assistant text renders GitHub-flavored Markdown, including lists, code and tables.
Raw HTML stays inert; links accept only absolute HTTP(S) URLs without credentials.
Markdown images are shown as text; generated media uses validated asset contracts.
Partial streaming Markdown is replaced by the final saved content.

Both composers offer Plan mode. The backend records one immutable plan per turn
and waits for an authenticated decision before enabling work. Plan cards render
ordered steps using the same approval component as media. Approval, decline,
expiry, stop and reload use durable backend state. Approval does not bypass later
media settings or credit review. An ambiguous decision can only retry the same
choice until the saved state is reconciled.

The backend owns plan copy, schemas and limits. Deploy its two plan migrations,
regenerate Prisma and export all contracts before deploying this frontend. See
the backend plan-mode guide for historical-reader compatibility and rollback.

Verification on October 30, 2026: 63 frontend tests, 113 backend unit tests and
94 PostgreSQL integration tests passed, alongside both repositories' type checks,
lint checks and production builds. A signed-in browser created a first-message
chat, received a real free-model reply and rendered its Markdown heading/list.
Approval tests cover ownership, immutable decisions, duplicate submissions,
expiry, cancellation and recovery. Live plan results are recorded in the backend
plan-mode guide.


## Long-conversation rendering

`MessageTimeline` uses TanStack Virtual with persistent message IDs, measured row
heights, six overscan rows, and end anchoring. Older cursor pages prepend without
moving the visible message. New output follows only when the reader is already
within 80px of the end; an explicit local send or Latest message action returns
to the end. The composer stays outside the scroll viewport. Images, expanded tool
details, approvals, Markdown growth and viewport changes trigger measurements.

The live assistant row stays mounted while offscreen so its realtime subscription
does not restart or discard the latest text frame. A row holding keyboard or
dialog focus also stays mounted. These exceptions add at most two rows. The
Latest message button returns focus to the history viewport before disappearing.
Rows retain ordered-list semantics and position metadata. Page Up/Down and the
older-page control support keyboard browsing.

TanStack owns scroll positioning; CSS browser anchoring is disabled to avoid
double corrections. The timeline opts out of React Compiler memoization because
the virtualizer exposes a mutable instance. Saved message bodies are memoized,
and typing in the composer does not rebuild the merged/sorted history array.
See the [official chat pattern](https://tanstack.com/virtual/latest/docs/framework/react/examples/chat).

Virtualization bounds mounted DOM, not the number of pages explicitly loaded in
the query cache. Reads remain cursor-paginated and no background scan loads the
entire chat. Browser Find sees mounted rows; sidebar search remains a backend
search of saved titles and messages. Mobile device testing beyond the browser's
390px viewport and full screen-reader acceptance remain release checks.

On October 30, 2026, all 70 frontend tests passed, including real-virtualizer
tests with controlled geometry for 1,000 messages: bounded rows, prepend offsets,
offscreen streaming, variable-height resize, focus retention, explicit follow,
and pagination failure/retry. Type checking, lint and production build passed.

Live browser evidence used local chat `e2ad7c76-dfb1-499b-81b0-55d0e90f40c3`,
which contains 1,000 clearly labeled synthetic history records plus a real test
turn. No provider call generated the fixture. With 40 messages loaded, 12 rows
were mounted while reading history; a prepend retained the same message at an
11px viewport offset. During the real run, the offscreen approval remained
mounted while polling preserved the reading position. At 390×844, there was no
horizontal overflow, the composer stayed visible, and approving the plan produced
“Virtualized live reply verified.” The reply followed to within 1px of the bottom.
Trigger run `run_06gorlsf91n87i9hjb2kce3ia2` completed successfully. The normal
desktop viewport was restored afterward. This record describes local acceptance; hosted acceptance must be recorded separately.


## Rich replies and audio results

The backend-generated `content.ts` contract adds ordered measured thinking,
provider reasoning/summary, source citations and zero-credit model usage. Details
are expandable; provider text uses the existing safe Markdown renderer. A stopped
worker cannot leave a terminal message's thinking timer running. Realtime snapshots
replace earlier snapshots and reconcile with the saved ordered message. Old
plain-text frames and text/tool/attachment records remain supported. Generated
audio uses native controls in both the result card and artifact preview.

Deploy this frontend before the matching rich-message backend and worker. Reload
already-open tabs before acceptance. Once new blocks exist, rollback must retain
these generated schemas/readers; an old strict reader would reject rich history.
No frontend schema migration or additional paid provider is introduced.

On October 31, 2026, the real local free-model turn in chat
`bb9c005a-ad4e-4f09-b760-e676a46197f6` rendered reasoning, an actual model,
token counts, 0M credits and a 2.7-second thinking duration. Reload retained the
same reply and blocks. The 79-test UI suite passed; audio uses a fixture, not a
claim of an additional live generation integration. Hosted acceptance is pending.
