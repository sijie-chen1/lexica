# Lexica

A personal vocabulary app for iPhone Home Screen installation. React + Vite, FSRS scheduling, offline review, and an authenticated OpenAI server endpoint.

## Run locally

Requires Node.js 22.12 or later.

```sh
npm ci
cp .env.example .env
npm run build
npm start
```

Open http://127.0.0.1:4173. Without AI credentials, manual vocabulary, review, import, export and backups remain available. For development use `npm run dev`.

For laptop use, open Settings → AI connection, enter the API address, API key and model, then choose Save and test connection. This sends a small billable test request and saves successful settings to `.local-ai.json` on this laptop with owner-only file permissions. The key is never returned to the browser or included in vocabulary backups. Leave the key field blank to keep a saved key; changing API providers requires re-entering the key. This setup is enabled only when the server is bound to loopback and the request comes from the local laptop with a matching origin.

On the hosted website, open Settings → AI connection to enter your own API address, key and model, then choose **Connect and test**. This makes a small billable lookup before saving the connection in this browser’s persistent `localStorage`. Reopening the website retains it on this device until it is replaced or disconnected. Clearing website data and private browsing can remove it. Existing session connections are migrated automatically when available. **Disconnect and remove key** clears it. The key travels over HTTPS through the app server only for AI requests; it is not persisted on the server, returned in responses, shared with visitors, or included in vocabulary backups. Hosted personal connections accept OpenAI (`https://api.openai.com/v1`) and the provider base address explicitly configured by the deployment owner. Arbitrary proxy destinations are rejected. No server key or app password is required when bringing your own key.

For an optional shared hosted connection, set `OPENAI_API_KEY` and a long private `APP_PASSWORD` in the server environment, then restart. Unlock hosted AI in Settings with the app password. The laptop setup form is disabled on externally bound servers. Never put a key in `VITE_` variables or frontend code. OpenAI API billing is separate from a ChatGPT subscription. `OPENAI_MODEL` defaults to the original app's `gpt-4o-mini`; change it to a compatible Chat Completions model if desired. `OPENAI_BASE_URL` is server-only and must use HTTPS.

## Deploy with GitHub and Vercel

The intended custom domain is `tarovocab.app`. See [DEPLOY.md](DEPLOY.md) for the account setup, environment settings, domain connection and data migration checklist.

Vercel builds the frontend into `dist` and runs the four `api/*.js` routes as Node functions. `vercel.json` configures the build, checks, headers and function timeout. No always-running Node process is needed on Vercel. The hosted handlers always disable laptop configuration. They accept per-request personal keys, or require an app password when using the site owner’s shared key. The laptop's saved key is excluded from Git and deployment uploads.

## Install on iPhone

Deploy using Vercel as above. For an alternative Node host, run `npm ci && npm run build` and `npm start`, configure credentials as runtime secrets, set `HOST=0.0.0.0`, set the platform's `PORT`, and set `COOKIE_SECURE=true`. The application serves its compiled frontend and API from the same origin. A static-only host without functions cannot run the AI endpoint.

Open the HTTPS address in Safari, use Share → Add to Home Screen, and open the installed app once online. The generated service worker stores only the application shell and assets. It never caches API requests or credentials. Closing all app windows allows a downloaded service worker update to activate.

The local preview address is for this Mac; it is not an iPhone installation link. A native binary, App Store approval, or Apple Developer membership is not required for the Home Screen app. Real-device installation and a live OpenAI request still require deployment and configured credentials.

## Data and recovery

Vocabulary and reviews live in this browser/origin's IndexedDB, database `lexica-db`, key `lx-state-v6`. The app awaits successful database commit before showing a review as saved. A revision guard rejects stale writes from another tab. It never replaces saved data with an empty collection after a database read failure.

Settings → Back up exports JSON with words, example sentences, FSRS state, review history and preferences. Save it outside the browser, such as iCloud Drive. Settings → Restore backup previews word count and allows safe merging or explicit replacement; restore keeps current practice preferences. API keys and app passwords are never included. CSV export is for a readable spreadsheet and does not preserve scheduling; use JSON for recovery. In particular, “Cancel” never means “replace.”

The app can import old Lexica backups (a `words` array with `term` and `definition`). On the same origin, it also migrates `lx-words-v5` from IndexedDB or localStorage. Moving to a new host/device requires export from the old app and import into the new one. Legacy SM-2 due dates are preserved; the old interval initializes FSRS stability conservatively. No historic review events are invented. The first new rating starts an accurate FSRS review log.

