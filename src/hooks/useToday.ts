import { useEffect, useState } from "react";
import { todayKey } from "../domain/dates";

/**
 * 本地日期键，并在跨天时自动刷新。
 * 紧迫度分与能量槽都依赖「今天」，如果长时间不刷新，午夜之后界面就会继续显示昨天。
 */
export function useToday(): string {
  const [today, setToday] = useState(() => todayKey());

  useEffect(() => {
    const tick = () => {
      const next = todayKey();
      setToday((prev) => (prev === next ? prev : next));
    };
    const id = window.setInterval(tick, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return today;
}
