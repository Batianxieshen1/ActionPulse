import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "../domain/types";
import { SyncEngine, type SyncStatus } from "../sync/client";
import { clearSyncToken, resolveSyncConfig, saveSyncToken, type SyncConfig } from "../sync/session";

const PUSH_DEBOUNCE_MS = 450;

export interface SyncApi {
  config: SyncConfig | null;
  status: SyncStatus;
  rev: number;
  lastError: string | null;
  /** 本页是否由 ActionPulse 本地服务托管（决定同步与 AI 是否可能可用）。 */
  serverHere: boolean | null;
  connect: (token: string) => boolean;
  disconnect: () => void;
  syncNow: () => void;
}

interface Options {
  state: AppState;
  enabled: boolean;
  applyRemote: (state: AppState) => void;
}

/**
 * 同步编排（local-first）：
 *  - 本地永远是真源：任何时刻都能读写，服务不在就降级为纯本地。
 *  - 启动时拉一次并与本地合并；之后 SSE 推送触发增量拉取。
 *  - 本地改动防抖后推送；服务端 rev 前进（别的设备写过）时先合并再重试。
 *
 * 关于"同步回环"：这里**不需要**抑制"因远端变化而触发的推送"。
 * 因为 mergeStates 在远端没有带来新信息时会返回 changed=false，reducer 随即返回原引用，
 * 状态不变 -> 不再触发推送，链路自然收敛。
 * 反过来，如果把远端变化后的推送压掉，服务端就会残留一个"客户端已经删掉、服务端还留着"的僵尸任务，
 * 新设备首次同步时会把它拉回来 —— 这正是墓碑要消灭的问题。
 */
export function useSync({ state, enabled, applyRemote }: Options): SyncApi {
  const [config, setConfig] = useState<SyncConfig | null>(() => (enabled ? resolveSyncConfig() : null));
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [rev, setRev] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [serverHere, setServerHere] = useState<boolean | null>(null);

  const engineRef = useRef<SyncEngine | null>(null);
  const pushTimer = useRef<number | null>(null);
  const stateRef = useRef(state);
  const applyRemoteRef = useRef(applyRemote);
  stateRef.current = state;
  applyRemoteRef.current = applyRemote;

  const pullNow = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const pulled = await engine.pull(stateRef.current);
    setStatus(engine.status);
    setRev(engine.rev);
    if (pulled) applyRemoteRef.current(pulled.remote);
  }, []);

  const pushNow = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const result = await engine.push(stateRef.current);
    setStatus(engine.status);
    setRev(engine.rev);
    if (result) applyRemoteRef.current(result.remote);
  }, []);

  // 探测本地服务是否存在（公开接口，不带任何数据）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const body = response.ok ? ((await response.json()) as { ok?: boolean }) : null;
        if (!cancelled) setServerHere(body?.ok === true);
      } catch {
        if (!cancelled) setServerHere(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 建连：首次拉取 + 订阅 SSE
  useEffect(() => {
    if (!config || !enabled) {
      engineRef.current = null;
      setStatus("idle");
      return;
    }

    const engine = new SyncEngine({ baseUrl: config.baseUrl, token: config.token });
    engineRef.current = engine;
    let disposed = false;

    void (async () => {
      await pullNow();
      if (disposed) return;
      // 服务端还是空的（rev 0）而本地已经有内容 -> 把本地推上去
      if (engine.rev === 0 && stateRef.current.tasks.length > 0) await pushNow();
      setLastError(engine.status === "unauthorized" ? "token 不正确，请重新配对" : null);
    })();

    let source: EventSource | null = null;
    try {
      source = new EventSource(`${config.baseUrl}/api/events?token=${encodeURIComponent(config.token)}`);
      source.onmessage = () => {
        void pullNow();
      };
      // 重连成功时补一次完整往返：既刷新状态，也把离线期间攒下的本地改动推上去
      source.onopen = () => {
        void (async () => {
          await pullNow();
          await pushNow();
        })();
      };
      source.onerror = () => {
        // EventSource 会自行重连；这里只反映状态
        setStatus((current) => (current === "unauthorized" ? current : "offline"));
      };
    } catch {
      source = null;
    }

    return () => {
      disposed = true;
      source?.close();
      engineRef.current = null;
      if (pushTimer.current !== null) {
        window.clearTimeout(pushTimer.current);
        pushTimer.current = null;
      }
    };
  }, [config, enabled, pullNow, pushNow]);

  // 任何状态变化（本地改动 or 远端合并）都防抖推送一次，让服务端收敛到客户端的合并视图
  useEffect(() => {
    if (!engineRef.current) return;
    if (pushTimer.current !== null) window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      pushTimer.current = null;
      void pushNow();
    }, PUSH_DEBOUNCE_MS);
  }, [state, pushNow]);

  // 回到前台时补一次，手机切回来能立刻看到电脑上的改动
  useEffect(() => {
    if (!config || !enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void pullNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [config, enabled, pullNow]);

  const connect = useCallback((token: string) => {
    const trimmed = token.trim();
    if (trimmed.length < 8) return false;
    saveSyncToken(trimmed);
    setConfig({ baseUrl: window.location.origin, token: trimmed });
    setLastError(null);
    return true;
  }, []);

  const disconnect = useCallback(() => {
    clearSyncToken();
    setConfig(null);
    setStatus("idle");
    setRev(0);
    setLastError(null);
  }, []);

  const syncNow = useCallback(() => {
    void (async () => {
      await pullNow();
      await pushNow();
    })();
  }, [pullNow, pushNow]);

  return { config, status, rev, lastError, serverHere, connect, disconnect, syncNow };
}
