/**
 * 「AI 拆解 + 失败自动回退」的纯逻辑（可单测）。
 * 这是双模设计的核心契约：**AI 永远只是增强，不能成为唯一路径**。
 * 未配置、超时、上游报错、返回格式不可解析 —— 任何一条都必须静默落回离线动词模板，
 * 用户看到的仍然是"点一下就得到 3~5 个可执行步骤"。
 */
import { suggestMicroSteps } from "./microsteps";

export type BreakdownRequest = (title: string, notes: string) => Promise<string[]>;

export interface BreakdownOutcome {
  steps: string[];
  source: "ai" | "template";
  /** source 为 template 且原本想用 AI 时，说明降级原因（用于提示，不用于阻断）。 */
  error?: string;
}

export interface BreakdownOptions {
  title: string;
  notes?: string;
  aiEnabled: boolean;
  request: BreakdownRequest;
}

export async function breakdownWithFallback(options: BreakdownOptions): Promise<BreakdownOutcome> {
  const { title, notes = "", aiEnabled, request } = options;

  if (aiEnabled) {
    try {
      const steps = await request(title, notes);
      const cleaned = steps.map((step) => step.trim()).filter((step) => step.length > 0);
      if (cleaned.length >= 3) {
        return { steps: cleaned.slice(0, 5), source: "ai" };
      }
      return {
        steps: suggestMicroSteps(title),
        source: "template",
        error: `AI 只返回了 ${cleaned.length} 个有效步骤`,
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return { steps: suggestMicroSteps(title), source: "template", error: message };
    }
  }

  return { steps: suggestMicroSteps(title), source: "template" };
}
