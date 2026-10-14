import { useEffect, useState } from "react";
import { ArrowRight, Check, Moon, Target } from "lucide-react";
import { daysBetween } from "../domain/dates";
import type { Task } from "../domain/types";
import { urgencyScore } from "../domain/urgency";
import { idleQuote } from "../feedback/quotes";
import { PulseLine } from "./PulseLine";
import { UrgencyBadge } from "./UrgencyBadge";

interface Props {
  focus: Task | null;
  upcoming: Task[];
  today: string;
  beat: number;
  energy: { done: number; total: number; percent: number };
  streak: number;
  combo: number;
  totalCompleted: number;
  onEnterFocus: () => void;
  /** 「紧随其后」点某一条直接聚焦它 —— 复用盲盒的 pinnedTaskId 机制。 */
  onFocusTask: (taskId: string) => void;
  onToggle: (task: Task, origin?: { x: number; y: number }) => void;
}

/** 语录轮换间隔。9 秒：足够读完一条，又不至于让人等第二条。 */
const QUOTE_INTERVAL_MS = 9000;

/**
 * 桌面端台面：把「现在只做这件事」放大到整块屏幕，而不是让右侧留一片空洞。
 * 窗口缩到 768px 以下时会自动隐藏，只剩左侧面板（窄布局由 MiniStage 接管）。
 */
export function IdleStage({
  focus,
  upcoming,
  today,
  beat,
  energy,
  streak,
  combo,
  totalCompleted,
  onEnterFocus,
  onFocusTask,
  onToggle,
}: Props) {
  // 语录轮换：idleQuote 以时间戳选句，这里定时重渲染让它真正转起来；
  // reduce-motion 下 ap-quote-swap 动画被压平，但换句本身仍是内容更新，保留。
  const [quoteSeed, setQuoteSeed] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setQuoteSeed((value) => value + 1), QUOTE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);
  const quote = idleQuote(energy.percent, streak, Date.now() + quoteSeed * 1000);

  const ring = 168;
  const radius = ring / 2 - 8;
  const circumference = 2 * Math.PI * radius;

  const stats: Array<[string, string]> = [
    ["今日承诺", `${energy.done}/${energy.total}`],
    ["连续天数", String(streak)],
    ["当前连击", `x${combo}`],
    ["累计完成", String(totalCompleted)],
  ];

  return (
    <div className="flex w-full max-w-[820px] flex-col items-center gap-9">
      <PulseLine beat={beat} height={64} />

      <div className="flex items-center gap-12">
        <div className="relative" style={{ width: ring, height: ring }}>
          <svg width={ring} height={ring} className="-rotate-90">
            <circle cx={ring / 2} cy={ring / 2} r={radius} fill="none" stroke="var(--track)" strokeWidth={6} />
            <circle
              cx={ring / 2}
              cy={ring / 2}
              r={radius}
              fill="none"
              stroke="var(--pulse)"
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={`${(circumference * energy.percent) / 100} ${circumference}`}
              style={{ transition: "stroke-dasharray 620ms cubic-bezier(0.22,1,0.36,1)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="ap-mono ap-t-2xl leading-none font-semibold">{energy.percent}</span>
            <span className="ap-label mt-1">今日能量 %</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-12 gap-y-3.5">
          {stats.map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-2.5">
              <span className="ap-label w-16">{label}</span>
              <span className="ap-mono ap-t-md">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {focus ? (
        <div className="w-full space-y-4 text-center">
          <span className="ap-label">现在只做这件事</span>
          <h2 className="ap-t-xl leading-[1.25] font-semibold tracking-tight">{focus.title}</h2>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <UrgencyBadge score={urgencyScore(focus, today)} />
            {focus.due ? (
              <span className="ap-chip" data-tone={focus.due < today ? "danger" : "today"}>
                {focus.due < today
                  ? `已超期 ${-daysBetween(today, focus.due)} 天`
                  : focus.due === today
                    ? "今天截止"
                    : `${daysBetween(today, focus.due)} 天后截止`}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button type="button" className="ap-btn ap-btn--cta" data-variant="primary" onClick={onEnterFocus}>
              <Target size={15} /> 进入聚焦模式
            </button>
            <button
              type="button"
              className="ap-btn"
              style={{ padding: "11px 16px" }}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onToggle(focus, {
                  x: (rect.left + rect.width / 2) / window.innerWidth,
                  y: (rect.top + rect.height / 2) / window.innerHeight,
                });
              }}
            >
              <Check size={15} strokeWidth={3} /> 直接完成
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-center">
          <Moon size={26} className="mx-auto text-[var(--text-faint)]" />
          <h2 className="ap-t-lg font-semibold">清单见底了</h2>
          <p className="ap-t-sm text-[var(--text-faint)]">在左边写下下一件事，或者好好休息。</p>
        </div>
      )}

      {upcoming.length > 0 ? (
        <div className="w-full">
          <div className="mb-2 flex items-center justify-between">
            <span className="ap-label">紧随其后</span>
            <button type="button" className="ap-btn ap-btn--sm" data-variant="ghost" onClick={onEnterFocus}>
              全部收进聚焦 <ArrowRight size={11} />
            </button>
          </div>
          <ul className="space-y-1.5">
            {upcoming.map((task) => (
              <li key={task.id}>
                {/* 看起来像列表，就该真的能点：直接把这一件钉进聚焦台面 */}
                <button
                  type="button"
                  className="group flex w-full items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] px-3 py-2 text-left transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent-inset)]"
                  aria-label={`聚焦：${task.title}`}
                  onClick={() => onFocusTask(task.id)}
                >
                  <span className="ap-mono ap-t-xs w-6 shrink-0 text-[var(--text-faint)]">
                    {String(urgencyScore(task, today)).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate ap-t-base">{task.title}</span>
                  <ArrowRight
                    size={12}
                    className="shrink-0 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p key={quote} className="ap-quote-swap max-w-[44ch] text-center ap-t-sm leading-6 text-[var(--text-faint)]">
        {quote}
      </p>
    </div>
  );
}
