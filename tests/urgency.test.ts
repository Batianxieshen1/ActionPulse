import { describe, expect, it } from "vitest";
import {
  COMPONENT_MAX,
  MAX_RAW,
  WEIGHTS,
  ageFactor,
  dueFactor,
  quickFactor,
  rawScore,
  selectFocusTask,
  sortByUrgency,
  urgencyComponents,
  urgencyScore,
  urgencyTier,
} from "../src/domain/urgency";
import type { Task } from "../src/domain/types";

const TODAY = "2026-10-08";

function makeTask(patch: Partial<Task> = {}): Task {
  return {
    id: patch.id ?? "t1",
    title: patch.title ?? "任务",
    notes: "",
    importance: patch.importance ?? "medium",
    due: patch.due === undefined ? null : patch.due,
    estimateMinutes: patch.estimateMinutes === undefined ? null : patch.estimateMinutes,
    quadrant: patch.quadrant ?? null,
    manualRank: patch.manualRank ?? 0,
    subtasks: patch.subtasks ?? [],
    done: patch.done ?? false,
    createdAt: patch.createdAt ?? "2026-10-08T09:00:00",
    updatedAt: patch.updatedAt ?? Date.parse(patch.createdAt ?? "2026-10-08T09:00:00"),
    completedAt: patch.completedAt ?? null,
    archived: patch.archived ?? false,
  };
}

describe("weights follow the frozen spec (W_imp=35, W_due=40, W_quick=15, W_age=10)", () => {
  it("exposes the documented weights", () => {
    expect(WEIGHTS).toEqual({ imp: 35, due: 40, quick: 15, age: 10 });
  });

  it("derives the theoretical maximum raw score from the maximum factors", () => {
    expect(MAX_RAW).toBe(108);
  });
});

describe("dueFactor", () => {
  it("scores overdue highest (1.2)", () => {
    expect(dueFactor("2026-10-07", TODAY)).toBe(1.2);
    expect(dueFactor("2026-09-01", TODAY)).toBe(1.2);
  });
  it("scores due-today as 1.0", () => {
    expect(dueFactor("2026-10-08", TODAY)).toBe(1.0);
  });
  it("scores due-tomorrow as 0.7", () => {
    expect(dueFactor("2026-10-09", TODAY)).toBe(0.7);
  });
  it("scores within three days as 0.4", () => {
    expect(dueFactor("2026-10-10", TODAY)).toBe(0.4);
    expect(dueFactor("2026-10-11", TODAY)).toBe(0.4);
  });
  it("collapses far-future and no-deadline to the same floor (0.1)", () => {
    expect(dueFactor("2026-10-12", TODAY)).toBe(0.1);
    expect(dueFactor("2027-01-01", TODAY)).toBe(0.1);
    expect(dueFactor(null, TODAY)).toBe(0.1);
  });
});

describe("quickFactor", () => {
  it("rewards tasks that fit in 15 minutes", () => {
    expect(quickFactor(1)).toBe(1.0);
    expect(quickFactor(15)).toBe(1.0);
  });
  it("scores 15-60 minutes as 0.5", () => {
    expect(quickFactor(16)).toBe(0.5);
    expect(quickFactor(60)).toBe(0.5);
  });
  it("scores over an hour as 0.2", () => {
    expect(quickFactor(61)).toBe(0.2);
    expect(quickFactor(600)).toBe(0.2);
  });
  it("treats an unestimated task as the slowest bucket so it cannot game the score", () => {
    expect(quickFactor(null)).toBe(0.2);
  });
});

describe("ageFactor", () => {
  it("is zero on the day it was created", () => {
    expect(ageFactor("2026-10-08T09:00:00", TODAY)).toBe(0);
  });
  it("grows linearly across a week", () => {
    expect(ageFactor("2026-10-05T09:00:00", TODAY)).toBeCloseTo(3 / 7, 6);
  });
  it("caps at 1.0 after a week", () => {
    expect(ageFactor("2026-10-01T09:00:00", TODAY)).toBe(1);
    expect(ageFactor("2026-08-01T09:00:00", TODAY)).toBe(1);
  });
  it("never goes negative for clock skew", () => {
    expect(ageFactor("2026-10-20T09:00:00", TODAY)).toBe(0);
  });
});

