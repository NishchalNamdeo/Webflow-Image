import fs from "node:fs/promises";
import path from "node:path";
const RESOLVER_PREFIX = "bic:resolver:";
const USERSITE_PREFIX = "bic:userSite:";
function safeJsonParse(raw) {
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function userSiteKey(userId, siteId) {
    return `${userId}::${siteId}`;
}
async function loadFileState(filePath) {
    try {
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = safeJsonParse(raw);
        if (parsed && parsed.version === 1)
            return parsed;
    }
    catch {
        // ignore
    }
    return { version: 1, resolverBySite: {}, byUserSite: {} };
}
async function persistFileState(filePath, state) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
    await fs.rename(tmp, filePath);
}
export async function createTokenStore(opts) {
    const filePath = opts.filePath || path.join(process.cwd(), "data", "token-store.json");
    // Redis store (preferred for production)
    if (opts.redis) {
        const redis = opts.redis;
        const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
        return {
            getResolverToken: async (siteId) => {
                const raw = await redis.get(`${RESOLVER_PREFIX}${siteId}`);
                return safeJsonParse(raw);
            },
            setResolverToken: async (siteId, token) => {
                await redis.set(`${RESOLVER_PREFIX}${siteId}`, JSON.stringify(token), { EX: TTL_SECONDS });
            },
            getUserSiteToken: async (userId, siteId) => {
                const raw = await redis.get(`${USERSITE_PREFIX}${userId}:${siteId}`);
                return safeJsonParse(raw);
            },
            setUserSiteToken: async (userId, siteId, token) => {
                await redis.set(`${USERSITE_PREFIX}${userId}:${siteId}`, JSON.stringify(token), { EX: TTL_SECONDS });
            },
        };
    }
    // File store (fallback)
    let state = await loadFileState(filePath);
    return {
        getResolverToken: async (siteId) => {
            return state.resolverBySite[siteId] || null;
        },
        setResolverToken: async (siteId, token) => {
            state = {
                ...state,
                resolverBySite: { ...state.resolverBySite, [siteId]: token },
            };
            await persistFileState(filePath, state);
        },
        getUserSiteToken: async (userId, siteId) => {
            return state.byUserSite[userSiteKey(userId, siteId)] || null;
        },
        setUserSiteToken: async (userId, siteId, token) => {
            state = {
                ...state,
                byUserSite: { ...state.byUserSite, [userSiteKey(userId, siteId)]: token },
            };
            await persistFileState(filePath, state);
        },
    };
}
