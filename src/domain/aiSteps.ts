/**
 * AI 语义微步拆解（可选能力）的提示词与响应解析。
 * 解析必须极其宽容：模型会返回 markdown 代码块、加解释、带序号，甚至直接吐纯文本。
 * 只要拿不到至少 3 条可用步骤，就判为失败，让调用方回退到离线动词模板。
 */
import { suggestMicroSteps } from "./microsteps";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export const MIN_STEPS = 3;
export const MAX_STEPS = 5;
const MAX_STEP_LENGTH = 120;

const SYSTEM_PROMPT = `你是「微步拆解」助手。用户会因为没有头绪而拖延，你的唯一目标是把任务切成 3~5 个 5 分钟内就能开始做的具体动作。

规则：
1. 只输出一个 JSON 数组，不要任何解释、不要 markdown 代码块。
2. 数组含 3~5 个字符串，每个是一条中文动作，必须以动词开头。
3. 第一步必须是「打开 / 拿出 / 找到」这类 30 秒内能完成的物理动作。
4. 不要出现「规划」「思考」「评估」「梳理思路」这类无法立刻执行的动作。
5. 每条不超过 30 个字，不要复述任务名称。

示例：
输入：写季度汇报
输出：["打开文档，新建一页空白页","写下标题和三个要点","把每个要点扩成一句话","通读一遍改掉错别字","导出并发送给老板"]`;

export function buildBreakdownMessages(title: string, notes: string): ChatMessage[] {
  const trimmedNotes = notes.trim();
  const user = trimmedNotes.length > 0 ? `任务：${title}\n补充信息：${trimmedNotes}` : `任务：${title}`;
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}

export type BreakdownParseResult = { ok: true; steps: string[] } | { ok: false; error: string };

function stripBullet(line: string): string {
  return line
    .replace(/^\s*[-*•·]\s*/, "")
    .replace(/^\s*\d+\s*[.、)）:：]\s*/, "")
    .replace(/^\s*["'「『]/, "")
    .replace(/["'」』]\s*$/, "")
    .trim();
}

function normalise(candidates: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const steps: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    let text = stripBullet(candidate);
    if (text.length === 0) continue;
    if (text.length > MAX_STEP_LENGTH) text = `${text.slice(0, MAX_STEP_LENGTH - 1)}…`;
    if (seen.has(text)) continue;
    seen.add(text);
    steps.push(text);
    if (steps.length >= MAX_STEPS) break;
  }
  return steps;
}

function extractCandidates(text: string): unknown[] | null {
  const attempts: string[] = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.push(fenced[1]);

  const bracketed = text.match(/\[[\s\S]*\]/);
  if (bracketed) attempts.push(bracketed[0]);

  const braced = text.match(/\{[\s\S]*\}/);
  if (braced) attempts.push(braced[0]);

  for (const attempt of attempts) {
    try {
      const parsed: unknown = JSON.parse(attempt.trim());
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === "object" && parsed !== null) {
        const steps = (parsed as Record<string, unknown>).steps;
        if (Array.isArray(steps)) return steps;
      }
    } catch {
      // 换下一种尝试
    }
  }
  return null;
}

export function parseBreakdownResponse(text: string): BreakdownParseResult {
  const raw = typeof text === "string" ? text.trim() : "";
  if (raw.length === 0) return { ok: false, error: "模型返回了空响应" };

  const extracted = extractCandidates(raw);
  const candidates: unknown[] = extracted ?? raw.split(/\r?\n/);
  const steps = normalise(candidates);

  if (steps.length < MIN_STEPS) {
    return {
      ok: false,
      error: `只解析出 ${steps.length} 个可用步骤（至少需要 ${MIN_STEPS} 个），将回退到离线模板`,
    };
  }
  return { ok: true, steps };
}

/** 兜底：解析失败或未配置 AI 时，一律退回离线动词模板，保证功能永远可用。 */
export function fallbackSteps(title: string): string[] {
  return suggestMicroSteps(title);
}
