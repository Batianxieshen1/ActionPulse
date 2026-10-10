/**
 * 同步会话配置：从地址栏的 ?token= 或是 localStorage 里拿到 token。
 * 设计意图：服务启动时打印带 token 的地址，手机打开一次即记住，
 * 之后从主屏图标进入也能直接同步，不需要重复输入。
 */
export const SYNC_TOKEN_KEY = "actionpulse.sync.token";
export const SYNC_DISABLED_KEY = "actionpulse.sync.disabled";

export interface SyncConfig {
  baseUrl: string;
  token: string;
}

function readLocal(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 隐私模式下静默失败：同步不可用，但应用照常工作
  }
}

export function syncDisabled(): boolean {
  return readLocal(SYNC_DISABLED_KEY) === "1";
}

export function saveSyncToken(token: string): void {
  writeLocal(SYNC_TOKEN_KEY, token.trim());
  writeLocal(SYNC_DISABLED_KEY, "0");
}

export function clearSyncToken(): void {
  writeLocal(SYNC_TOKEN_KEY, "");
  writeLocal(SYNC_DISABLED_KEY, "1");
}

/** token 留在地址栏里会被截图/分享带出去，配对成功后立刻抹掉。 */
function stripTokenFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token")) return;
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.toString());
  } catch {
    // 忽略
  }
}

export function resolveSyncConfig(): SyncConfig | null {
  if (typeof window === "undefined") return null;

  const fromUrl = new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
  if (fromUrl.length >= 8) {
    saveSyncToken(fromUrl);
    stripTokenFromUrl();
    return { baseUrl: window.location.origin, token: fromUrl };
  }

  if (syncDisabled()) return null;

  const stored = readLocal(SYNC_TOKEN_KEY).trim();
  if (stored.length < 8) return null;
  return { baseUrl: window.location.origin, token: stored };
}
