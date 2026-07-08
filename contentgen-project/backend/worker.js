/**
 * ContentGen Pro backend — runs on Cloudflare Workers (free tier).
 *
 * Routes:
 *   GET  /auth/linkedin              -> redirects user to LinkedIn login
 *   GET  /auth/linkedin/callback     -> LinkedIn redirects back here
 *   GET  /api/linkedin/status        -> tells front end if user is connected
 *   POST /api/linkedin/post          -> publishes a post to LinkedIn
 *
 *   GET  /auth/facebook              -> redirects user to Facebook login
 *   GET  /auth/facebook/callback     -> Facebook redirects back here
 *   GET  /api/facebook/status        -> tells front end if user is connected
 *   POST /api/facebook/post          -> publishes a post to the user's Facebook Page
 *
 * Secrets needed (set with `wrangler secret put NAME`, never hard-code them):
 *   LINKEDIN_CLIENT_ID
 *   LINKEDIN_CLIENT_SECRET
 *   FB_APP_ID
 *   FB_APP_SECRET
 *
 * KV namespace needed (create with `wrangler kv namespace create SESSIONS`):
 *   SESSIONS  -> stores session data per session id
 */

const REDIRECT_PATH = "/auth/linkedin/callback";

// CHANGE THIS to your actual front-end origin once you know it
const ALLOWED_ORIGIN = "*"; // tighten this before going live

// CHANGE THIS to your actual front-end URL (where users land after login)
const FRONTEND_URL = "https://mariaaitech-collab.github.io/contentgen-pro2/";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };
}

