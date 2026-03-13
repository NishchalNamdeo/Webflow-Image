import fs from "node:fs/promises";
import path from "node:path";

export type StoredToken = {
  siteId: string;
  siteName?: string;
  userId?: string;
  accessToken: string;
  scope?: string;
  createdAt: number;
  updatedAt: number;
};

export type TokenStore = {
  getResolverToken: (siteId: string) => Promise<StoredToken | null>;
  setResolverToken: (siteId: string, token: StoredToken) => Promise<void>;
  getUserSiteToken: (userId: string, siteId: string) => Promise<StoredToken | null>;
  setUserSiteToken: (userId: string, siteId: string, token: StoredToken) => Promise<void>;
};

type RedisLike = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: any) => Promise<any>;
};

const RESOLVER_PREFIX = "bic:resolver:";
const USERSITE_PREFIX = "bic:userSite:";

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// --------------------
// File-backed store (dev-friendly fallback)
// --------------------

type FileState = {
  version: 1;
  resolverBySite: Record<string, StoredToken>;
  byUserSite: Record<string, StoredToken>;
};

function userSiteKey(userId: string, siteId: string) {
  return `${userId}::${siteId}`;
}

async function loadFileState(filePath: string): Promise<FileState> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = safeJsonParse<FileState>(raw);
    if (parsed && parsed.version === 1) return parsed;
  } catch {
    // ignore
  }
  return { version: 1, resolverBySite: {}, byUserSite: {} };
}

async function persistFileState(filePath: string, state: FileState): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

export async function createTokenStore(opts: {
  redis?: RedisLike | null;
  filePath?: string;
}): Promise<TokenStore> {
  const filePath = opts.filePath || path.join(process.cwd(), "data", "token-store.json");

  // Redis store (preferred for production)
  if (opts.redis) {
    const redis = opts.redis;
    const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

    return {
      getResolverToken: async (siteId: string) => {
        const raw = await redis.get(`${RESOLVER_PREFIX}${siteId}`);
        return safeJsonParse<StoredToken>(raw);
      },
      setResolverToken: async (siteId: string, token: StoredToken) => {
        await redis.set(`${RESOLVER_PREFIX}${siteId}`, JSON.stringify(token), { EX: TTL_SECONDS });
      },
      getUserSiteToken: async (userId: string, siteId: string) => {
        const raw = await redis.get(`${USERSITE_PREFIX}${userId}:${siteId}`);
        return safeJsonParse<StoredToken>(raw);
      },
      setUserSiteToken: async (userId: string, siteId: string, token: StoredToken) => {
        await redis.set(`${USERSITE_PREFIX}${userId}:${siteId}`, JSON.stringify(token), { EX: TTL_SECONDS });
      },
    };
  }

  // File store (fallback)
  let state = await loadFileState(filePath);

  return {
    getResolverToken: async (siteId: string) => {
      return state.resolverBySite[siteId] || null;
    },
    setResolverToken: async (siteId: string, token: StoredToken) => {
      state = {
        ...state,
        resolverBySite: { ...state.resolverBySite, [siteId]: token },
      };
      await persistFileState(filePath, state);
    },
    getUserSiteToken: async (userId: string, siteId: string) => {
      return state.byUserSite[userSiteKey(userId, siteId)] || null;
    },
    setUserSiteToken: async (userId: string, siteId: string, token: StoredToken) => {
      state = {
        ...state,
        byUserSite: { ...state.byUserSite, [userSiteKey(userId, siteId)]: token },
      };
      await persistFileState(filePath, state);
    },
  };
}
