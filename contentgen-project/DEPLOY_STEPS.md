# Deploying your LinkedIn backend (all free)

## 0. Prerequisites
- Node.js installed (https://nodejs.org)
- A free Cloudflare account (https://dash.cloudflare.com/sign-up)

## 1. Install the deploy tool
Open a terminal in this folder and run:
```
npm install -g wrangler
wrangler login
```
This opens a browser window to connect wrangler to your free Cloudflare account.

## 2. Create the database that stores login sessions
```
wrangler kv namespace create SESSIONS
```
It will print something like:
```
kv_namespaces = [
  { binding = "SESSIONS", id = "abc123..." }
]
```
Copy that `id` value into `wrangler.toml` where it says `PASTE_YOUR_KV_NAMESPACE_ID_HERE`.

## 3. Add your LinkedIn secrets (never typed into code, never shared with anyone)
```
wrangler secret put LINKEDIN_CLIENT_ID
```
(paste your Client ID when prompted, press Enter)
```
wrangler secret put LINKEDIN_CLIENT_SECRET
```
(paste your Client Secret when prompted, press Enter)

## 4. Deploy
```
wrangler deploy
```
This prints your live URL, something like:
```
https://linkedin-post-backend.YOUR-SUBDOMAIN.workers.dev
```
That's your backend's real, permanent address.

## 5. Connect the dots
1. Go back to your LinkedIn app's **Auth** tab and add this exact Authorized redirect URL:
   `https://linkedin-post-backend.YOUR-SUBDOMAIN.workers.dev/auth/linkedin/callback`
2. Open `worker.js`, find the line:
   ```
   const frontEndUrl = "https://example.com/your-page.html";
   ```
   and change it to wherever your actual HTML page will live (see note below).
3. Run `wrangler deploy` again to push that change.

## 6. Where does your front-end HTML page live?
Right now it only exists as a downloaded file on your computer. For the "Connect LinkedIn"
button to work, the page needs a real URL too (browsers won't let a `file://` page receive
an OAuth redirect properly). Easiest free option: GitHub Pages.
- Create a free GitHub account, create a new repository, upload your `index.html` file,
  turn on GitHub Pages in the repo settings. You'll get a URL like
  `https://yourname.github.io/reponame/index.html` — use that as your `frontEndUrl` above.

Once both pieces are live, "Connect LinkedIn" will open a real LinkedIn login popup, and
"Post" will publish for real.
