import { describe, expect, it } from "vitest";
import { shouldResetOnDurationChange } from "../src/hooks/usePomodoro";
import type { PomodoroStatus } from "../src/hooks/usePomodoro";

/**
 * 审计 Bug 2 的设计固化为断言。
 *
 * 缺陷背景：原实现里「时长同步 effect」的依赖包含 status —— 倒计时归零
 * setStatus("finished") 后，effect 立刻在同一轮把状态改回 idle，
 * finished（"时间到" 文案 / 高亮描边）在真实 UI 上不可见
 * （浏览器实测：250ms 粒度 193 个样本，"时间到" 出现 0 次）。
 *
 * 修复后的契约：重置只由「配置变化 + 非运行态」触发；status 任何自身
 * 变化都不引起重置。本测试锁定这张决策表。
 */
describe("shouldResetOnDurationChange（审计 Bug 2）", () => {
  it("idle / finished：配置变化时同步到新时长", () => {
    expect(shouldResetOnDurationChange("idle")).toBe(true);
    expect(shouldResetOnDurationChange("finished")).toBe(true);
  });

  it("running / paused：配置变化不打断正在进行的专注", () => {
    expect(shouldResetOnDurationChange("running")).toBe(false);
    expect(shouldResetOnDurationChange("paused")).toBe(false);
  });

  it("决策表覆盖全部四种状态（新增状态必须显式表态）", () => {
    const all: PomodoroStatus[] = ["idle", "running", "paused", "finished"];
    expect(all.map((status) => [status, shouldResetOnDurationChange(status)])).toEqual([
      ["idle", true],
      ["running", false],
      ["paused", false],
      ["finished", true],
    ]);
  });
});
