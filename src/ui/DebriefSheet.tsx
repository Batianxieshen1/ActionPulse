import { useMemo, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { debriefMarkdown, type DebriefStats } from "../domain/debrief";
import { copyText } from "./copyText";

interface Props {
  stats: DebriefStats;
  onClose: () => void;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${rest}`;
}

/**
 * 🏆 今日战报（PRD-v2.1 模块四）。
 *
 * **刻意不做成"清空时自动弹"**：那一刻用户刚打完勾，已经有水晶音、礼花、全屏庆祝和一条提示语，
 * 再叠一个全屏弹层既过载、又会在用户想立刻记下一件事时挡住他。
 * 所以清空时只出现一条**非阻塞**提示，这个弹层必须由用户主动打开。
 */
export function DebriefSheet({ stats, onClose }: Props) {
  const markdown = useMemo(() => debriefMarkdown(stats), [stats]);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");

  const handleCopy = async () => {
    const ok = await copyText(markdown);
    setCopyState(ok ? "ok" : "fail");
    window.setTimeout(() => setCopyState("idle"), 2600);
  };

  const cells: { label: string; value: string; hint?: string }[] = [
    { label: "今日完成", value: String(stats.tasksDone), hint: "件任务" },
    { label: "专注时长", value: formatMinutes(stats.focusMinutes), hint: "分钟" },
    { label: "连击峰值", value: stats.comboPeak > 0 ? `x${stats.comboPeak}` : "—" },
    { label: "习惯达成", value: stats.habitsTotal > 0 ? `${stats.habitsDone}/${stats.habitsTotal}` : "—" },
    { label: "连续天数", value: String(stats.streakDays), hint: "天" },
    { label: "累计完成", value: String(stats.totalCompleted), hint: "件" },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "var(--scrim)" }} onClick={onClose} aria-hidden="true" />
      <div className="ap-overlay" role="dialog" aria-modal="true" aria-label="今日战报" style={{ background: "transparent" }}>
        <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-10">
          <div className="ap-card w-full max-w-[520px] space-y-5 p-6">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[17px] font-semibold">今日战报</h2>
                <p className="ap-label mt-1">{stats.today}</p>
              </div>
              <button type="button" className="ap-icon-btn" aria-label="关闭战报" onClick={onClose}>
                <X size={16} />
              </button>
            </header>

            <div className="grid grid-cols-3 gap-2.5">
              {cells.map((cell) => (
                <div key={cell.label} className="rounded-[var(--radius-md)] border border-[var(--line)] px-3 py-2.5">
                  <div className="ap-label">{cell.label}</div>
                  <div className="ap-mono mt-1 text-[19px] leading-none font-semibold">
                    {cell.value}
                    {cell.hint ? (
                      <span className="ml-1 text-[10px] font-normal text-[var(--text-faint)]">{cell.hint}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {stats.taskTitles.length > 0 ? (
              <div>
                <div className="ap-label mb-1.5">今天完成的事</div>
                <ul className="space-y-1">
                  {/* 用下标做 key：同一天完成两个同名任务是完全正常的（"回邮件" ×2），
                      用 title 当 key 会直接撞车。这个列表是静态且不可重排的，下标在这里是正确的。
                      注意生产构建下 React 不会给出重复 key 的告警，所以这类问题不会被 console 抓到。 */}
                  {stats.taskTitles.map((title, index) => (
                    <li key={`${index}-${title}`} className="flex items-center gap-2 text-[12.5px] text-[var(--text-dim)]">
                      <Check size={12} strokeWidth={3} className="shrink-0 text-[var(--pulse)]" />
                      <span className="min-w-0 flex-1 truncate">{title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <div className="ap-label mb-1.5">Markdown 战报</div>
              <pre className="ap-scroll max-h-[168px] overflow-auto rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--control-bg)] p-3 text-[11.5px] leading-5 whitespace-pre-wrap">
                {markdown}
              </pre>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button type="button" className="ap-btn" data-variant="primary" onClick={() => void handleCopy()}>
                  {copyState === "ok" ? <Check size={13} /> : <Copy size={13} />}
                  {copyState === "ok" ? "已复制" : "复制 Markdown"}
                </button>
                {copyState === "fail" ? (
                  <span className="text-[11.5px]" style={{ color: "var(--tier-high)" }}>
                    浏览器不允许自动复制 —— 上面的文本可以直接手动选中
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