There is currently **no automatic cloud backup or cross-device sync**. Browser data removal, device loss, origin changes, or storage eviction can make local words unavailable. Downloaded backups preserve progress only through their export time. Keep regular copies outside the device. Installing a Home Screen app does not guarantee permanent storage.

## Review behavior

Practice follows two stages, with progress saved in each word's `learning` object:

1. **Initial learning:** each new word has exactly three answered encounters, mixing multiple choice and flip cards. A randomized pool interleaves encounters instead of fixed rounds; avoid adjacent repeats when other words remain. Both formats occur for each word. A single remaining word may repeat consecutively. Saved partial progress resumes after reopening and uses one daily-new slot per word.
2. **First schedule:** all three initial answers determine the first FSRS rating: all correct → Good; any wrong → Again with a 10-minute revisit; otherwise Hard with a one-hour revisit. Initial encounters are recorded individually, but initialize FSRS only once, on completion. Existing reviewed words retain their schedules.
3. **Spaced review:** randomly mix MC and flip cards. Correct recalls use Good; wrong or unsure answers use Again. Three consecutive correct recalls across three dates and a review interval of at least seven days unlock a sentence test. Initial repetition is not evidence of long-term acquisition.
4. **Sentence test:** write an original sentence. A correct verdict marks the word acquired; partial or incorrect sends it back to mixed practice. The learner can correct an inaccurate AI verdict. Undo restores the previous answer and schedule.

Each answered/revealed encounter requests a fresh AI example, with recent examples excluded and normalized duplicates rejected. The last 30 generated examples are saved with backups. A generation failure or offline state shows an honest retry message instead of reusing an old example; review can continue. Fresh examples consume API usage. MC distractors remain cached for offline use; flip-card recall works offline.

Successful dictionary lookups automatically save the word and clear the search box. Existing words are shown without creating duplicates. Failed requests or saves keep the query available for retry.


- `ts-fsrs` 5.4.2; desired retention 90%, configurable to 85% or 95%.
- New learning steps: 1 minute / 10 minutes. Relearning after failure: 10 minutes. Maximum interval: 365 days.
- Due reviews come first, oldest first; new words follow a configurable daily allowance (5/10/15/20).
- Due checks use exact timestamps. Daily limits and MC day evidence use the device's local day.
- Each word appears once per selected session. Short learning steps become available in another session when their timestamps arrive.
- Save answer/result commits scheduling and progression together. Undo restores both. Skip never changes either and leaves the word pending.
- Optional sentence practice in word details remains separate and never marks acquisition.
- AI errors never count as a wrong answer. Sentence assessment needs internet; retry or skip when unavailable.
- Existing review dates and histories are preserved. Old recall ratings are not retroactively treated as MC evidence.
- JSON backups preserve MC/sentence progress and cached distractors; older backups start with no MC evidence. Editing a word's term or meaning clears progression and cached options.
- Model weights are library defaults, not personalized optimizer training.

## AI and security

The server supports fixed `lookup`, `practice`, `choices`, `example`, and `sentence-review` operations. It validates input, caps request and response sizes, uses JSON outputs, applies request timeouts, and rejects incomplete responses. Shared credentials stay on the server; personal credentials stay in the requesting browser’s persistent local storage and pass through the server per AI request. It restricts browser origins, uses HttpOnly/SameSite session cookies, and rate limits password attempts and AI calls. Rate limits are in-process: Vercel function instances have separate counters, and restarts clear them. They are not a global abuse or spending limit. Use a long private app password for this personal deployment. A shared/public multi-user service would need durable rate limits and per-user authentication before rollout.

Status truthfully reports unconfigured AI. The browser sends only the lookup term or the chosen word/definition and practice sentence. It does not upload the full vocabulary library. Pronunciation uses the device's speech engine. There is no analytics or advertising.

## Validation

```sh
npm run build
npm test
```

Tests cover scheduling, failures, minute-level due checks, daily limits, legacy import, malformed backup rejection, duplicate handling, persistence, stale-tab protection, authentication, rate limiting, upstream errors, and the offline asset manifest. API tests use a mocked provider, not a live credential. The build must precede tests because the offline test checks actual build output.

Manual browser checks: 390px phone layout, initial sample collection, reload persistence, manual add/edit, settings persistence and pasted import. The MC-to-sentence update was tested in a separate synthetic-data preview with mocked AI: sentence assessment, acquisition, undo, multiple-choice feedback, skipped-word handling, and saved results after reload. Physical iPhone behavior, live OpenAI billing/credentials and production hosting are not yet verified.

## References

- FSRS implementation: https://github.com/open-spaced-repetition/ts-fsrs
- OpenAI authentication: https://developers.openai.com/api/reference/overview
- Apple Home Screen web apps: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
