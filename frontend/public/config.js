// Optional runtime override for backend API base.
// In local dev, prefer .env -> webpack DefinePlugin (__API_BASE__).
(() => {
  const RAW_API_BASE = "";
  const normalize = (v) => String(v || "").trim().replace(/\/+$/, "");
  const base = normalize(RAW_API_BASE);
  if (!base) return;
  try {
    Object.defineProperty(window, "__API_BASE__", {
      value: base,
      writable: false,
      configurable: false,
      enumerable: false,
    });
  } catch {
    window.__API_BASE__ = base;
  }
})();
