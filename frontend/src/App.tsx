import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getApiBase, SiteInfoSummary } from "./api";

declare const webflow: any;

type ImageRow = {
  id: string;
  name: string;
  url?: string;
  mimeType?: string;
  isUnused: boolean;
};

type ScanMeta = {
  scannedPages: number;
  scannedElements: number;
  scannedStyles: number;
  detectedReferences: number;
  durationMs: number;
  scannedAssets: number;
};

type ScanResult = {
  images: ImageRow[];
  meta: ScanMeta;
};

type ConfirmState = {
  open: boolean;
  title: string;
  body?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm?: () => void | Promise<void>;
};

type DesignerSiteInfo = {
  siteId?: string;
  siteName?: string;
  shortName?: string;
  workspaceId?: string;
  workspaceSlug?: string;
};

type AuthGateStatus = "loading" | "api_missing" | "needs_auth" | "needs_site" | "ok";

type AuthGateState = {
  status: AuthGateStatus;
  siteId?: string;
  siteName?: string;
  workspaceId?: string;
  workspaceSlug?: string;
  authorizedSites?: SiteInfoSummary[];
  message?: string;
};


const ConfirmModal: React.FC<{
  state: ConfirmState;
  onClose: () => void;
}> = ({ state, onClose }) => {
  const {
    open,
    title,
    body,
    confirmText = "Delete",
    cancelText = "Cancel",
    danger = true,
    onConfirm,
  } = state;

  if (!open) return null;

  const handleConfirm = async () => {
    try {
      await onConfirm?.();
    } catch {
      // ignore
    } finally {
      onClose();
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/50" onClick={onClose}>
      <div className="p-4" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 shadow-xl p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 9v4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M12 17h.01"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="min-w-0">
              <div className="text-sm font-semibold text-neutral-100">{title}</div>
              {body && (
                <div className="mt-1 whitespace-pre-line text-xs text-neutral-400 leading-relaxed">{body}</div>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-800"
                >
                  {cancelText}
                </button>
                <button
                  onClick={handleConfirm}
                  className={[
                    "flex-1 rounded-xl px-3 py-2 text-xs font-bold",
                    danger
                      ? "bg-red-500 text-white hover:bg-red-400"
                      : "bg-white text-neutral-950 hover:opacity-90",
                  ].join(" ")}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProgressBar: React.FC<{ value: number }> = ({ value }) => {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="h-2 rounded-full bg-neutral-900 overflow-hidden border border-neutral-800">
      <div className="h-full bg-white" style={{ width: `${v}%` }} />
    </div>
  );
};

const Pill: React.FC<React.PropsWithChildren> = ({ children }) => (
  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-400/10 text-emerald-200 border border-emerald-400/20">
    {children}
  </span>
);

export default function App() {
  const [screen, setScreen] = useState<
    "intro" | "scanning" | "results" | "success"
  >("intro");

  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [authGate, setAuthGate] = useState<AuthGateState>({ status: "loading" });

  const refreshAuth = useCallback(async () => {
    const apiBase = getApiBase();

    let info: DesignerSiteInfo | null = null;
    try {
      info = (await webflow.getSiteInfo?.()) || null;
    } catch {
      info = null;
    }

    const siteId = String((info as any)?.siteId || "").trim();
    const siteName = String(
      (info as any)?.siteName || (info as any)?.shortName || ""
    ).trim();
    const workspaceId = String((info as any)?.workspaceId || "").trim();
    const workspaceSlug = String((info as any)?.workspaceSlug || "").trim();

    if (!apiBase) {
      setAuthGate({
        status: "api_missing",
        siteId,
        siteName,
        workspaceId,
        workspaceSlug,
        message: "API_BASE is not configured for this extension build.",
      });
      return;
    }

    const auth = await api.authStatus();
    if (!auth || !auth.authenticated) {
      setAuthGate({
        status: "needs_auth",
        siteId,
        siteName,
        workspaceId,
        workspaceSlug,
        message: "Authorize this app from your Webflow Workspace to continue.",
      });
      return;
    }

    try {
      const { sites } = await api.sites();
      const authorizedSites = Array.isArray(sites) ? sites : [];

      const siteAuthorized =
        !!siteId && authorizedSites.some((s) => String(s.id) === siteId);

      if (!siteAuthorized) {
        setAuthGate({
          status: "needs_site",
          siteId,
          siteName,
          workspaceId,
          workspaceSlug,
          authorizedSites,
          message:
            "This site is not authorized yet. Authorize access to this site and then refresh here.",
        });
        return;
      }

      setAuthGate({
        status: "ok",
        siteId,
        siteName,
        workspaceId,
        workspaceSlug,
        authorizedSites,
      });
    } catch {
      setAuthGate({
        status: "needs_auth",
        siteId,
        siteName,
        workspaceId,
        workspaceSlug,
        message:
          "Could not verify authorization with the backend. Authorize again and refresh.",
      });
    }
  }, []);

  const openAuthorize = useCallback(() => {
    const base = getApiBase();
    if (!base) return;

    const u = new URL(`${base}/auth`);
    u.searchParams.set("redirectTo", window.location.href);
    if (authGate.workspaceId) u.searchParams.set("workspace", authGate.workspaceId);

    const url = u.toString();

    try {
      if (typeof webflow?.openUrlInNewTab === "function") {
        webflow.openUrlInNewTab(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [authGate.workspaceId]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    } finally {
      await refreshAuth();
    }
  }, [refreshAuth]);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);


  const [scanProgress, setScanProgress] = useState(0);
  const [scanStep, setScanStep] = useState<string>("");

  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ done: number; total: number } | null>(null);

  const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false, title: "" });

  const scanTickRef = useRef<number | null>(null);

  const clearScanTick = useCallback(() => {
    if (scanTickRef.current !== null) {
      clearInterval(scanTickRef.current);
      scanTickRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    setScanResult(null);
    setError(null);
    setQuery("");
    setSelectedIds(new Set());
    setScanProgress(0);
    setScanStep("");
    setScreen("intro");
  }, []);

  const updateProgress = useCallback((v: number) => {
    setScanProgress((prev) => Math.max(prev, Math.min(100, v)));
  }, []);

  const runScan = useCallback(async () => {
    clearScanTick();
    setError(null);
    setSelectedIds(new Set());
    setQuery("");

    setScreen("scanning");
    setScanProgress(0);

    // UI tick
    scanTickRef.current = window.setInterval(() => {
      setScanProgress((p) => (p >= 92 ? p : p + 1));
    }, 180);

    const started = performance.now();

    try {
      try {
        await webflow.setExtensionSize?.("comfortable");
      } catch {
        // ignore
      }

      setScanStep("Checking assets…");
      updateProgress(10);

      if (typeof webflow.getAllAssets !== "function") {
        throw new Error("This Webflow environment does not expose assets API (getAllAssets).");
      }

      const assets = await webflow.getAllAssets();
      const allAssets: any[] = Array.isArray(assets) ? assets : [];

      type ImgInternal = {
        id: string;
        name: string;
        url: string;
        mimeType: string;
        assetObj: any;
        used: boolean;
      };

      const images: ImgInternal[] = [];

      for (const asset of allAssets) {
        let mimeType = "";
        try {
          mimeType = (await asset.getMimeType?.()) || "";
        } catch {
          mimeType = "";
        }
        if (!mimeType.startsWith("image/")) continue;

        let name = "Untitled";
        let url = "";
        try {
          name = (await asset.getName?.()) || name;
        } catch {
          // ignore
        }
        try {
          url = (await asset.getUrl?.()) || "";
        } catch {
          // ignore
        }

        images.push({
          id: String(asset.id),
          name,
          url,
          mimeType,
          assetObj: asset,
          used: false,
        });
      }

      const imageById = new Map<string, ImgInternal>();
      const urlToId = new Map<string, string>();
      for (const img of images) {
        imageById.set(img.id, img);
        if (img.url) urlToId.set(img.url, img.id);
      }

      updateProgress(20);

      // pages
      setScanStep("Checking pages…");
      const items = await webflow.getAllPagesAndFolders?.();
      const pages: any[] = (items ?? []).filter((i: any) => i?.type === "Page");
      const totalPages = pages.length;

      updateProgress(28);

      // element scan
      setScanStep("Checking elements…");

      let scannedPages = 0;
      let scannedElements = 0;
      let detectedReferences = 0;

      const markUsed = (assetId?: string) => {
        if (!assetId) return;
        const entry = imageById.get(assetId);
        if (entry && !entry.used) {
          entry.used = true;
          detectedReferences++;
        }
      };

      const scanStylePayload = (payload: any) => {
        if (!payload) return;
        const s = typeof payload === "string" ? payload : JSON.stringify(payload);

        // ids
        const ids = s.match(/[a-f0-9]{24}/gi) || [];
        for (const id of ids) {
          if (imageById.has(id)) markUsed(id);
        }

        // urls
        const urls = s.match(/https?:\/\/[^\s"')]+/g) || [];
        for (const u of urls) {
          const id = urlToId.get(u);
          if (id) markUsed(id);
        }
      };

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        try {
          await webflow.switchPage(page);
        } catch {
          continue;
        }

        scannedPages++;

        const elements: any[] = (await webflow.getAllElements?.()) || [];
        scannedElements += elements.length;

        for (const el of elements) {
          // <Image>
          if (el?.type === "Image" && typeof el.getAsset === "function") {
            try {
              const a = await el.getAsset();
              if (a?.id) markUsed(String(a.id));
            } catch {
              // ignore
            }
          }

          // best-effort: background images & inline styles
          try {
            if (typeof el?.getStyles === "function") {
              const styles: any[] = (await el.getStyles()) || [];
              for (const st of styles) {
                const props = await st.getProperties?.().catch(() => null);
                scanStylePayload(props);
              }
            }
          } catch {
            // ignore
          }

          try {
            if (typeof el?.getStyle === "function") {
              const st = await el.getStyle().catch(() => null);
              const props = await st?.getProperties?.().catch(() => null);
              scanStylePayload(props);
            }
          } catch {
            // ignore
          }

          try {
            if (typeof el?.getBackgroundImage === "function") {
              const bg = await el.getBackgroundImage().catch(() => null);
              if (bg?.id) markUsed(String(bg.id));
            }
          } catch {
            // ignore
          }
        }

        // Page OG / Search images
        try {
          const ogUrl = await page.getOpenGraphImage?.().catch(() => "");
          if (ogUrl) {
            const id = urlToId.get(String(ogUrl));
            if (id) markUsed(id);
          }
        } catch {
          // ignore
        }

        try {
          const searchUrl = await page.getSearchImage?.().catch(() => "");
          if (searchUrl) {
            const id = urlToId.get(String(searchUrl));
            if (id) markUsed(id);
          }
        } catch {
          // ignore
        }

        if (totalPages > 0) {
          const pct = 28 + Math.round(((i + 1) / totalPages) * 50);
          updateProgress(pct);
        }
      }

      // styles scan (covers background images & image styles)
      setScanStep("Checking background images & styles…");
      updateProgress(82);

      let scannedStyles = 0;
      if (typeof webflow.getAllStyles === "function") {
        const styles: any[] = (await webflow.getAllStyles()) || [];
        scannedStyles = styles.length;

        const BATCH = 40;
        for (let i = 0; i < styles.length; i += BATCH) {
          const batch = styles.slice(i, i + BATCH);
          const propsList = await Promise.all(
            batch.map((s: any) => s.getProperties?.().catch(() => null))
          );
          for (const props of propsList) scanStylePayload(props);
          updateProgress(82 + Math.round(((i + BATCH) / Math.max(1, styles.length)) * 15));
        }
      }

      clearScanTick();
      updateProgress(100);

      const ended = performance.now();

      const rows: ImageRow[] = images.map((img) => ({
        id: img.id,
        name: img.name,
        url: img.url,
        mimeType: img.mimeType,
        isUnused: !img.used,
      }));

      const result: ScanResult = {
        images: rows,
        meta: {
          scannedPages,
          scannedElements,
          scannedStyles,
          detectedReferences,
          durationMs: Math.round(ended - started),
          scannedAssets: allAssets.length,
        },
      };

      setScanResult(result);

      const unusedCount = rows.filter((r) => r.isUnused).length;
      setScreen(unusedCount === 0 ? "success" : "results");
    } catch (e: any) {
      clearScanTick();
      setScanProgress(0);
      setScanStep("");
      setError(e?.message || "Scan failed");
      setScreen("intro");
    }
  }, [clearScanTick, updateProgress]);

  const unusedImages = useMemo(() => {
    const base = (scanResult?.images || []).filter((i) => i.isUnused);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (img) => img.name.toLowerCase().includes(q) || img.id.toLowerCase().includes(q)
    );
  }, [scanResult, query]);

  const selectedCount = selectedIds.size;

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);


  const allUnusedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const img of scanResult?.images || []) {
      if (img.isUnused) ids.add(img.id);
    }
    return ids;
  }, [scanResult]);

  const allUnusedSelected = useMemo(() => {
    if (allUnusedIds.size === 0) return false;
    for (const id of allUnusedIds) {
      if (!selectedIds.has(id)) return false;
    }
    return true;
  }, [allUnusedIds, selectedIds]);

  const toggleSelectAllUnused = useCallback(() => {
    setSelectedIds((prev) => {
      if (allUnusedIds.size === 0) return new Set(prev);

      // Are ALL unused ids currently selected?
      let isAll = true;
      for (const id of allUnusedIds) {
        if (!prev.has(id)) {
          isAll = false;
          break;
        }
      }

      return isAll ? new Set() : new Set(allUnusedIds);
    });
  }, [allUnusedIds]);



  const performDelete = useCallback(async () => {
  if (!scanResult) return;
  const ids = Array.from(selectedIds);
  if (ids.length === 0) return;

  setDeleting(true);
  setDeleteProgress({ done: 0, total: ids.length });
  setError(null);

  const siteId = String(authGate.siteId || "").trim();

  const deleted = new Set<string>();
  const failed: string[] = [];

  let authFailed = false;
  let scopeFailed = false;

  const tryRemoveFromDesigner = async (assetMaybe: any, assetId: string): Promise<boolean> => {
    let asset = assetMaybe;

    if (!asset && typeof webflow.getAssetById === "function") {
      try {
        asset = await webflow.getAssetById(assetId);
      } catch {
        asset = null;
      }
    }

    if (!asset) return true;

    try {
      if (typeof asset.remove === "function") {
        await asset.remove();
        return true;
      }
    } catch {}

    try {
      if (typeof webflow.removeAsset === "function") {
        await webflow.removeAsset(asset);
        return true;
      }
    } catch {}

    return false;
  };

  try {
    const assets = await webflow.getAllAssets?.().catch(() => []);
    const list: any[] = Array.isArray(assets) ? assets : [];
    const byId = new Map<string, any>(list.map((a: any) => [String(a.id), a]));

    let done = 0;
    for (const id of ids) {
      const assetObj = byId.get(id);
      let ok = false;

      // 1) Primary: backend OAuth delete (removes from Webflow Assets too)
      if (siteId) {
        try {
          await api.deleteAsset(siteId, id);
          ok = true;
        } catch (e: any) {
          const status = Number(e?.status || 0);
          const msg = String(e?.message || "").toLowerCase();
          if (status === 401) authFailed = true;
          if (status === 403 || msg.includes("scope") || msg.includes("assets:write")) scopeFailed = true;
          ok = false;
        }
      }

      // 2) Best-effort: instantly update Assets panel UI in Designer
      const designerOk = await tryRemoveFromDesigner(assetObj, id);
      ok = ok || designerOk;

      if (ok) deleted.add(id);
      else failed.push(id);

      done++;
      setDeleteProgress({ done, total: ids.length });
    }

    try {
      await webflow.getAllAssets?.();
    } catch {}

    setScanResult((prev) => {
      if (!prev) return prev;
      const nextImages = prev.images.filter((img) => !deleted.has(img.id));
      return {
        images: nextImages,
        meta: {
          ...prev.meta,
          scannedAssets: Math.max(0, (prev.meta?.scannedAssets || 0) - deleted.size),
        },
      };
    });

    setSelectedIds(new Set());

    const remainingUnused = (scanResult.images || []).filter(
      (img) => img.isUnused && !deleted.has(img.id)
    ).length;

    setScreen(remainingUnused === 0 ? "success" : "results");

    if (failed.length > 0) {
      let msg = `Could not delete ${failed.length} image${failed.length > 1 ? "s" : ""}. They are still listed.`;
      if (authFailed) {
        msg += "\n\nAuth issue: Please click Authorize again (or Logout → Authorize), then Refresh, and try deleting again.";
      } else if (scopeFailed) {
        msg += "\n\nPermission issue: Your token may not have assets:write scope. Please re-authorize the app in Webflow and grant Assets write access.";
      }
      setError(msg);
    }
  } finally {
    setDeleting(false);
    setDeleteProgress(null);
  }
}, [authGate.siteId, scanResult, selectedIds]);



  const requestDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    setConfirmState({
      open: true,
      title: `Delete ${count} Unused Image${count > 1 ? "s" : ""}?`,
      body:
        "These images are not used anywhere in your project. This action cannot be undone.\n\nImportant: Images referenced in custom code/embeds may not be detected. Double-check before deleting.",
      confirmText: "Delete",
      cancelText: "Cancel",
      danger: true,
      onConfirm: performDelete,
    });
  }, [performDelete, selectedIds]);

  const PrimaryButton: React.FC<
    React.PropsWithChildren<{ onClick: () => void; disabled?: boolean }>
  > = ({ onClick, disabled, children }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-xl bg-white text-neutral-950 px-3 py-2 text-xs font-bold hover:opacity-90 disabled:opacity-60"
    >
      {children}
    </button>
  );

  const GhostButton: React.FC<
    React.PropsWithChildren<{ onClick: () => void; disabled?: boolean }>
  > = ({ onClick, disabled, children }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
    >
      {children}
    </button>
  );

  const DangerButton: React.FC<
    React.PropsWithChildren<{ onClick: () => void; disabled?: boolean }>
  > = ({ onClick, disabled, children }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl bg-red-500/90 text-white px-3 py-2 text-xs font-bold hover:bg-red-500 disabled:opacity-50"
    >
      {children}
    </button>
  );


  // -----------------------------
  // Authorization gate
  // -----------------------------
  if (authGate.status !== "ok") {
    const canAuthorize = authGate.status === "needs_auth" || authGate.status === "needs_site";

    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 overflow-x-hidden">
        <div className="p-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Bulk Image Cleaner</h1>
            <p className="mt-1 text-xs text-neutral-400">
              {authGate.siteName ? `Site: ${authGate.siteName}` : "Open this extension inside Webflow Designer"}
            </p>
          </div>

          {authGate.message && (
            <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-200 whitespace-pre-line">
              {authGate.message}
            </div>
          )}

          {authGate.status === "loading" ? (
            <div className="mt-4 text-xs text-neutral-400">Checking authorization…</div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {canAuthorize && (
                <PrimaryButton onClick={openAuthorize} disabled={false}>
                  Authorize
                </PrimaryButton>
              )}

              <GhostButton onClick={refreshAuth} disabled={false}>
                Refresh
              </GhostButton>

              {authGate.status !== "api_missing" && (
                <GhostButton onClick={logout} disabled={false}>
                  Logout
                </GhostButton>
              )}
            </div>
          )}

          {authGate.authorizedSites && authGate.authorizedSites.length > 0 && (
            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
              <div className="text-xs font-semibold text-neutral-100">Authorized sites</div>
              <div className="mt-2 space-y-1 text-[11px] text-neutral-400">
                {authGate.authorizedSites.slice(0, 8).map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{s.displayName || s.shortName || s.id}</span>
                    <span className="text-neutral-500">{s.id}</span>
                  </div>
                ))}
                {authGate.authorizedSites.length > 8 && (
                  <div className="text-neutral-500">
                    +{authGate.authorizedSites.length - 8} more
                  </div>
                )}
              </div>
            </div>
          )}

          {authGate.status === "api_missing" && (
            <div className="mt-4 text-[11px] text-neutral-500">
              Tip: Set API_BASE in frontend/.env (or as window.__API_BASE__) to your backend URL.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === "intro") {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 overflow-x-hidden">
        <div className="p-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Bulk Image Cleaner</h1>
            <p className="mt-1 text-xs text-neutral-400">
              Clean unused images from your Webflow project in seconds
            </p>
          </div>

          {error && (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="text-sm font-semibold text-neutral-100">What it does</div>
            <ul className="mt-2 space-y-1 text-xs text-neutral-400 list-disc pl-4">
              <li>Finds all unused images in your Webflow project</li>
              <li>Shows you which images are safe to delete</li>
              <li>Lets you delete images one by one or all at once</li>
              <li>Helps you search for specific images by name</li>
            </ul>

            <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              Some images used in custom code, embeds, or external scripts might not be detected.
              Check these images manually before deleting.
            </div>

            <div className="mt-4">
              <PrimaryButton onClick={runScan} disabled={deleting}>
                Scan for Unused Images
              </PrimaryButton>
            </div>
          </div>

          <div className="mt-4 text-[11px] text-neutral-500">
            OAuth is handled by your backend (/auth). After you authorize in the Webflow dashboard,
            this extension runs directly — no authorize button here.
          </div>
        </div>
      </div>
    );
  }

  if (screen === "scanning") {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 overflow-x-hidden">
        <div className="p-4">
          <h1 className="text-xl font-bold tracking-tight">Bulk Image Cleaner</h1>
          <p className="mt-1 text-xs text-neutral-400">Scanning your project…</p>

          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="flex items-center justify-between text-[11px] text-neutral-300">
              <span>Scanning…</span>
              <span>{Math.round(scanProgress)}%</span>
            </div>

            <div className="mt-2">
              <ProgressBar value={scanProgress} />
            </div>

            <div className="mt-3 text-xs text-neutral-400">
              {scanStep || "Checking pages, elements, background images, and styles…"}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
                <div className="text-neutral-400">Step</div>
                <div className="mt-0.5 text-neutral-100">Checking pages</div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
                <div className="text-neutral-400">Step</div>
                <div className="mt-0.5 text-neutral-100">Checking elements</div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
                <div className="text-neutral-400">Step</div>
                <div className="mt-0.5 text-neutral-100">Checking background images</div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
                <div className="text-neutral-400">Step</div>
                <div className="mt-0.5 text-neutral-100">Checking image styles</div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <button
              onClick={reset}
              className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
            >
              Cancel & go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "success") {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 overflow-x-hidden">
        <div className="p-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 text-center">
            <div className="text-xl font-bold">Your Project Is Clean 🎉</div>
            <div className="mt-2 text-xs text-neutral-400">
              No unused images found. All images in your project are currently in use.
            </div>

            {scanResult?.meta && (
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-left">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
                  <div className="text-neutral-500">Pages scanned</div>
                  <div className="mt-0.5 text-neutral-100 font-semibold">{scanResult.meta.scannedPages}</div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
                  <div className="text-neutral-500">Styles scanned</div>
                  <div className="mt-0.5 text-neutral-100 font-semibold">{scanResult.meta.scannedStyles}</div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
                  <div className="text-neutral-500">Assets checked</div>
                  <div className="mt-0.5 text-neutral-100 font-semibold">{scanResult.meta.scannedAssets}</div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
                  <div className="text-neutral-500">Time</div>
                  <div className="mt-0.5 text-neutral-100 font-semibold">{scanResult.meta.durationMs}ms</div>
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center justify-center gap-2">
              <GhostButton onClick={runScan} disabled={deleting}>
                Rescan for Unused Images
              </GhostButton>
              <GhostButton onClick={reset} disabled={deleting}>
                Back
              </GhostButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 overflow-x-hidden relative">
      <ConfirmModal
        state={confirmState}
        onClose={() => setConfirmState((s) => ({ ...s, open: false }))}
      />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight">See Exactly What’s Unused</h1>
            <p className="mt-1 text-xs text-neutral-400">
              Only images marked <span className="text-neutral-200 font-semibold">Unused</span> are shown.
            </p>
          </div>

          <GhostButton onClick={runScan} disabled={deleting}>
            Rescan
          </GhostButton>
        </div>

        <div className="mt-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search images by name…"
            className="w-full rounded-2xl bg-neutral-900 border border-neutral-800 px-3 py-2 text-xs outline-none focus:border-neutral-600"
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <GhostButton onClick={toggleSelectAllUnused} disabled={deleting || unusedImages.length === 0}>
            {allUnusedSelected ? "Unselect All" : "Select All"}
          </GhostButton>

          <div className="flex-1" />

          <div className="text-[11px] text-neutral-400 mr-2">Selected images: {selectedCount}</div>
          <DangerButton onClick={requestDelete} disabled={deleting || selectedCount === 0}>
            {deleting ? "Deleting…" : "Delete Selected"}
          </DangerButton>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="mt-3 rounded-2xl border border-neutral-800 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] uppercase tracking-wide text-neutral-400 bg-neutral-900/60">
            <div className="col-span-1"> </div>
            <div className="col-span-5">Image Name</div>
            <div className="col-span-4">Image ID</div>
            <div className="col-span-2 text-right">Status</div>
          </div>

          {unusedImages.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <div className="text-sm text-neutral-200">
                {query.trim() ? "No unused images match your search." : "No unused images found"}
              </div>
              {!query.trim() && (
                <div className="mt-1 text-xs text-neutral-400">
                  Your project is already clean. All images are currently in use.
                </div>
              )}
              <div className="mt-4 flex justify-center">
                <GhostButton onClick={() => setScreen("success")}>View Clean State</GhostButton>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {unusedImages.map((img) => {
                const checked = selectedIds.has(img.id);
                return (
                  <div
                    key={img.id}
                    className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-neutral-900/40"
                  >
                    <div className="col-span-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(img.id)}
                        className="accent-white"
                      />
                    </div>

                    <div className="col-span-5 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-8 w-10 rounded-md overflow-hidden bg-neutral-900 border border-neutral-800 shrink-0">
                          {img.url ? (
                            <img src={img.url} alt={img.name} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-neutral-100 truncate">{img.name}</div>
                          <div className="text-[10px] text-neutral-500 truncate">{img.mimeType || "image"}</div>
                        </div>
                      </div>
                    </div>

                    <div className="col-span-4 min-w-0">
                      <div className="text-[11px] text-neutral-300 truncate">{img.id}</div>
                    </div>

                    <div className="col-span-2 text-right">
                      <Pill>Unused</Pill>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {deleteProgress && (
          <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-3">
            <div className="flex items-center justify-between text-[11px] text-neutral-400">
              <span>Deletion progress</span>
              <span>
                {deleteProgress.done}/{deleteProgress.total}
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar
                value={
                  deleteProgress.total === 0
                    ? 0
                    : (deleteProgress.done / deleteProgress.total) * 100
                }
              />
            </div>
          </div>
        )}

        <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          Important: Images referenced in custom code, embeds, or external scripts might not be detected.
          Please verify before deleting.
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={reset}
            className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
          >
            Back to start
          </button>

          {scanResult?.meta ? (
            <div className="text-[11px] text-neutral-500">
              Scanned {scanResult.meta.scannedPages} pages · {scanResult.meta.scannedAssets} assets · {scanResult.meta.durationMs}ms
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
