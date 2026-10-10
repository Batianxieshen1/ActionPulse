import { describe, expect, it } from "vitest";
import { TOMBSTONE_RETENTION_MS, mergeStates, sameState } from "../src/domain/merge";
import { defaultState } from "../src/domain/validation";
import { createTask } from "../src/store/taskStore";
import type { AppState, Task } from "../src/domain/types";

const T0 = Date.parse("2026-10-08T10:00:00.000Z");

function task(patch: Partial<Task> & { id: string }): Task {
  const base = createTask({ title: patch.title ?? "任务" }, T0);
  return { ...base, ...patch, id: patch.id };
}

function state(patch: Partial<AppState> = {}): AppState {
  return { ...defaultState(), ...patch };
}

describe("mergeStates — 任务以 updatedAt 做 Last-Write-Wins", () => {
  it("远端更新时采用远端", () => {
    const local = state({ tasks: [task({ id: "a", title: "旧标题", updatedAt: T0 })] });
    const remote = state({ tasks: [task({ id: "a", title: "新标题", updatedAt: T0 + 1000 })] });
    const merged = mergeStates(local, remote);
    expect(merged.state.tasks).toHaveLength(1);
    expect(merged.state.tasks[0].title).toBe("新标题");
    expect(merged.changed).toBe(true);
  });

  it("本地更新时保留本地（不会被远端旧数据回滚）", () => {
    const local = state({ tasks: [task({ id: "a", title: "本地新", updatedAt: T0 + 5000 })] });
    const remote = state({ tasks: [task({ id: "a", title: "远端旧", updatedAt: T0 })] });
    const merged = mergeStates(local, remote);
    expect(merged.state.tasks[0].title).toBe("本地新");
    expect(merged.changed).toBe(false);
  });

  it("双方各自独有的任务都会保留（取并集）", () => {
    const local = state({ tasks: [task({ id: "a", updatedAt: T0 })] });
    const remote = state({ tasks: [task({ id: "b", updatedAt: T0 })] });
    const merged = mergeStates(local, remote);
    expect(merged.state.tasks.map((entry) => entry.id).sort()).toEqual(["a", "b"]);
    expect(merged.changed).toBe(true);
  });

  it("updatedAt 相同时用内容做确定性兜底，保证两端收敛到同一结果", () => {
    const a = state({ tasks: [task({ id: "x", title: "AAA", updatedAt: T0 })] });
    const b = state({ tasks: [task({ id: "x", title: "ZZZ", updatedAt: T0 })] });
    expect(mergeStates(a, b).state.tasks[0].title).toBe(mergeStates(b, a).state.tasks[0].title);
  });
});

describe("mergeStates — 墓碑（删除不该复活）", () => {
  it("本地删除后，远端旧副本不能复活它", () => {
    const local = state({ tasks: [], tombstones: { a: T0 + 2000 } });
    const remote = state({ tasks: [task({ id: "a", title: "已经删掉的", updatedAt: T0 })] });
    const merged = mergeStates(local, remote, T0 + 3000);
    expect(merged.state.tasks).toHaveLength(0);
    expect(merged.state.tombstones.a).toBe(T0 + 2000);
  });

  it("远端删除后，本地旧副本同样被清掉", () => {
    const local = state({ tasks: [task({ id: "a", updatedAt: T0 })] });
    const remote = state({ tasks: [], tombstones: { a: T0 + 2000 } });
    const merged = mergeStates(local, remote, T0 + 3000);
    expect(merged.state.tasks).toHaveLength(0);
    expect(merged.changed).toBe(true);
  });

  it("墓碑比任务更旧时，任务（后来被重新编辑过）保留", () => {
    const local = state({ tasks: [task({ id: "a", updatedAt: T0 + 5000 })] });
    const remote = state({ tombstones: { a: T0 } });
    expect(mergeStates(local, remote, T0 + 6000).state.tasks).toHaveLength(1);
  });

  it("两侧墓碑取较新的时间戳", () => {
    const merged = mergeStates(state({ tombstones: { a: T0 + 900 } }), state({ tombstones: { a: T0 + 100 } }), T0 + 1000);
    expect(merged.state.tombstones.a).toBe(T0 + 900);
  });

  it("超过保留期的墓碑会被清理，不会无限增长", () => {
    const now = T0 + TOMBSTONE_RETENTION_MS * 3;
    const merged = mergeStates(state({ tombstones: { old: T0 } }), state(), now);
    expect(merged.state.tombstones).toEqual({});
  });

  it("保留期内的墓碑不会被清理", () => {
    const now = T0 + 1000;
    const merged = mergeStates(state({ tombstones: { fresh: T0 } }), state(), now);
    expect(merged.state.tombstones.fresh).toBe(T0);
  });
});

