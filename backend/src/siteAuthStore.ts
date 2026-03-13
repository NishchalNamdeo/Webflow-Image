import fs from "node:fs/promises";
import path from "node:path";

export type SiteAuthRecord = {
  accessToken: string;
  scopes?: string;
  siteName?: string;
  updatedAt: number;
};

type StoreData = {
  version: 1;
  sites: Record<string, SiteAuthRecord>;
};

let mem: StoreData | null = null;

function storePath(): string {
  const envPath = String(process.env.AUTH_STORE_PATH || "").trim();
  if (envPath) return envPath;

  // Default: <backend>/data/site-authorizations.json
  // process.cwd() should be the backend folder when running scripts from backend.
  return path.join(process.cwd(), "data", "site-authorizations.json");
}

async function load(): Promise<StoreData> {
  if (mem) return mem;
  const p = storePath();
  try {
    const raw = await fs.readFile(p, "utf-8");
    const parsed = JSON.parse(raw);
    const data: StoreData = {
      version: 1,
      sites: typeof parsed?.sites === "object" && parsed?.sites ? parsed.sites : {},
    };
    mem = data;
    return data;
  } catch {
    mem = { version: 1, sites: {} };
    return mem;
  }
}

async function save(data: StoreData): Promise<void> {
  mem = data;
  const p = storePath();
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // In some hosting environments the filesystem can be read-only.
    // If saving fails, we still keep the in-memory cache for this process.
  }
}

export async function upsertSiteAuth(siteId: string, patch: Omit<SiteAuthRecord, "updatedAt">): Promise<void> {
  const id = String(siteId || "").trim();
  if (!id) return;
  const data = await load();
  data.sites[id] = {
    accessToken: String(patch.accessToken || "").trim(),
    scopes: patch.scopes,
    siteName: patch.siteName,
    updatedAt: Date.now(),
  };
  await save(data);
}

export async function getSiteAuth(siteId: string): Promise<SiteAuthRecord | null> {
  const id = String(siteId || "").trim();
  if (!id) return null;
  const data = await load();
  const rec = data.sites[id];
  if (!rec?.accessToken) return null;
  return rec;
}

export async function listAuthorizedSiteIds(): Promise<string[]> {
  const data = await load();
  return Object.keys(data.sites || {});
}
