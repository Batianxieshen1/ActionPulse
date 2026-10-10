/**
 * 同步客户端引擎（无 React、无 DOM，可单测）。
 *
 * 协议：
 *   GET  /api/state          -> { rev, state }
 *   PUT  /api/state          -> body { baseRev, state }；rev 不匹配返回 409 + { rev, state }
 *
 * 乐观锁：PUT 带 baseRev。若服务端已经前进（别的设备写过），返回 409 和最新状态，
 * 客户端**先合并再重试**，因此不会丢掉别人的改动；重试有次数上限，绝不进入死循环。
 *
 * 所有网络异常都被吞掉并降级为 offline：电脑休眠时手机必须照常能用（local-first）。
 */
import { mergeStates } from "../domain/merge";
import { sanitizeState } from "../domain/validation";
import type { AppState } from "../domain/types";

export type SyncStatus = "idle" | "connecting" | "online" | "offline" | "unauthorized" | "error";

export interface SyncOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  maxConflictRetries?: number;
}

/**
 * 交给 reducer 去合并的远端数据。
 *
 * 刻意返回**服务端那一份原始状态**而不是"客户端预先合并好的快照"：
 * 拉取是异步的，用户完全可能在请求飞行途中又加了一条任务。
 * 如果直接用预合并快照覆盖，那条新任务就被吞掉了；
 * 交给 reducer 在 dispatch 时刻的"当前状态"上合并，才能保证不丢本地改动。
 */
export interface RemoteUpdate {
  remote: AppState;
  rev: number;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readRev(body: Record<string, unknown>): number | null {
  return typeof body.rev === "number" && Number.isFinite(body.rev) ? body.rev : null;
}

export class SyncEngine {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly maxConflictRetries: number;
  private currentRev = 0;
  status: SyncStatus = "idle";

  constructor(options: SyncOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl =
      options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
    this.now = options.now ?? (() => Date.now());
    this.maxConflictRetries = options.maxConflictRetries ?? 3;
  }

  get rev(): number {
    return this.currentRev;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      // 纵深防御：即使有 Service Worker 或中间层，也不想拿到任何缓存过的同步数据
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
        ...((init.headers as Record<string, string> | undefined) ?? {}),
      },
    });
  }

  /** 拉取服务端状态。远端没有带来新信息时返回 null（避免同步回环）。 */
  async pull(local: AppState): Promise<RemoteUpdate | null> {
    this.status = "connecting";

    let response: Response;
    try {
      response = await this.request("/api/state", { method: "GET" });
    } catch {
      this.status = "offline";
      return null;
    }

    if (response.status === 401 || response.status === 403) {
      this.status = "unauthorized";
      return null;
    }
    if (!response.ok) {
      this.status = "error";
      return null;
    }

    const body = await readJson(response);
    const rev = readRev(body);
    if (rev !== null) this.currentRev = Math.max(this.currentRev, rev);

    const merged = mergeStates(local, body.state, this.now());
    this.status = "online";
    if (!merged.changed) return null;
    return { remote: sanitizeState(body.state), rev: this.currentRev };
  }

  /** 推送本地状态。遇到 409 会先合并服务端状态再重试。 */
  async push(local: AppState): Promise<RemoteUpdate | null> {
    let candidate = local;

    for (let attempt = 0; attempt <= this.maxConflictRetries; attempt += 1) {
      let response: Response;
      try {
        response = await this.request("/api/state", {
          method: "PUT",
          body: JSON.stringify({ baseRev: this.currentRev, state: candidate }),
        });
      } catch {
        this.status = "offline";
        return null;
      }

      if (response.status === 401 || response.status === 403) {
        this.status = "unauthorized";
        return null;
      }

      if (response.status === 409) {
        const body = await readJson(response);
        const rev = readRev(body);
        if (rev !== null) this.currentRev = Math.max(this.currentRev, rev);
        // 关键：先把对方的改动并进来，再重试，否则会覆盖别人
        candidate = mergeStates(candidate, body.state, this.now()).state;
        continue;
      }

      if (!response.ok) {
        this.status = "error";
        return null;
      }

      const body = await readJson(response);
      const rev = readRev(body);
      if (rev !== null) this.currentRev = rev;
      this.status = "online";
      // 发生过冲突时，candidate 里已经并入了对方的改动，交给 reducer 落到本地
      return candidate === local ? null : { remote: candidate, rev: this.currentRev };
    }

    this.status = "error";
    return null;
  }
}