describe("mergeStates — 统计与设置", () => {
  it("累计完成数取较大值（避免两台设备各加一次被覆盖）", () => {
    const local = state();
    local.stats.totalCompleted = 7;
    const remote = state();
    remote.stats.totalCompleted = 12;
    expect(mergeStates(local, remote).state.stats.totalCompleted).toBe(12);
  });

  it("完成日期取并集并去重排序", () => {
    const local = state();
    local.stats.completionDates = ["2026-10-08", "2026-10-07"];
    const remote = state();
    remote.stats.completionDates = ["2026-10-07", "2026-10-06"];
    expect(mergeStates(local, remote).state.stats.completionDates).toEqual([
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
    ]);
  });

  it("连击取最近一次完成的那一侧（设备 A 刚打完卡，不该被设备 B 的旧连击冲掉）", () => {
    const local = state();
    local.stats.combo = 5;
    local.stats.lastCompletionAt = T0 + 5000;
    const remote = state();
    remote.stats.combo = 2;
    remote.stats.lastCompletionAt = T0;
    expect(mergeStates(local, remote).state.stats.combo).toBe(5);
    expect(mergeStates(remote, local).state.stats.combo).toBe(5);
  });

  it("最高连击取较大值", () => {
    const local = state();
    local.stats.bestCombo = 3;
    const remote = state();
    remote.stats.bestCombo = 9;
    expect(mergeStates(local, remote).state.stats.bestCombo).toBe(9);
  });

  it("设置保持设备本地，不同步（手机关静音不该把电脑也静音）", () => {
    const local = state();
    local.settings.soundEnabled = false;
    const remote = state();
    remote.settings.soundEnabled = true;
    expect(mergeStates(local, remote).state.settings.soundEnabled).toBe(false);
    expect(mergeStates(remote, local).state.settings.soundEnabled).toBe(true);
  });

  it("合并结果始终停留在当前 schema 版本", () => {
    const merged = mergeStates(state(), state());
    expect(merged.state.version).toBe(3);
  });
});

describe("mergeStates — 代数性质（同步收敛的前提）", () => {
  const a = state({ tasks: [task({ id: "1", updatedAt: T0 + 10 }), task({ id: "2", updatedAt: T0 })], tombstones: { "9": T0 } });
  const b = state({ tasks: [task({ id: "2", title: "b2", updatedAt: T0 + 99 })], tombstones: { "8": T0 + 5 } });

  it("幂等：再合并一次自己不会产生变化", () => {
    const once = mergeStates(a, b).state;
    const twice = mergeStates(once, b);
    expect(twice.changed).toBe(false);
    expect(sameState(twice.state, once)).toBe(true);
  });

  it("交换律：两端独立合并得到同样的任务集", () => {
    const ab = mergeStates(a, b).state;
    const ba = mergeStates(b, a).state;
    expect(sameState(ab, ba)).toBe(true);
  });

  it("合并自身不产生变化", () => {
    expect(mergeStates(a, a).changed).toBe(false);
  });
});

