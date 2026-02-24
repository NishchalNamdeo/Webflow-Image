import express from "express";
import session from "express-session";
import { RedisStore } from "connect-redis";
import { createClient } from "redis";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config.js";
import { authorizeUrl, exchangeCodeForToken, webflowApi, isWebflowError, } from "./webflow.js";
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const app = express();
app.use(morgan("dev"));
app.set("trust proxy", 1);
// -----------------------------
// CORS
// -----------------------------
const originListStr = (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_URL || "").trim();
const normalizeOrigin = (v) => String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\/+$/, "");
const allowedOrigins = Array.from(new Set([
    normalizeOrigin(config.frontendUrl),
    ...originListStr.split(/[\s,]+/).map(normalizeOrigin),
].filter(Boolean)));
const corsAllowedHeaders = [
    "Authorization",
    "Content-Type",
    "Accept",
    "X-Requested-With",
    "X-Webflow-Id-Token",
];
const corsAllowedMethods = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const allowedOriginSet = new Set(allowedOrigins.map(normalizeOrigin));
const isAllowedOrigin = (origin) => {
    const o = normalizeOrigin(origin);
    if (!o)
        return false;
    if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(o))
        return true;
    return allowedOriginSet.has(o);
};
app.use((req, res, next) => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    if (origin && isAllowedOrigin(origin)) {
        res.header("Access-Control-Allow-Origin", normalizeOrigin(origin));
        res.header("Vary", "Origin");
        res.header("Access-Control-Allow-Credentials", "true");
        res.header("Access-Control-Allow-Methods", corsAllowedMethods);
        res.header("Access-Control-Allow-Headers", corsAllowedHeaders.join(", "));
    }
    if (req.method === "OPTIONS") {
        if (origin && isAllowedOrigin(origin))
            return res.status(204).end();
        return res.status(403).end();
    }
    return next();
});
const corsOptions = {
    origin: (origin, cb) => {
        if (!origin)
            return cb(null, true);
        return isAllowedOrigin(origin)
            ? cb(null, true)
            : cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: corsAllowedMethods,
    allowedHeaders: corsAllowedHeaders,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use((err, _req, res, next) => {
    if (err?.type === "entity.parse.failed") {
        return res.status(400).json({ message: "Invalid JSON" });
    }
    return next(err);
});
// -----------------------------
// Session (Redis optional)
// -----------------------------
const cookieSecureMode = String(process.env.COOKIE_SECURE || "auto").toLowerCase();
const cookieSecureSetting = cookieSecureMode === "true"
    ? true
    : cookieSecureMode === "false"
        ? false
        : "auto";
const defaultSameSite = cookieSecureSetting === true ? "none" : "lax";
let redisStore = undefined;
if (config.redisUrl) {
    const redisClient = createClient({ url: config.redisUrl });
    redisClient.connect().catch((e) => console.error("Redis connect error", e));
    redisStore = new RedisStore({ client: redisClient, prefix: "bulk_image_cleaner:" });
}
app.use(session({
    name: "bulk_image_cleaner_sid",
    store: redisStore,
    proxy: true,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: defaultSameSite,
        secure: cookieSecureSetting,
        maxAge: 7 * 24 * 60 * 60 * 1000,
    },
}));
// Upgrade cookie settings behind HTTPS proxy
app.use((req, _res, next) => {
    const isSecure = Boolean(req.secure) || req.headers["x-forwarded-proto"] === "https";
    if (isSecure && req.session) {
        req.session.cookie.secure = true;
        req.session.cookie.sameSite = "none";
    }
    next();
});
// -----------------------------
// Redirect sanitization
// -----------------------------
function isWebflowDashboardUrl(u) {
    return /^https:\/\/(?:[a-z0-9-]+\.)?webflow\.com\//i.test(u);
}
function isWebflowExtensionUrl(u) {
    return /^https:\/\/[a-z0-9]+\.webflow-ext\.com\//i.test(u);
}
function isLocalhostUrl(u) {
    return /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(u);
}
function sanitizeRedirect(u) {
    if (!u)
        return undefined;
    try {
        const url = new URL(u);
        const s = url.toString();
        if (isWebflowDashboardUrl(s) || isWebflowExtensionUrl(s) || isLocalhostUrl(s))
            return s;
        return undefined;
    }
    catch {
        return undefined;
    }
}
// -----------------------------
// Auth helpers
// -----------------------------
function hasAnyAuthorization(req) {
    // For this app we consider the user "authorized" only when at least one site has been granted.
    // (OAuth tokens can exist without an introspected site list if the introspect call fails.)
    const sites = req.session?.authorizedSites;
    if (!sites || typeof sites !== "object")
        return false;
    const ids = Object.keys(sites);
    if (ids.length === 0)
        return false;
    // Require that at least one site entry has a token attached.
    for (const id of ids) {
        const entry = sites[id];
        if (entry && typeof entry === "object" && String(entry.accessToken || "").trim())
            return true;
    }
    return false;
}
function requireAuth(req, res, next) {
    if (!hasAnyAuthorization(req)) {
        return res.status(401).json({ message: "Not authenticated" });
    }
    next();
}
function getAccessTokenForSite(req, siteId) {
    const map = ensureAuthorizedSites(req);
    const entry = map[String(siteId || "").trim()];
    const token = String(entry?.accessToken || req.session?.accessToken || "").trim();
    return token;
}
function ensureAuthorizedSites(req) {
    const s = req.session;
    if (!s.authorizedSites || typeof s.authorizedSites !== "object")
        s.authorizedSites = {};
    return s.authorizedSites;
}
function upsertAuthorizedSite(req, siteId, patch = {}) {
    const id = String(siteId || "").trim();
    if (!id)
        return;
    const map = ensureAuthorizedSites(req);
    const now = Date.now();
    const prev = map[id];
    map[id] = {
        siteId: id,
        siteName: patch.siteName ?? prev?.siteName,
        accessToken: patch.accessToken ?? prev?.accessToken,
        scopes: patch.scopes ?? prev?.scopes,
        firstSeenAt: prev?.firstSeenAt ?? now,
        lastSeenAt: patch.lastSeenAt ?? now,
    };
}
// -----------------------------
// OAuth routes
// -----------------------------
app.get("/auth", (req, res) => {
    const redirectHint = sanitizeRedirect(String(req.query.redirectTo ||
        req.query.redirect ||
        req.query.returnTo ||
        "")) ||
        sanitizeRedirect(String(req.get("referer") || "")) ||
        "https://webflow.com/dashboard";
    req.session.postAuthRedirect = redirectHint;
    const workspace = String(req.query.workspace || "").trim();
    req.session.save((err) => {
        if (err)
            return res.status(500).send("Session save failed");
        return res.redirect(authorizeUrl({ workspace: workspace || undefined }));
    });
});
app.get("/auth/callback", asyncRoute(async (req, res) => {
    const redirectAfter = sanitizeRedirect(String(req.session?.postAuthRedirect || "")) ||
        "https://webflow.com/dashboard";
    const code = String(req.query.code || "");
    const { error, error_description } = req.query;
    if (error) {
        console.warn("OAuth error:", error, error_description);
        return res.redirect(redirectAfter);
    }
    if (!code)
        return res.redirect(redirectAfter);
    const token = await exchangeCodeForToken(code);
    req.session.accessToken = token.accessToken;
    req.session.scopes = token.scope;
    // Store authorized siteIds (if available)
    let siteIds = [];
    try {
        const { data } = await webflowApi.token.introspect(token.accessToken);
        siteIds = data?.authorization?.authorizedTo?.siteIds || [];
    }
    catch (e) {
        console.warn("Token introspect failed", e);
    }
    // Try to map site names
    const idToName = {};
    try {
        const { data } = await webflowApi.sites.list(token.accessToken);
        const list = data?.sites || (Array.isArray(data) ? data : []);
        for (const s of list) {
            const id = String(s?.id || "").trim();
            if (!id)
                continue;
            const name = String(s?.displayName || s?.shortName || s?.name || "").trim();
            if (name)
                idToName[id] = name;
        }
    }
    catch {
        // ignore
    }
    if (siteIds.length === 0) {
        const fromSites = Object.keys(idToName);
        if (fromSites.length > 0)
            siteIds = fromSites;
    }
    const now = Date.now();
    for (const siteId of siteIds) {
        upsertAuthorizedSite(req, siteId, {
            accessToken: token.accessToken,
            scopes: token.scope,
            siteName: idToName[siteId],
            lastSeenAt: now,
        });
    }
    await new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
    return res.redirect(redirectAfter);
}));
// -----------------------------
// Minimal API (optional)
// -----------------------------
app.get("/api/auth/status", (req, res) => {
    const map = ensureAuthorizedSites(req);
    res.json({
        authenticated: hasAnyAuthorization(req),
        authorizedSitesCount: Object.keys(map).length,
        siteIds: Object.keys(map),
    });
});
app.get("/api/me", requireAuth, asyncRoute(async (req, res) => {
    const token = req.session?.accessToken;
    if (!token)
        return res.status(401).json({ message: "Not authenticated" });
    const { data } = await webflowApi.token.authorizedBy(token);
    res.json(data);
}));
app.get("/api/sites", requireAuth, (req, res) => {
    const map = ensureAuthorizedSites(req);
    const sites = Object.keys(map)
        .map((id) => ({
        id,
        displayName: map[id]?.siteName,
        shortName: map[id]?.siteName,
    }))
        .sort((a, b) => String(a.displayName || a.id).localeCompare(String(b.displayName || b.id)));
    res.json({ sites });
});
// Delete an asset (image) from Webflow so it disappears from the Assets panel too.
// Frontend sends the current Designer siteId so we can validate authorization.
app.delete("/api/sites/:siteId/assets/:assetId", requireAuth, asyncRoute(async (req, res) => {
    const siteId = String(req.params.siteId || "").trim();
    const assetId = String(req.params.assetId || "").trim();
    if (!siteId || !assetId) {
        return res.status(400).json({ message: "Missing siteId or assetId" });
    }
    const authorizedSites = ensureAuthorizedSites(req);
    if (!authorizedSites[siteId]) {
        return res.status(403).json({ message: "Site is not authorized for this session" });
    }
    const token = getAccessTokenForSite(req, siteId);
    if (!token)
        return res.status(401).json({ message: "Not authenticated" });
    await webflowApi.assets.delete(token, assetId);
    return res.status(204).send();
}));
app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
        res.status(204).send();
    });
});
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/", (_req, res) => {
    res.status(200).send("Bulk Image Cleaner backend is running");
});
// -----------------------------
// Error handler
// -----------------------------
app.use((err, _req, res, _next) => {
    if (isWebflowError(err)) {
        const retryAfter = err.headers?.get?.("retry-after");
        return res.status(err.status).json({
            message: err.message,
            code: err.body?.code,
            details: err.body?.details,
            retryAfter: retryAfter ? Number(retryAfter) : undefined,
        });
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
});
if (!process.env.VERCEL) {
    app.listen(config.port, () => {
        console.log(`Backend running on http://localhost:${config.port}`);
    });
}
export default app;
