import fs from "node:fs/promises";
import path from "node:path";

export type StoredSiteAuth = {
  siteId: string;
  siteName?: string;
  accessToken: string;
  scopes?: string;
  firstSeenAt: number;
  lastSeenAt: number;
};

type StoreFile = {
  version: 1;
  sites: Record<string, StoredSiteAuth>;
};

const DEFAULT_PATH = path.join(process.cwd(), ".data", "auth-store.json");
const STORE_PATH = String(process.env.AUTH_STORE_PATH || DEFAULT_PATH);

let cache: StoreFile | null = null;
let savePromise: Promise<void> | null = null;
let dirty = false;

async function ensureDir(p: string) {
  const dir = path.dirname(p);
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
}

async function load(): Promise<StoreFile> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.version === 1 && parsed.sites) {
      cache = { version: 1, sites: parsed.sites as Record<string, StoredSiteAuth> };
      return cache;
    }
  } catch {
    // ignore
  }
  cache = { version: 1, sites: {} };
  return cache;
}

async function flushSoon() {
  if (savePromise) return savePromise;
  savePromise = (async () => {
    // small debounce so multiple updates in same tick don't write multiple times
    await new Promise((r) => setTimeout(r, 120));
    if (!dirty) return;

    const store = await load();
    await ensureDir(STORE_PATH);
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
    dirty = false;
  })()
    .catch(() => {})
    .finally(() => {
      savePromise = null;
    });

  return savePromise;
}

export async function getStoredSiteAuth(siteId: string): Promise<StoredSiteAuth | null> {
  const id = String(siteId || "").trim();
  if (!id) return null;
  const store = await load();
  return store.sites[id] || null;
}

export async function upsertStoredSiteAuth(entry: StoredSiteAuth): Promise<void> {
  const id = String(entry?.siteId || "").trim();
  if (!id) return;

  const store = await load();
  const now = Date.now();
  const prev = store.sites[id];

  store.sites[id] = {
    siteId: id,
    siteName: entry.siteName ?? prev?.siteName,
    accessToken: entry.accessToken || prev?.accessToken || "",
    scopes: entry.scopes ?? prev?.scopes,
    firstSeenAt: prev?.firstSeenAt ?? entry.firstSeenAt ?? now,
    lastSeenAt: entry.lastSeenAt ?? now,
  };

  dirty = true;
  await flushSoon();
}

export async function touchStoredSiteAuth(siteId: string): Promise<void> {
  const id = String(siteId || "").trim();
  if (!id) return;
  const store = await load();
  const prev = store.sites[id];
  if (!prev) return;
  prev.lastSeenAt = Date.now();
  dirty = true;
  await flushSoon();
}

export async function removeStoredSiteAuth(siteId: string): Promise<void> {
  const id = String(siteId || "").trim();
  if (!id) return;
  const store = await load();
  if (!store.sites[id]) return;
  delete store.sites[id];
  dirty = true;
  await flushSoon();
}
