import { describe, expect, it } from "vitest";
import { BLIND_BOX_SIZE, pickBlindBox } from "../src/domain/pick";
import { createTask } from "../src/store/taskStore";
import type { Task } from "../src/domain/types";

const T0 = Date.parse("2026-10-08T09:00:00");
const TODAY = "2026-10-08";

function task(patch: Partial<Task> & { title: string }): Task {
  return { ...createTask({ title: patch.title }, T0), ...patch };
}

/** 分数递增的四条任务：high+今天 最强，low+无截止 最弱。 */
const LADDER: Task[] = [
  task({ id: "t1", title: "最强", importance: "high", due: TODAY, estimateMinutes: 5 }),
  task({ id: "t2", title: "次强", importance: "high", due: TODAY, estimateMinutes: 120 }),
  task({ id: "t3", title: "中等", importance: "medium" }),
  task({ id: "t4", title: "最弱", importance: "low" }),
];

describe("pickBlindBox —— 边界", () => {
  it("没有可选任务时返回 null", () => {
    expect(pickBlindBox([], TODAY, () => 0.5)).toBeNull();
  });

  it("已完成与已归档都不参与", () => {
    const tasks = [task({ id: "a", title: "做完了", done: true }), task({ id: "b", title: "归档了", archived: true })];
    expect(pickBlindBox(tasks, TODAY, () => 0.5)).toBeNull();
  });

  it("只有一个候选时必定是它", () => {
    expect(pickBlindBox([task({ id: "only", title: "唯一" })], TODAY, () => 0.99)?.id).toBe("only");
  });
});

describe("pickBlindBox —— 只在 Top N 里掷", () => {
  it("第 4 名永远不会被掷中", () => {
    const picked = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const result = pickBlindBox(LADDER, TODAY, () => i / 200);
      if (result) picked.add(result.id);
    }
    expect(picked.has("t4")).toBe(false);
    expect(picked.size).toBeGreaterThan(1);
  });

  it("候选池大小可配置", () => {
    const only = pickBlindBox(LADDER, TODAY, () => 0.99, 1);
    expect(only?.id).toBe("t1");
  });

  it("默认只取前 3 个", () => {
    expect(BLIND_BOX_SIZE).toBe(3);
  });
});

describe("pickBlindBox —— 按紧迫度加权（不是均匀随机）", () => {
  it("随机值落在第一名的权重区间内时，必定选中第一名", () => {
    // Top1 的紧迫度远高于 Top2，所以它的权重区间占比也大
    const strong = task({ id: "strong", title: "强", importance: "high", due: "2026-10-01", estimateMinutes: 5, createdAt: "2026-09-01T09:00:00" });
    const weak = task({ id: "weak", title: "弱", importance: "low" });
    const tasks = [strong, weak];
    expect(pickBlindBox(tasks, TODAY, () => 0)?.id).toBe("strong");
    // 0.5 仍在第一名权重区间内（它的权重占比远超一半）
    expect(pickBlindBox(tasks, TODAY, () => 0.5)?.id).toBe("strong");
    // 逼近 1 才轮到第二名
    expect(pickBlindBox(tasks, TODAY, () => 0.999)?.id).toBe("weak");
  });

  it("三个候选时，均匀随机会给第一名 1/3；加权之后明显更高", () => {
    const tasks = [
      task({ id: "a", title: "A", importance: "high", due: TODAY, estimateMinutes: 5 }),
      task({ id: "b", title: "B", importance: "medium", estimateMinutes: 120 }),
      task({ id: "c", title: "C", importance: "low", estimateMinutes: 120 }),
    ];
    let hits = 0;
    const samples = 300;
    for (let i = 0; i < samples; i += 1) {
      if (pickBlindBox(tasks, TODAY, () => i / samples)?.id === "a") hits += 1;
    }
    expect(hits / samples).toBeGreaterThan(1 / 3);
  });

  it("全是 0 分任务时不会崩，也不会出现除零", () => {
    const zero = [task({ id: "z1", title: "Z1", importance: "low" }), task({ id: "z2", title: "Z2", importance: "low" })];
    expect(pickBlindBox(zero, TODAY, () => 0.5)).not.toBeNull();
  });
});

describe("pickBlindBox —— 纯函数性质", () => {
  it("同一个随机值永远得到同一个结果", () => {
    const a = pickBlindBox(LADDER, TODAY, () => 0.42);
    const b = pickBlindBox(LADDER, TODAY, () => 0.42);
    expect(a?.id).toBe(b?.id);
  });

  it("不修改传入的数组", () => {
    const snapshot = LADDER.map((t) => t.id);
    pickBlindBox(LADDER, TODAY, () => 0.7);
    expect(LADDER.map((t) => t.id)).toEqual(snapshot);
  });

  it("random 会被调用且结果落在 [0,1) 内即可，不需要额外约束", () => {
    let calls = 0;
    pickBlindBox(LADDER, TODAY, () => {
      calls += 1;
      return 0.5;
    });
    expect(calls).toBe(1);
  });
});
