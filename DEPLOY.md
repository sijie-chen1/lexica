# Publish Lexica at tarovocab.app

## 1. Keep a copy of your words

In the current laptop app, open Settings → Back up and save the JSON file somewhere safe. This contains your vocabulary and learning progress. The GitHub repository contains app code, not your browser's vocabulary.

## 2. Upload the source to GitHub

Use a private repository for this personal app. Upload the contents of this folder, including `api`, `server`, `src`, `public`, `scripts`, `tests`, `package.json`, `package-lock.json`, `vite.config.js`, `index.html`, `vercel.json` and the dotfiles intended for version control.

Do not upload `.local-ai.json`, `.env`, `node_modules`, `dist` or vocabulary backups. The included `.gitignore` excludes them. Keep API keys out of commits and chat messages.

## 3. Import the repository in Vercel

Choose Add New → Project, connect GitHub, and import this repository. If Vercel asks for GitHub repository access, limit it to this repository. Leave the root directory at the repository root and use the included Vite settings. The build runs `npm run build && npm test`; output is `dist`. The API routes become server functions automatically.

Before deployment, add these variables in Vercel's project environment settings:

| Name | Value |
| --- | --- |
| `OPENAI_API_KEY` | Your existing API key; enter it directly in Vercel. |
| `APP_PASSWORD` | A long, private password you choose to unlock AI in this app. |
| `OPENAI_BASE_URL` | Your provider's API base address, normally `https://api.openai.com/v1`. |
| `OPENAI_MODEL` | A model supported by your provider; the current default is `gpt-4o-mini`. |

Set them for Production. Add Preview only if you also want AI on preview deployments. Never prefix these names with `VITE_`: that would make values available to frontend builds. The hosted version does not read the laptop's settings file. `HOST`, `PORT` and `COOKIE_SECURE` do not need Vercel settings; hosted cookies are always secure.

Deploy, then open the generated HTTPS address. In the app's Settings, unlock AI with your app password. Test a vocabulary lookup and a sentence assessment. The automated checks use a mock provider and do not verify your real key. If environment settings change later, redeploy for the changes to apply.

## 4. Connect the domain

In the Vercel project, open Settings → Domains and add `tarovocab.app`. Vercel displays the DNS records required for this particular project. Add those exact records where the domain's DNS is managed, preserving unrelated email and other records. If adding `www.tarovocab.app`, configure it to redirect to your chosen main address.

Wait for Vercel to show valid configuration and an issued HTTPS certificate. Verify the app and AI connection at `https://tarovocab.app` before treating the move as complete. Do not use a guessed DNS address; use Vercel's displayed values.

## 5. Move your vocabulary

Open `https://tarovocab.app` in the browser you want to use. In Settings → Restore backup, choose the JSON backup from step 1. Check that your words and learning progress appear. The old laptop address, Vercel preview address and custom domain all have separate browser storage.

On iPhone, open the final address in Safari and choose Share → Add to Home Screen. Restore your JSON backup in the installed app if the collection is empty. Open it online once to cache the app shell; AI needs internet access.

Hosting does not add automatic iCloud backup or cross-device sync. Each browser/device keeps its own collection. Continue saving JSON backups to iCloud Drive or another safe location. Restoring a backup transfers progress through the time of that backup.

## Future updates

Pushing changes to the production branch triggers a new Vercel deployment after GitHub integration is connected. The build must pass its checks. Close all app windows and reopen to allow an offline app update to activate. Keep using the same domain to retain access to the same browser storage.

References: [Vercel GitHub integration](https://vercel.com/docs/git/vercel-for-github), [Vercel domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain), [Node functions](https://vercel.com/docs/functions/runtimes/node-js).
