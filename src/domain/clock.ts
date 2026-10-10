/**
 * 时间戳推进器。
 * 同步用「每个任务一个 updatedAt」做 Last-Write-Wins，如果同一毫秒内改两次，
 * 时间戳不变就会让合并分不出新旧、甚至把本地改动判成"没有变化"而丢掉。
 * 因此这里保证对同一个任务，新时间戳一定严格大于旧时间戳。
 */
export function nextStamp(previous?: number): number {
  const now = Date.now();
  if (previous === undefined || !Number.isFinite(previous)) return now;
  return Math.max(now, previous + 1);
}
