/** 打气语录（PRD §4 模块4）。按情境分组，随机但不重复。双语：随界面语言切换。 */

import { getLanguage } from "../i18n";

const START = {
  zh: [
    "启动成功！势头不可阻挡",
    "最难的是开始，你已经开始了",
    "这一下，阻力就断了",
    "第一块石头搬开了，后面会滑起来",
    "大脑收到信号：这件事已经启动了",
  ],
  en: [
    "Started! The momentum is unstoppable",
    "The hardest part is starting — you just did",
    "That snap — the resistance just broke",
    "First stone moved; the rest will slide",
    "Your brain got the signal: this is underway",
  ],
};

const MOMENTUM = {
  zh: [
    "连着来，别停",
    "这就是状态本身，不是等来的",
    "你在滚雪球，继续保持",
    "节奏起来了，顺着它走",
    "一次比一次轻松，这是真的",
  ],
  en: [
    "Keep going, don't stop",
    "This is what flow is — it isn't waited for",
    "You're rolling a snowball — keep it up",
    "The rhythm is here; ride it",
    "Easier each time — truly",
  ],
};

const COMBO_HOT = {
  zh: ["连击爆炸，今天状态在线", "这波操作干净利落", "势能已经站在你这边", "别刹车，冲"],
  en: ["Combo exploding — you're on today", "That was clean", "Momentum is on your side now", "No brakes — go"],
};

const CLEARED = {
  zh: ["全部清空。今天你赢了", "清单见底，去休息吧", "一件不剩，这就是掌控感"],
  en: ["All clear. You won today", "Bottom of the list — go rest", "Nothing left. That's control"],
};

const RESTART = {
  zh: ["中断没关系，回来就好", "重新开始也是进度的一部分", "不用补偿，做下一件就行"],
  en: ["Interruptions happen — glad you're back", "Restarting is part of progress", "No makeup needed — just do the next one"],
};

function pick(list: readonly string[], seed: number): string {
  return list[Math.abs(Math.floor(seed)) % list.length];
}

function localized(group: { zh: string[]; en: string[] }): string[] {
  return group[getLanguage()];
}

export function startQuote(timestamp: number): string {
  return pick(localized(START), timestamp / 1000);
}

export function momentumQuote(combo: number, timestamp: number): string {
  if (combo >= 4) return pick(localized(COMBO_HOT), timestamp / 1000);
  return pick(localized(MOMENTUM), timestamp / 1000);
}

export function allClearQuote(timestamp: number): string {
  return pick(localized(CLEARED), timestamp / 1000);
}

export function restartQuote(timestamp: number): string {
  return pick(localized(RESTART), timestamp / 1000);
}

/** 台面上那句静置的语录。 */
export function idleQuote(energyPercent: number, streak: number, timestamp: number): string {
  if (streak >= 3) {
    return getLanguage() === "en"
      ? `A ${streak}-day streak — don't let it break today`
      : `已经连续 ${streak} 天了，别让它断在今天`;
  }
  if (energyPercent >= 100) return pick(localized(CLEARED), timestamp / 1000);
  if (energyPercent >= 50) return getLanguage() === "en" ? "Past halfway — lighter than it felt" : "过半了，比刚才轻多了";
  if (energyPercent > 0)
    return getLanguage() === "en" ? "Do the smallest one first — let the body move" : "先做那件最小的，让身体先动起来";
  return pick(localized(START), timestamp / 1000);
}
