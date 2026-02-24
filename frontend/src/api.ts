declare const __API_BASE__: string | undefined;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const normalize = (v: string) => String(v || "").trim().replace(/\/+$/, "");

export function getApiBase(): string {
  const compile = typeof __API_BASE__ === "string" ? __API_BASE__ : "";
  const runtime = (window as any).__API_BASE__ ? String((window as any).__API_BASE__) : "";
  const base = normalize(compile || runtime);
  if (!base) return "";

  // Allow http for localhost, otherwise require https.
  try {
    const u = new URL(base);
    const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (!isLocal && u.protocol !== "https:") return "";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  if (!base) throw new ApiError(0, "API_BASE is not configured");

  const res = await fetch(`${base}${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text || res.statusText;
    try {
      const j = text ? JSON.parse(text) : null;
      if (j && typeof j === "object" && typeof (j as any).message === "string") {
        msg = (j as any).message;
      }
    } catch {}
    throw new ApiError(res.status, msg);
  }

  if (res.status === 204) return {} as T;
  return (await res.json().catch(() => ({}))) as T;
}

export type AuthStatus = {
  authenticated: boolean;
  authorizedSitesCount?: number;
  siteIds?: string[];
};

export type SiteInfoSummary = {
  id: string;
  displayName?: string;
  shortName?: string;
};

export type SiteListResponse = { sites: SiteInfoSummary[] };
export type DeleteAssetResponse = {};

export const api = {
  authStatus: async (): Promise<AuthStatus | null> => {
    try {
      return await request<AuthStatus>("/api/auth/status");
    } catch {
      return null;
    }
  },

  sites: async (): Promise<SiteListResponse> => {
    return await request<SiteListResponse>("/api/sites");
  },

  logout: async (): Promise<void> => {
    await request("/api/logout", { method: "POST" });
  },

  deleteAsset: async (siteId: string, assetId: string): Promise<DeleteAssetResponse> => {
    const sid = encodeURIComponent(String(siteId || "").trim());
    const aid = encodeURIComponent(String(assetId || "").trim());
    return await request<DeleteAssetResponse>(`/api/sites/${sid}/assets/${aid}`, {
      method: "DELETE",
    });
  },
};