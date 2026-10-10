/**
 * 本地时区日期工具。
 * 关键约定：所有「今天/明天/超期」判断都基于**本地日历日**，而不是 UTC，
 * 否则晚上 8 点之后创建的任务会在第二天就被判为超期。
 */

const DAY_MS = 86_400_000;

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/** toKey - fromKey 的整天数；负数表示 fromKey 更晚（即已超期）。 */
export function daysBetween(fromKey: string, toKey: string): number {
  const from = fromDateKey(fromKey).getTime();
  const to = fromDateKey(toKey).getTime();
  // 用 round 吸收夏令时造成的 23/25 小时偏差。
  return Math.round((to - from) / DAY_MS);
}

export function addDays(key: string, amount: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = fromDateKey(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return toDateKey(parsed) === value;
}

/** 把任意时间戳（ISO 字符串或毫秒数）转成本地日期键，非法输入返回 null。 */
export function dateKeyOf(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return toDateKey(date);
}