function randomId() {
  return crypto.randomUUID();
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // =========================================================
    // LINKEDIN
    // =========================================================

    // ---- Step 1: kick off LinkedIn login ----
    if (url.pathname === "/auth/linkedin") {
      const redirectUri = `${url.origin}${REDIRECT_PATH}`;
      const state = randomId();

      const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", env.LINKEDIN_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", "openid profile w_member_social");
      authUrl.searchParams.set("state", state);

      return new Response(null, {
        status: 302,
        headers: {
          Location: authUrl.toString(),
          "Set-Cookie": `li_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
        },
      });
    }

    // ---- Step 2: LinkedIn sends the user back here ----
    if (url.pathname === REDIRECT_PATH) {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const savedState = getCookie(request, "li_oauth_state");

      if (!code || !state || state !== savedState) {
        return new Response("Login failed or expired. Please try connecting again.", { status: 400 });
      }

      const redirectUri = `${url.origin}${REDIRECT_PATH}`;

      const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: env.LINKEDIN_CLIENT_ID,
          client_secret: env.LINKEDIN_CLIENT_SECRET,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        return new Response("Token exchange failed: " + errText, { status: 500 });
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userData = await userRes.json();
      const personUrn = `urn:li:person:${userData.sub}`;

      const sessionId = randomId();
      await env.SESSIONS.put(
        "li_" + sessionId,
        JSON.stringify({ accessToken, personUrn, name: userData.name }),
        { expirationTtl: 60 * 60 * 24 * 30 }
      );

      return new Response(null, {
        status: 302,
        headers: {
          Location: FRONTEND_URL,
          "Set-Cookie": `li_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
        },
      });
    }

    // ---- LinkedIn: status check ----
    if (url.pathname === "/api/linkedin/status") {
      const sessionId = getCookie(request, "li_session");
      if (!sessionId) {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
      const session = await env.SESSIONS.get("li_" + sessionId, "json");
      return new Response(JSON.stringify({ connected: !!session, name: session?.name }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // ---- LinkedIn: post ----
    if (url.pathname === "/api/linkedin/post" && request.method === "POST") {
      const sessionId = getCookie(request, "li_session");
      if (!sessionId) {
        return new Response(JSON.stringify({ error: "Not connected" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }

      const session = await env.SESSIONS.get("li_" + sessionId, "json");
      if (!session) {
        return new Response(JSON.stringify({ error: "Session expired, please reconnect" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }

      const { content } = await request.json();
      if (!content || !content.trim()) {
        return new Response(JSON.stringify({ error: "No content provided" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }

      const postRes = await fetch("https://api.linkedin.com/rest/posts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": "202406",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author: session.personUrn,
          commentary: content,
          visibility: "PUBLIC",
          distribution: {
            feedDistribution: "MAIN_FEED",
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        }),
      });

      if (!postRes.ok) {
        const errText = await postRes.text();
        return new Response(JSON.stringify({ error: "LinkedIn rejected the post", details: errText }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // =========================================================
    // FACEBOOK
    // =========================================================

    // ---- Step 1: kick off Facebook login ----
    if (url.pathname === "/auth/facebook") {
      const redirectUri = `${url.origin}/auth/facebook/callback`;
      const state = randomId();

      const authUrl = new URL("https://www.facebook.com/v20.0/dialog/oauth");
      authUrl.searchParams.set("client_id", env.FB_APP_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", "pages_show_list,pages_manage_posts");
      authUrl.searchParams.set("state", state);

      return new Response(null, {
        status: 302,
        headers: {
          Location: authUrl.toString(),
          "Set-Cookie": `fb_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
        },
      });
    }

    // ---- Step 2: Facebook sends the user back here ----
    if (url.pathname === "/auth/facebook/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const savedState = getCookie(request, "fb_oauth_state");

      if (!code || !state || state !== savedState) {
        return new Response("Facebook login failed or expired. Please try again.", { status: 400 });
      }

      const redirectUri = `${url.origin}/auth/facebook/callback`;

      const tokenUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
      tokenUrl.searchParams.set("client_id", env.FB_APP_ID);
      tokenUrl.searchParams.set("client_secret", env.FB_APP_SECRET);
      tokenUrl.searchParams.set("redirect_uri", redirectUri);
      tokenUrl.searchParams.set("code", code);

      const tokenRes = await fetch(tokenUrl.toString());
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return new Response("Token exchange failed: " + JSON.stringify(tokenData), { status: 500 });
      }
      const userToken = tokenData.access_token;

      const pagesRes = await fetch(
        `https://graph.facebook.com/v20.0/me/accounts?access_token=${userToken}`
      );
      const pagesData = await pagesRes.json();

      if (!pagesData.data || !pagesData.data.length) {
        return new Response(
          "No Facebook Pages found for this account. You need to manage at least one Page.",
          { status: 400 }
        );
      }

      // Simplicity ke liye pehla page use ho raha hai
      const page = pagesData.data[0];

      const sessionId = randomId();
      await env.SESSIONS.put(
        "fb_" + sessionId,
        JSON.stringify({
          pageId: page.id,
          pageName: page.name,
          pageToken: page.access_token,
        }),
        { expirationTtl: 60 * 60 * 24 * 60 }
      );

      return new Response(null, {
        status: 302,
        headers: {
          Location: FRONTEND_URL,
          "Set-Cookie": `fb_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=5184000`,
        },
      });
    }

    // ---- Facebook: status check ----
    if (url.pathname === "/api/facebook/status") {
      const sessionId = getCookie(request, "fb_session");
      if (!sessionId) {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
      const session = await env.SESSIONS.get("fb_" + sessionId, "json");
      return new Response(JSON.stringify({ connected: !!session, name: session?.pageName }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // ---- Facebook: post using the connected user's own page token ----
    if (url.pathname === "/api/facebook/post" && request.method === "POST") {
      const sessionId = getCookie(request, "fb_session");
      if (!sessionId) {
        return new Response(JSON.stringify({ error: "Not connected" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
      const session = await env.SESSIONS.get("fb_" + sessionId, "json");
      if (!session) {
        return new Response(JSON.stringify({ error: "Session expired, please reconnect" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }

      const { content } = await request.json();
      if (!content || !content.trim()) {
        return new Response(JSON.stringify({ error: "No content provided" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }

      const fbRes = await fetch(`https://graph.facebook.com/v20.0/${session.pageId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, access_token: session.pageToken }),
      });
      const fbData = await fbRes.json();

      if (!fbRes.ok) {
        return new Response(
          JSON.stringify({ error: "Facebook rejected the post", details: fbData }),
          { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
        );
      }

      return new Response(JSON.stringify({ success: true, id: fbData.id }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};