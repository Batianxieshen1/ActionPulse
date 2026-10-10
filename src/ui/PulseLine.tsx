import { useEffect, useRef, useState } from "react";

const CYCLE = 100;
const VIEW_HEIGHT = 40;
const MID = VIEW_HEIGHT / 2;

function heartbeatPath(cycles: number): string {
  let d = `M0,${MID}`;
  for (let index = 0; index < cycles; index += 1) {
    const x = index * CYCLE;
    // 一段完整心搏：平线 → 尖峰 → 回弹 → 小峰 → 平线（首尾都在中线，保证无缝循环）
    d +=
      ` L${x + 16},${MID} L${x + 22},${MID}` +
      ` L${x + 26},${MID - 13} L${x + 31},${MID + 13} L${x + 36},${MID - 7} L${x + 41},${MID}` +
      ` L${x + 60},${MID} L${x + 66},${MID}` +
      ` L${x + 70},${MID - 9} L${x + 74},${MID + 9} L${x + 78},${MID}` +
      ` L${x + CYCLE},${MID}`;
  }
  return d;
}

const PATH = heartbeatPath(2);

/**
 * 产品签名元素：持续滚动的脉搏线（对应产品名 ActionPulse）。
 * 每完成一件事就传入新的 beat 值，线条会瞬间变亮并加速一次。
 */
export function PulseLine({ beat, height = 36 }: { beat: number; height?: number }) {
  const [flash, setFlash] = useState(false);
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 820);
    return () => window.clearTimeout(timer);
  }, [beat]);

  return (
    <div className="ap-pulse" data-beat={flash} style={{ height }} aria-hidden="true">
      <div className="ap-pulse__track">
        <svg viewBox={`0 0 ${CYCLE * 2} ${VIEW_HEIGHT}`} preserveAspectRatio="none">
          <path className="ap-pulse__path" d={PATH} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  );
}
