import { describe, expect, it } from "vitest";
import { countBetween, easeOutCubic, progressOf } from "../src/hooks/useCountUp";

describe("easeOutCubic", () => {
  it("端点精确：0→0，1→1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it("越接近终点越慢（前半程进度大于后半程）", () => {
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
    expect(easeOutCubic(0.75)).toBeGreaterThan(0.75);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 3);
  });

  it("越界值被夹紧（不产生过冲）", () => {
    expect(easeOutCubic(-0.5)).toBe(0);
    expect(easeOutCubic(1.5)).toBe(1);
  });
});

describe("countBetween", () => {
  it("正向滚动：中点已过半（ease-out 特征）", () => {
    expect(countBetween(0, 100, 0.5)).toBe(88);
  });

  it("反向滚动同样平滑（能量下降不跳变）", () => {
    expect(countBetween(100, 0, 0.5)).toBe(13);
  });

  it("端点不产生偏差", () => {
    expect(countBetween(30, 75, 0)).toBe(30);
    expect(countBetween(30, 75, 1)).toBe(75);
  });
});

describe("progressOf", () => {
  it("按时长线性推进并夹紧", () => {
    expect(progressOf(0, 500, 1000)).toBe(0.5);
    expect(progressOf(0, 2000, 1000)).toBe(1);
    expect(progressOf(0, -100, 1000)).toBe(0);
  });

  it("时长为 0 时直接完成（避免除零）", () => {
    expect(progressOf(0, 100, 0)).toBe(1);
  });
});
