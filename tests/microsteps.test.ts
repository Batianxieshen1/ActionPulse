import { describe, expect, it } from "vitest";
import { suggestMicroSteps } from "../src/domain/microsteps";

describe("suggestMicroSteps", () => {
  it("always returns between 3 and 5 non-empty steps", () => {
    const samples = ["写周报", "回复客户邮件", "整理桌面文件", "开项目评审会", "学习 TypeScript", "修复登录 bug", ""];
    for (const title of samples) {
      const steps = suggestMicroSteps(title);
      expect(steps.length).toBeGreaterThanOrEqual(3);
      expect(steps.length).toBeLessThanOrEqual(5);
      for (const step of steps) {
        expect(typeof step).toBe("string");
        expect(step.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("is deterministic for the same title", () => {
    expect(suggestMicroSteps("写周报")).toEqual(suggestMicroSteps("写周报"));
  });

  it("matches writing tasks with a document-first opening step", () => {
    const steps = suggestMicroSteps("写一份季度汇报");
    expect(steps[0]).toContain("打开");
  });

  it("matches messaging tasks with an inbox-first opening step", () => {
    const steps = suggestMicroSteps("回复客户邮件");
    expect(steps[0]).toContain("打开");
  });

  it("matches tidying tasks with a surface-first opening step", () => {
    const steps = suggestMicroSteps("整理桌面文件");
    expect(steps[0]).toContain("清空");
  });

  it("falls back to a generic but still actionable breakdown", () => {
    const steps = suggestMicroSteps("把那个事情办了");
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.join("")).toContain("完成");
  });

  it("never emits duplicates", () => {
    for (const title of ["写周报", "整理桌面文件", "读书"]) {
      const steps = suggestMicroSteps(title);
      expect(new Set(steps).size).toBe(steps.length);
    }
  });

  it("trims surrounding whitespace from the title match", () => {
    expect(suggestMicroSteps("   写周报   ")).toEqual(suggestMicroSteps("写周报"));
  });
});
