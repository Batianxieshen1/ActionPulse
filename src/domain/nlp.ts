/**
 * 自然语言极速输入（PRD-v2.1 模块三）。
 *
 * 纯前端正则分词，零依赖。设计取舍：
 *
 * 1. **估时是开放区间**（\`~(\\d+)(m|h|分钟|小时)\`），不是固定枚举。
 *    固定枚举会让 \`~45m\` 解析失败却静默留在标题里，变成脏数据。
 *
 * 2. **周几一律解析为「下一个该星期几」，包含今天，永不产生过去的日期。**
 *    这条至关重要：如果 \`周一\` 解析成本周已过的周一，任务会立刻变成「已超期」，
 *    紧迫度 D 档直接拿最高分 1.2 冲上榜首 —— 用户用自然语言省事，却被系统惩罚一次。
 *
 * 3. **标记可以紧贴正文**（中文常常不打空格）：\`写周报今天\`、\`写周报~15m\` 都能正确剥离。
 *    但只从**末尾**剥离；夹在中间的 \`写!high周报\` 一律不动，因为无法判断它是否属于标题。
 *
 * 4. **剥完只剩标记时回退成原文**，绝不产出空标题把用户输入吃掉。
 *
 * 5. \`today\` 必须由调用方传入 —— 不读时钟，跨天边界才能确定性单测。
 */
import { addDays, fromDateKey } from "./dates";
import type { Importance } from "./types";

export interface ParsedCapture {
  title: string;
  importance?: Importance;
  due?: string;
  estimateMinutes?: number;
}

const IMPORTANCE_MARKER: Record<string, Importance> = {
  high: "high",
  h: "high",
  med: "medium",
  medium: "medium",
  m: "medium",
  low: "low",
  l: "low",
};

const WEEKDAY_INDEX: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

export const MIN_ESTIMATE_MINUTES = 1;
export const MAX_ESTIMATE_MINUTES = 600;

const IMPORTANCE_TOKEN = /^!([a-z]+)$/i;
const ESTIMATE_TOKEN = /^~(\d+)(分钟|小时|m|h)$/i;
const DATE_TOKEN = /^(今天|明天|后天|周[一二三四五六日天])$/;

const GLUED_DATE = /(今天|明天|后天|周[一二三四五六日天])$/;
const GLUED_ESTIMATE = /~(\d+)(分钟|小时|m|h)$/i;
const GLUED_IMPORTANCE = /!([a-z]+)$/i;

function clampEstimate(value: number): number {
  return Math.min(MAX_ESTIMATE_MINUTES, Math.max(MIN_ESTIMATE_MINUTES, Math.round(value)));
}

function estimateFrom(amount: string, unit: string): number {
  const n = Number(amount);
  const lower = unit.toLowerCase();
  const minutes = lower === "h" || unit === "小时" ? n * 60 : n;
  return clampEstimate(minutes);
}

/** 周几 -> 下一个该星期几（含今天），因此结果永远 >= today。 */
function resolveDateWord(word: string, today: string): string {
  if (word === "今天") return today;
  if (word === "明天") return addDays(today, 1);
  if (word === "后天") return addDays(today, 2);
  const target = WEEKDAY_INDEX[word.slice(1)];
  const current = fromDateKey(today).getDay();
  return addDays(today, (target - current + 7) % 7);
}

interface Glued {
  rest: string;
  due?: string;
  importance?: Importance;
  estimateMinutes?: number;
}

/** 从字符串末尾剥离一个紧贴的标记；剥不动就返回 null。 */
function stripGlued(text: string, today: string): Glued | null {
  const date = text.match(GLUED_DATE);
  if (date) {
    const rest = text.slice(0, date.index);
    if (rest.trim().length > 0) return { rest, due: resolveDateWord(date[1], today) };
  }

  const estimate = text.match(GLUED_ESTIMATE);
  if (estimate) {
    const rest = text.slice(0, estimate.index);
    if (rest.trim().length > 0) return { rest, estimateMinutes: estimateFrom(estimate[1], estimate[2]) };
  }

  const importance = text.match(GLUED_IMPORTANCE);
  if (importance) {
    const mapped = IMPORTANCE_MARKER[importance[1].toLowerCase()];
    const rest = text.slice(0, importance.index);
    if (mapped && rest.trim().length > 0) return { rest, importance: mapped };
  }

  return null;
}

export function parseCapture(input: string, today: string): ParsedCapture {
  const collapsed = input.trim().replace(/\s+/g, " ");
  if (collapsed.length === 0) return { title: "" };

  const parsed: ParsedCapture = { title: "" };
  const titleParts: string[] = [];

  // 第一遍：空白分隔的完整标记
  for (const token of collapsed.split(" ")) {
    const date = token.match(DATE_TOKEN);
    if (date) {
      parsed.due = resolveDateWord(date[1], today);
      continue;
    }
    const estimate = token.match(ESTIMATE_TOKEN);
    if (estimate) {
      parsed.estimateMinutes = estimateFrom(estimate[1], estimate[2]);
      continue;
    }
    const importance = token.match(IMPORTANCE_TOKEN);
    if (importance) {
      const mapped = IMPORTANCE_MARKER[importance[1].toLowerCase()];
      if (mapped) {
        parsed.importance = mapped;
        continue;
      }
    }
    titleParts.push(token);
  }

  // 第二遍：从末尾剥离紧贴正文的标记（中文常不打空格）
  let title = titleParts.join(" ");
  for (let guard = 0; guard < 4; guard += 1) {
    const glued = stripGlued(title, today);
    if (!glued) break;
    if (glued.due !== undefined) parsed.due = glued.due;
    if (glued.importance !== undefined) parsed.importance = glued.importance;
    if (glued.estimateMinutes !== undefined) parsed.estimateMinutes = glued.estimateMinutes;
    title = glued.rest.trim();
  }

  // 兜底：整条都是标记时，宁可把原文当标题，也不产出空标题
  parsed.title = title.length > 0 ? title : collapsed;
  return parsed;
}
