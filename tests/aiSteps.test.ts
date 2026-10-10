import { describe, expect, it } from "vitest";
import { buildBreakdownMessages, parseBreakdownResponse } from "../src/domain/aiSteps";

describe("buildBreakdownMessages", () => {
  it("产出一条 system + 一条 user 消息", () => {
    const messages = buildBreakdownMessages("写季度汇报", "");
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
  });

  it("把任务标题带进 user 消息", () => {
    expect(buildBreakdownMessages("修复登录 bug", "").at(-1)!.content).toContain("修复登录 bug");
  });

  it("有备注时一并带上作为上下文", () => {
    expect(buildBreakdownMessages("写汇报", "周三前要给老板").at(-1)!.content).toContain("周三前要给老板");
  });

  it("明确要求 JSON 数组，并要求 3~5 步", () => {
    const system = buildBreakdownMessages("x", "").at(0)!.content;
    expect(system).toContain("JSON");
    expect(system).toMatch(/3/);
    expect(system).toMatch(/5/);
  });
});

describe("parseBreakdownResponse", () => {
  it("解析纯 JSON 数组", () => {
    const result = parseBreakdownResponse('["打开文档","写下标题","发送出去"]');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps).toEqual(["打开文档", "写下标题", "发送出去"]);
  });

  it("解析被 markdown 代码块包裹的 JSON（最常出现的形态）", () => {
    const result = parseBreakdownResponse('好的，这是拆解：\n\`\`\`json\n["第一步","第二步","第三步"]\n\`\`\`\n希望有用！');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps).toHaveLength(3);
  });

  it("解析 { steps: [...] } 这种对象包装", () => {
    const result = parseBreakdownResponse('{"steps":["甲","乙","丙"]}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps).toEqual(["甲", "乙", "丙"]);
  });

  it("模型直接吐多行文本时也能兜底解析", () => {
    const result = parseBreakdownResponse("1. 打开文档\n2. 写下标题\n3. 发送出去");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps).toEqual(["打开文档", "写下标题", "发送出去"]);
  });

  it("去掉项目符号与序号", () => {
    const result = parseBreakdownResponse('- 打开文档\n- 写标题\n- 发出去');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0]).toBe("打开文档");
  });

  it("去重并丢弃空白项", () => {
    const result = parseBreakdownResponse('["甲","甲","  ","乙","丙"]');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps).toEqual(["甲", "乙", "丙"]);
  });

  it("超过 5 步时截断到 5 步", () => {
    const result = parseBreakdownResponse(JSON.stringify(["1", "2", "3", "4", "5", "6", "7"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps).toHaveLength(5);
  });

  it("少于 3 步时判为失败，好让调用方回退到离线模板", () => {
    expect(parseBreakdownResponse('["只有一步"]').ok).toBe(false);
    expect(parseBreakdownResponse("[]").ok).toBe(false);
  });

  it("完全无法解析时返回可读错误", () => {
    const result = parseBreakdownResponse("抱歉，我无法完成这个请求。");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("空响应被拒绝", () => {
    expect(parseBreakdownResponse("").ok).toBe(false);
  });

  it("单条过长的步骤被截断，避免撑爆卡片", () => {
    const long = "非常长的一步".repeat(200);
    const result = parseBreakdownResponse(JSON.stringify([long, "乙", "丙"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].length).toBeLessThanOrEqual(120);
  });
});
