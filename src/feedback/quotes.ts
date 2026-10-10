/** 打气语录（PRD §4 模块4）。按情境分组，随机但不重复。 */

const START = [
  "启动成功！势头不可阻挡",
  "最难的是开始，你已经开始了",
  "这一下，阻力就断了",
  "第一块石头搬开了，后面会滑起来",
  "大脑收到信号：这件事已经启动了",
];

const MOMENTUM = [
  "连着来，别停",
  "这就是状态本身，不是等来的",
  "你在滚雪球，继续保持",
  "节奏起来了，顺着它走",
  "一次比一次轻松，这是真的",
];

const COMBO_HOT = [
  "连击爆炸，今天状态在线",
  "这波操作干净利落",
  "势能已经站在你这边",
  "别刹车，冲",
];

const CLEARED = [
  "全部清空。今天你赢了",
  "清单见底，去休息吧",
  "一件不剩，这就是掌控感",
];

const RESTART = [
  "中断没关系，回来就好",
  "重新开始也是进度的一部分",
  "不用补偿，做下一件就行",
];

function pick(list: readonly string[], seed: number): string {
  return list[Math.abs(Math.floor(seed)) % list.length];
}

export function startQuote(timestamp: number): string {
  return pick(START, timestamp / 1000);
}

export function momentumQuote(combo: number, timestamp: number): string {
  if (combo >= 4) return pick(COMBO_HOT, timestamp / 1000);
  return pick(MOMENTUM, timestamp / 1000);
}

export function allClearQuote(timestamp: number): string {
  return pick(CLEARED, timestamp / 1000);
}

export function restartQuote(timestamp: number): string {
  return pick(RESTART, timestamp / 1000);
}

/** 台面上那句静置的语录。 */
export function idleQuote(energyPercent: number, streak: number, timestamp: number): string {
  if (streak >= 3) return `已经连续 ${streak} 天了，别让它断在今天`;
  if (energyPercent >= 100) return pick(CLEARED, timestamp / 1000);
  if (energyPercent >= 50) return "过半了，比刚才轻多了";
  if (energyPercent > 0) return "先做那件最小的，让身体先动起来";
  return pick(START, timestamp / 1000);
}
