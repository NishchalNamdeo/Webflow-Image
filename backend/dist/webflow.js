export class WebflowError extends Error {
    status;
    body;
    headers;
    constructor(status, message, body, headers) {
        super(message);
        this.status = status;
        this.body = body;
        this.headers = headers;
    }
}
export function isWebflowError(e) {
    return e instanceof WebflowError || (e && typeof e.status === "number" && e.body);
}
const API_V2 = "https://api.webflow.com/v2";
const API_BETA = "https://api.webflow.com/beta";
function normalizeScopes(raw) {
    return raw
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ");
}
function mergeScopes(required, provided) {
    const req = required
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    const prov = String(provided || "")
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    const reqSet = new Set(req);
    const out = [...req];
    for (const s of prov) {
        if (!reqSet.has(s))
            out.push(s);
    }
    return out.join(" ");
}
export function authorizeUrl(opts = {}) {
    const clientId = String(process.env.WEBFLOW_CLIENT_ID || "");
    const redirectUri = String(process.env.WEBFLOW_REDIRECT_URI || "");
    // Default scopes for this app.
    // NOTE: assets delete requires assets:write.
    const REQUIRED_SCOPES = "sites:read,authorized_user:read,assets:read,assets:write";
    const merged = mergeScopes(REQUIRED_SCOPES, process.env.WEBFLOW_SCOPES);
    const scope = normalizeScopes(merged);
    const u = new URL("https://webflow.com/oauth/authorize");
    u.searchParams.set("client_id", clientId);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", scope);
    if (opts.workspace)
        u.searchParams.set("workspace", opts.workspace);
    return u.toString();
}
export async function exchangeCodeForToken(code) {
    const clientId = String(process.env.WEBFLOW_CLIENT_ID || "");
    const clientSecret = String(process.env.WEBFLOW_CLIENT_SECRET || "");
    const redirectUri = String(process.env.WEBFLOW_REDIRECT_URI || "");
    const res = await fetch("https://api.webflow.com/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            code,
            grant_type: "authorization_code",
        }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new WebflowError(res.status, data?.message || "Token exchange failed", data, res.headers);
    }
    return { accessToken: data.access_token, scope: data.scope };
}
async function wf(base, accessToken, path, init = {}) {
    const res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            ...(init.headers || {}),
        },
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
        throw new WebflowError(res.status, data?.message || "Webflow API error", data, res.headers);
    }
    return { data };
}
export const webflowApi = {
    token: {
        authorizedBy: (token) => wf(API_V2, token, "/token/authorized_by"),
        introspect: (token) => wf(API_V2, token, "/token/introspect"),
        // Verifies and decodes a Designer Extension ID token.
        // Docs: Designer API webflow.getIdToken() -> resolve via /beta/token/resolve
        resolveIdToken: (token, idToken) => wf(API_BETA, token, "/token/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
        }),
    },
    sites: {
        list: (token) => wf(API_V2, token, "/sites"),
    },
    assets: {
        // Webflow Data API v2: DELETE /v2/assets/:asset_id
        // Required scope: assets:write
        delete: (token, assetId) => wf(API_V2, token, `/assets/${encodeURIComponent(assetId)}`, {
            method: "DELETE",
        }),
    },
};
