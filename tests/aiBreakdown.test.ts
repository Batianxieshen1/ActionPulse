import { describe, expect, it, vi } from "vitest";
import { breakdownWithFallback } from "../src/domain/aiBreakdown";

describe("breakdownWithFallback — 双模：AI 只是增强，离线模板永远是兜底", () => {
  it("未开启 AI 时直接走离线模板，且不发起任何请求", async () => {
    const request = vi.fn();
    const result = await breakdownWithFallback({ title: "写周报", aiEnabled: false, request });
    expect(result.source).toBe("template");
    expect(result.steps.length).toBeGreaterThanOrEqual(3);
    expect(request).not.toHaveBeenCalled();
  });

  it("AI 成功时采用 AI 的结果", async () => {
    const request = vi.fn(async () => ["打开文档", "写标题", "发出去"]);
    const result = await breakdownWithFallback({ title: "写周报", aiEnabled: true, request });
    expect(result.source).toBe("ai");
    expect(result.steps).toEqual(["打开文档", "写标题", "发出去"]);
    expect(result.error).toBeUndefined();
  });

  it("把备注一并传给 AI 作为上下文", async () => {
    const request = vi.fn(async () => ["a", "b", "c"]);
    await breakdownWithFallback({ title: "写周报", notes: "周三要给老板", aiEnabled: true, request });
    expect(request).toHaveBeenCalledWith("写周报", "周三要给老板");
  });

  it("AI 报错时静默回退到模板，并带上降级原因", async () => {
    const request = vi.fn(async () => {
      throw new Error("调用大模型超时");
    });
    const result = await breakdownWithFallback({ title: "写周报", aiEnabled: true, request });
    expect(result.source).toBe("template");
    expect(result.steps.length).toBeGreaterThanOrEqual(3);
    expect(result.error).toBe("调用大模型超时");
  });

  it("AI 返回的步骤太少时也回退，不让用户拿到残缺的拆解", async () => {
    const request = vi.fn(async () => ["只有一步"]);
    const result = await breakdownWithFallback({ title: "写周报", aiEnabled: true, request });
    expect(result.source).toBe("template");
    expect(result.error).toContain("1");
  });

  it("AI 返回空白步骤会被过滤掉", async () => {
    const request = vi.fn(async () => ["  打开文档  ", "", "  ", "写标题", "发出去"]);
    const result = await breakdownWithFallback({ title: "写周报", aiEnabled: true, request });
    expect(result.source).toBe("ai");
    expect(result.steps).toEqual(["打开文档", "写标题", "发出去"]);
  });

  it("AI 返回超过 5 步时截断", async () => {
    const request = vi.fn(async () => ["1", "2", "3", "4", "5", "6", "7"]);
    const result = await breakdownWithFallback({ title: "写周报", aiEnabled: true, request });
    expect(result.steps).toHaveLength(5);
  });

  it("任何情况下都不会抛出给调用方", async () => {
    const request = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(breakdownWithFallback({ title: "x", aiEnabled: true, request })).resolves.toBeDefined();
  });
});
