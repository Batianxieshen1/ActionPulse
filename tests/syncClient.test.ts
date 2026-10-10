import { describe, expect, it, vi } from "vitest";
import { SyncEngine } from "../src/sync/client";
import { defaultState } from "../src/domain/validation";
import { createTask } from "../src/store/taskStore";
import type { AppState } from "../src/domain/types";

const T0 = Date.parse("2026-10-08T10:00:00.000Z");

/** 两边必须是同一个 task id，否则它们本来就是两个不同的任务，合并结果没有可比性。 */
function stateWith(title: string, updatedAt: number, id = "shared"): AppState {
  const state = defaultState();
  state.tasks = [{ ...createTask({ title }, updatedAt), id, updatedAt }];
  return state;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** vi.fn 的调用参数是无类型的，这里集中收口一次转换。 */
function initOf(mock: { mock: { calls: unknown[][] } }, index = 0): RequestInit {
  return mock.mock.calls[index][1] as RequestInit;
}

function engineWith(fetchImpl: typeof fetch) {
  return new SyncEngine({
    baseUrl: "http://localhost:5274",
    token: "secret",
    fetchImpl,
    now: () => T0,
  });
}

describe("SyncEngine.pull", () => {
  it("服务端有更新时返回合并后的状态", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rev: 4, state: stateWith("来自服务端", T0 + 100) }));
    const result = await engineWith(fetchImpl as unknown as typeof fetch).pull(stateWith("本地", T0));
    expect(result?.remote.tasks[0].title).toBe("来自服务端");
    expect(result?.rev).toBe(4);
  });

  it("服务端没有新东西时返回 null（避免无意义的重渲染与同步回环）", async () => {
    const local = stateWith("一致", T0);
    const fetchImpl = vi.fn(async () => jsonResponse({ rev: 4, state: local }));
    expect(await engineWith(fetchImpl as unknown as typeof fetch).pull(local)).toBeNull();
  });

  it("带上 Bearer token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rev: 1, state: defaultState() }));
    await engineWith(fetchImpl as unknown as typeof fetch).pull(defaultState());
    const headers = initOf(fetchImpl).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer secret");
  });

  it("网络异常时不抛出，标记为离线", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const engine = engineWith(fetchImpl as unknown as typeof fetch);
    expect(await engine.pull(stateWith("本地", T0))).toBeNull();
    expect(engine.status).toBe("offline");
  });

  it("401 被识别为鉴权失败，而不是离线", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "unauthorized" }, 401));
    const engine = engineWith(fetchImpl as unknown as typeof fetch);
    await engine.pull(defaultState());
    expect(engine.status).toBe("unauthorized");
  });
});

describe("SyncEngine.push", () => {
  it("推送成功后记录新的 rev", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rev: 9 }));
    const engine = engineWith(fetchImpl as unknown as typeof fetch);
    const result = await engine.push(stateWith("本地", T0));
    expect(result).toBeNull();
    expect(engine.status).toBe("online");
    expect(engine.rev).toBe(9);
  });

  it("带上 baseRev 做乐观锁", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rev: 9 }));
    await engineWith(fetchImpl as unknown as typeof fetch).push(stateWith("本地", T0));
    const body = JSON.parse(initOf(fetchImpl).body as string) as Record<string, unknown>;
    expect(body).toHaveProperty("baseRev");
  });

  it("409 冲突时用服务端状态合并后重试，且不会丢掉别人的改动", async () => {
    const local = stateWith("本地", T0);
    const remote = defaultState();
    remote.tasks = [
      { ...createTask({ title: "别人加的" }, T0 + 50), id: "remote-1", updatedAt: T0 + 50 },
    ];
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) return jsonResponse({ rev: 7, state: remote }, 409);
      return jsonResponse({ rev: 8 });
    });
    const engine = engineWith(fetchImpl as unknown as typeof fetch);
    const result = await engine.push(local);
    expect(call).toBe(2);
    expect(result?.remote.tasks.map((entry) => entry.title).sort()).toEqual(["别人加的", "本地"]);
    expect(engine.rev).toBe(8);
  });

  it("持续冲突时放弃重试并上报，不进入死循环", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rev: 1, state: defaultState() }, 409));
    const engine = engineWith(fetchImpl as unknown as typeof fetch);
    await engine.push(stateWith("本地", T0));
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4);
    expect(engine.status).toBe("error");
  });

  it("网络异常时静默离线，绝不抛给 UI", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const engine = engineWith(fetchImpl as unknown as typeof fetch);
    await expect(engine.push(stateWith("本地", T0))).resolves.toBeNull();
    expect(engine.status).toBe("offline");
  });
});