describe("mergeStates — 习惯（G-Set 并集）与日指标", () => {
  const habitOf = (id: string, dates: string[], updatedAt: number) => ({
    id,
    title: "喝水",
    emoji: "⚡",
    completedDates: dates,
    archived: false,
    createdAt: T0,
    updatedAt,
  });

  it("两端各打各的勾，合并后都保留", () => {
    const local = state({ habits: [habitOf("h1", ["2026-10-08"], T0)] });
    const remote = state({ habits: [habitOf("h1", ["2026-10-09"], T0 + 100)] });
    expect(mergeStates(local, remote).state.habits[0].completedDates).toEqual(["2026-10-08", "2026-10-09"]);
  });

  it("【关键】习惯的打勾改动必须被判定为「变了」，否则界面不会重渲染", () => {
    const local = state({ habits: [habitOf("h1", [], T0)] });
    const remote = state({ habits: [habitOf("h1", ["2026-10-08"], T0 + 1)] });
    expect(mergeStates(local, remote).changed).toBe(true);
  });

  it("习惯合并在同一侧重复执行是幂等的", () => {
    const local = state({ habits: [habitOf("h1", ["2026-10-08"], T0)] });
    const remote = state({ habits: [habitOf("h1", ["2026-10-09"], T0 + 5)] });
    const once = mergeStates(local, remote).state;
    expect(mergeStates(once, remote).changed).toBe(false);
  });

  it("专注时长按天取最大值，重复同步不会翻倍", () => {
    const local = state();
    local.daily.focusMinutes = { "2026-10-08": 25 };
    const remote = state();
    remote.daily.focusMinutes = { "2026-10-08": 40 };
    const merged = mergeStates(local, remote).state;
    expect(merged.daily.focusMinutes["2026-10-08"]).toBe(40);
    // 再合并一次仍然不变（幂等）
    expect(mergeStates(merged, remote).state.daily.focusMinutes["2026-10-08"]).toBe(40);
  });

  it("连击峰值按天取最大值", () => {
    const local = state();
    local.daily.comboPeak = { "2026-10-08": 3 };
    const remote = state();
    remote.daily.comboPeak = { "2026-10-08": 7 };
    expect(mergeStates(local, remote).state.daily.comboPeak["2026-10-08"]).toBe(7);
  });

  it("日指标变化也能被 sameState 捕捉到", () => {
    const local = state();
    const remote = state();
    remote.daily.focusMinutes = { "2026-10-08": 25 };
    expect(mergeStates(local, remote).changed).toBe(true);
  });

  it("v2 的老备份（没有 habits/daily）不会破坏合并", () => {
    const local = state({ habits: [habitOf("h1", ["2026-10-08"], T0)] });
    local.daily.focusMinutes = { "2026-10-08": 25 };
    const merged = mergeStates(local, { version: 2, tasks: [], settings: {}, stats: {}, tombstones: {} });
    expect(merged.changed).toBe(false);
    expect(merged.state.habits).toHaveLength(1);
    expect(merged.state.daily.focusMinutes["2026-10-08"]).toBe(25);
  });
});

describe("mergeStates — 健壮性", () => {
  it("远端数据是垃圾时，本地状态原样保留", () => {
    const local = state({ tasks: [task({ id: "a", updatedAt: T0 })] });
    const merged = mergeStates(local, { nope: true });
    expect(merged.changed).toBe(false);
    expect(merged.state.tasks).toHaveLength(1);
  });

  it("会先对远端做清洗（补 updatedAt、丢弃坏任务）", () => {
    const local = state();
    const remote = { tasks: [{ id: "z", title: "只有标题" }, { title: "" }] };
    const merged = mergeStates(local, remote);
    expect(merged.state.tasks).toHaveLength(1);
    expect(Number.isFinite(merged.state.tasks[0].updatedAt)).toBe(true);
  });

  it("不修改传入的两个状态对象", () => {
    const local = state({ tasks: [task({ id: "a", updatedAt: T0 })] });
    const remote = state({ tasks: [task({ id: "a", title: "远程", updatedAt: T0 + 50 })] });
    const localSnapshot = JSON.stringify(local);
    const remoteSnapshot = JSON.stringify(remote);
    mergeStates(local, remote);
    expect(JSON.stringify(local)).toBe(localSnapshot);
    expect(JSON.stringify(remote)).toBe(remoteSnapshot);
  });
});
