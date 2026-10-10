import { useEffect, useState } from "react";

/**
 * 一个会缓慢推进的「当前时间」。
 *
 * 休眠判定依赖 now，但如果在渲染里直接调用 Date.now()，useMemo 会永远拿不到稳定的依赖。
 * 这里用低频 tick（默认 60 秒）驱动：既让休眠会自然生效，又不会因为高频重渲染拖慢界面。
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
