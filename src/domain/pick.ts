/**
 * 🎲 盲盒决策（PRD-v2.1 模块二）。
 *
 * 从当前 Top N 里掷出唯一一个任务，直接把人推进聚焦模式 —— 治的是"在决定先做哪件上
 * 就把意志力耗光"这件事。
 *
 * 两个刻意的设计：
 *
 * 1. **按紧迫度加权，不是均匀随机。**
 *    均匀随机意味着第 1 名的胜率只有 1/3，等于让整套算分算法白算。
 *    加权之后：随机性依然能打破纠结，但算法的影响力还在。
 *
 * 2. **随机数必须注入。** \`Math.random()\` 写进 domain 层就没法确定性单测了。
 *    这与 \`SyncEngine\` 接受 \`now\`、\`pickWinner\` 可注入的做法保持一致。
 */
import { sortByUrgency, urgencyScore } from "./urgency";
import type { Task } from "./types";

export const BLIND_BOX_SIZE = 3;

export function pickBlindBox(
  tasks: readonly Task[],
  today: string,
  random: () => number,
  size: number = BLIND_BOX_SIZE,
): Task | null {
  const pool = tasks.filter((task) => !task.done && !task.archived);
  const candidates = sortByUrgency(pool, today).slice(0, Math.max(1, Math.floor(size)));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // 兜底到 1，保证 0 分任务也有机会（否则全是 0 分时权重和为 0）
  const weights = candidates.map((task) => Math.max(1, urgencyScore(task, today)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  let roll = random() * total;
  for (let index = 0; index < candidates.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return candidates[index];
  }
  // random() 恰好返回 1（理论边界）时落到最后一个
  return candidates[candidates.length - 1];
}
