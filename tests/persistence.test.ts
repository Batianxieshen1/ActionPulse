import { describe, expect, it } from "vitest";
import { STORAGE_KEY, loadState, saveState, type StorageLike } from "../src/store/persistence";
import { defaultState } from "../src/domain/validation";
import { createTask } from "../src/store/taskStore";

function memoryStorage(seed?: string): StorageLike & { dump(): string | null } {
  let value: string | null = seed ?? null;
  return {
    getItem: () => value,
    setItem: (_k, v) => {
      value = v;
    },
    removeItem: () => {
      value = null;
    },
    dump: () => value,
  };
}

describe("loadState", () => {
  it("returns a default state when nothing has been stored yet", () => {
    expect(loadState(memoryStorage())).toEqual(defaultState());
  });

  it("returns a default state instead of throwing on corrupted storage", () => {
    expect(loadState(memoryStorage("{{{ broken"))).toEqual(defaultState());
  });

  it("returns a default state when the payload is the wrong shape", () => {
    expect(loadState(memoryStorage(JSON.stringify({ app: "actionpulse", version: 1, tasks: "nope" })))).toEqual(defaultState());
  });

  it("round-trips through saveState", () => {
    const storage = memoryStorage();
    const state = defaultState();
    state.tasks = [createTask({ title: "持久化任务", importance: "high" }, 1000)];
    state.stats.totalCompleted = 7;
    saveState(storage, state);
    const loaded = loadState(storage);
    expect(loaded.tasks[0].title).toBe("持久化任务");
    expect(loaded.tasks[0].importance).toBe("high");
    expect(loaded.stats.totalCompleted).toBe(7);
  });

  it("writes under a stable, versioned key", () => {
    const storage = memoryStorage();
    saveState(storage, defaultState());
    expect(STORAGE_KEY).toBe("actionpulse.v1");
    expect(storage.dump()).not.toBeNull();
  });

  it("survives a storage backend that throws on read (private mode / disabled cookies)", () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    expect(loadState(hostile)).toEqual(defaultState());
    expect(() => saveState(hostile, defaultState())).not.toThrow();
  });
});

describe("saveState 失败信号（审计 Bug 4）", () => {
  const throwing: StorageLike = {
    getItem: () => null,
    setItem: () => {
      const error = new Error("quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    },
    removeItem: () => undefined,
  };

  it("配额异常不抛出（降级保留），但如实返回失败供上层提示", () => {
    const result = saveState(throwing, defaultState());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as Error).name).toBe("QuotaExceededError");
    }
  });

  it("正常写入返回 ok: true，让「恢复」可以被侦测（解除一次性提示）", () => {
    expect(saveState(memoryStorage(), defaultState()).ok).toBe(true);
  });
});
