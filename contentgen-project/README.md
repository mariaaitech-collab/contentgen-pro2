# ContentGen Pro — LinkedIn Integration

## Folder structure
```
backend/            <- Deploy this to Cloudflare Workers (free tier)
  worker.js          Handles LinkedIn OAuth login + posting
  wrangler.toml       Cloudflare Worker config (add your KV namespace id here)
  package.json        Lets you run `npm install` / `npm run deploy`
  .gitignore

frontend/            <- Host this on GitHub Pages (or any static host)
  index.html          The app itself (content generator + connect/post UI)
  privacy.html         Privacy policy page (needed for LinkedIn app setup)
  app-logo.png         Square logo for your LinkedIn app's "App logo" field

DEPLOY_STEPS.md       Step-by-step deployment guide (start here)
```

## Order of operations
1. Read `DEPLOY_STEPS.md`.
2. `cd backend`, run `npm install`, then follow the wrangler login/KV/secrets/deploy steps.
3. Once deployed, copy your live Worker URL (e.g. `https://linkedin-post-backend.yoursubdomain.workers.dev`).
4. In `frontend/index.html`, update the line:
   ```js
   var BACKEND_URL = 'https://linkedin-post-backend.YOUR-SUBDOMAIN.workers.dev';
   ```
   with your real URL.
5. In `backend/worker.js`, update the line:
   ```js
   const frontEndUrl = "https://example.com/your-page.html";
   ```
   with wherever you'll host `index.html` (e.g. your GitHub Pages URL).
6. Redeploy the worker (`npm run deploy`) after that edit.
7. Push the `frontend/` folder to a GitHub repo and enable GitHub Pages.
8. In your LinkedIn app's Auth tab, set the Authorized redirect URL to:
   `https://linkedin-post-backend.YOUR-SUBDOMAIN.workers.dev/auth/linkedin/callback`

## Security reminder
Never commit real secrets to git. `LINKEDIN_CLIENT_SECRET` should only ever be set via
`wrangler secret put`, never written into any file in this project.
