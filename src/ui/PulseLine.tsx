import { useEffect, useMemo, useRef, useState } from "react";

const CYCLE = 100;
const VIEW_HEIGHT = 40;
const MID = VIEW_HEIGHT / 2;

/** amp：振幅系数。1 = 标准心搏；streak 越长线条越有生命力（Wave 2 / L2）。 */
function heartbeatPath(cycles: number, amp: number): string {
  const spike1 = 13 * amp;
  const spike2 = 9 * amp;
  const mid1 = 7 * amp;
  let d = `M0,${MID}`;
  for (let index = 0; index < cycles; index += 1) {
    const x = index * CYCLE;
    // 一段完整心搏：平线 → 尖峰 → 回弹 → 小峰 → 平线（首尾都在中线，保证无缝循环）
    d +=
      ` L${x + 16},${MID} L${x + 22},${MID}` +
      ` L${x + 26},${MID - spike1} L${x + 31},${MID + spike1} L${x + 36},${MID - mid1} L${x + 41},${MID}` +
      ` L${x + 60},${MID} L${x + 66},${MID}` +
      ` L${x + 70},${MID - spike2} L${x + 74},${MID + spike2} L${x + 78},${MID}` +
      ` L${x + CYCLE},${MID}`;
  }
  return d;
}

/**
 * 产品签名元素：持续滚动的脉搏线（对应产品名 ActionPulse）。
 * 每完成一件事就传入新的 beat 值，线条会瞬间变亮并加速一次。
 * amplitude：随连续天数缓慢增长（封顶 1.6）——成长被画进产品的签名里。
 */
export function PulseLine({
  beat,
  height = 36,
  amplitude = 1,
}: {
  beat: number;
  height?: number;
  amplitude?: number;
}) {
  const [flash, setFlash] = useState(false);
  const firstRun = useRef(true);
  const path = useMemo(() => heartbeatPath(2, amplitude), [amplitude]);

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
          <path className="ap-pulse__path" d={path} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  );
}
