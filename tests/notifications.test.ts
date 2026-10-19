import { describe, expect, it } from "vitest";
import { shouldFireSystemNotification } from "../src/feedback/notifications";

/**
 * 审计路线图差距 4：只做「后台计时提醒」，坚决不做傍晚唠叨（负罪感机制）。
 * 本测试锁定触发决策表——宁可漏发，不可多发。
 */
describe("shouldFireSystemNotification", () => {
  const base = { enabled: true, visibility: "hidden", permission: "granted" } as const;

  it("开关开 + 页面在后台 + 已授权 → 发", () => {
    expect(shouldFireSystemNotification(base)).toBe(true);
  });

  it("页面可见 → 不发（界面内的音效和 toast 已是更合适的反馈）", () => {
    expect(shouldFireSystemNotification({ ...base, visibility: "visible" })).toBe(false);
  });

  it("权限未授予（default / denied）→ 不发", () => {
    expect(shouldFireSystemNotification({ ...base, permission: "default" })).toBe(false);
    expect(shouldFireSystemNotification({ ...base, permission: "denied" })).toBe(false);
  });

  it("用户关闭开关 → 不发（即便环境完全可用）", () => {
    expect(shouldFireSystemNotification({ ...base, enabled: false })).toBe(false);
  });
});