describe("urgencyScore", () => {
  it("normalises the raw score onto 0-100", () => {
    // high(35) + no-due(4) + quick(15) + fresh(0) = 54 -> 54/108 = 50
    const task = makeTask({ importance: "high", due: null, estimateMinutes: 10, createdAt: "2026-10-08T09:00:00" });
    expect(rawScore(task, TODAY)).toBeCloseTo(54, 6);
    expect(urgencyScore(task, TODAY)).toBe(50);
  });

  it("pins the most urgent possible task at exactly 100", () => {
    const task = makeTask({
      importance: "high",
      due: "2026-10-01",
      estimateMinutes: 5,
      createdAt: "2026-09-01T09:00:00",
    });
    expect(rawScore(task, TODAY)).toBe(MAX_RAW);
    expect(urgencyScore(task, TODAY)).toBe(100);
  });

  it("never exceeds 100 even if a factor is out of range", () => {
    const task = makeTask({ importance: "high", due: "2020-01-01", estimateMinutes: 5, createdAt: "2000-01-01T00:00:00" });
    expect(urgencyScore(task, TODAY)).toBeLessThanOrEqual(100);
  });

  it("produces the documented low-effort case", () => {
    // low(7) + no-due(4) + slow(3) + fresh(0) = 14 -> round(12.96) = 13
    const task = makeTask({ importance: "low", due: null, estimateMinutes: 90, createdAt: "2026-10-08T09:00:00" });
    expect(urgencyScore(task, TODAY)).toBe(13);
  });

  it("returns an integer between 0 and 100 for every factor combination", () => {
    const importances = ["high", "medium", "low"] as const;
    const dues = [null, "2026-10-01", "2026-10-08", "2026-10-09", "2026-10-11", "2026-12-31"];
    const estimates = [null, 5, 30, 90];
    for (const importance of importances) {
      for (const due of dues) {
        for (const estimateMinutes of estimates) {
          const score = urgencyScore(makeTask({ importance, due, estimateMinutes }), TODAY);
          expect(Number.isInteger(score)).toBe(true);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});

describe("urgencyTier", () => {
  it("maps scores onto the four colour bands", () => {
    expect(urgencyTier(100)).toBe("critical");
    expect(urgencyTier(75)).toBe("critical");
    expect(urgencyTier(74)).toBe("high");
    expect(urgencyTier(55)).toBe("high");
    expect(urgencyTier(54)).toBe("medium");
    expect(urgencyTier(35)).toBe("medium");
    expect(urgencyTier(34)).toBe("low");
    expect(urgencyTier(0)).toBe("low");
  });
});

describe("sortByUrgency", () => {
  it("puts the highest score first", () => {
    const urgent = makeTask({ id: "urgent", importance: "high", due: TODAY, estimateMinutes: 5 });
    const chill = makeTask({ id: "chill", importance: "low", due: null, estimateMinutes: 120 });
    const sorted = sortByUrgency([chill, urgent], TODAY);
    expect(sorted.map((t) => t.id)).toEqual(["urgent", "chill"]);
  });

  it("breaks ties by creation time (oldest first) then by id, deterministically", () => {
    const a = makeTask({ id: "b", importance: "medium", createdAt: "2026-10-08T09:00:00" });
    const b = makeTask({ id: "a", importance: "medium", createdAt: "2026-10-08T09:00:00" });
    const c = makeTask({ id: "c", importance: "medium", createdAt: "2026-10-07T09:00:00" });
    const sorted = sortByUrgency([a, b, c], TODAY);
    expect(sorted.map((t) => t.id)).toEqual(["c", "a", "b"]);
  });

  it("does not mutate the input array", () => {
    const list = [makeTask({ id: "x" }), makeTask({ id: "y", importance: "high", due: TODAY })];
    const before = list.map((t) => t.id);
    sortByUrgency(list, TODAY);
    expect(list.map((t) => t.id)).toEqual(before);
  });
});

describe("selectFocusTask", () => {
  it("returns the top-ranked unfinished task", () => {
    const done = makeTask({ id: "done", importance: "high", due: TODAY, done: true });
    const next = makeTask({ id: "next", importance: "medium", due: TODAY });
    expect(selectFocusTask([done, next], TODAY)?.id).toBe("next");
  });

  it("ignores archived tasks", () => {
    const archived = makeTask({ id: "arch", importance: "high", due: TODAY, archived: true });
    const live = makeTask({ id: "live", importance: "low" });
    expect(selectFocusTask([archived, live], TODAY)?.id).toBe("live");
  });

  it("returns null when nothing is left", () => {
    expect(selectFocusTask([], TODAY)).toBeNull();
    expect(selectFocusTask([makeTask({ done: true })], TODAY)).toBeNull();
  });
});

describe("urgencyComponents（卡片「为什么是这个分数」分解）", () => {
  it("四个分项之和等于 rawScore", () => {
    const task = makeTask({
      importance: "high",
      due: "2026-10-07",
      estimateMinutes: 10,
      createdAt: "2026-09-25T09:00:00",
    });
    const parts = urgencyComponents(task, TODAY);
    expect(parts.imp + parts.due + parts.quick + parts.age).toBe(rawScore(task, TODAY));
  });

  it("已知任务的每个分项与手算一致（高优+超期+15分钟内+搁置满一周 = 满分 108）", () => {
    const task = makeTask({
      importance: "high",
      due: "2026-10-07",
      estimateMinutes: 10,
      createdAt: "2026-09-25T09:00:00",
    });
    expect(urgencyComponents(task, TODAY)).toEqual({ imp: 35, due: 48, quick: 15, age: 10, total: 108 });
  });

  it("分项满分常量 = 权重 × 各因子最高档", () => {
    expect(COMPONENT_MAX).toEqual({ imp: 35, due: 48, quick: 15, age: 10 });
  });
});
