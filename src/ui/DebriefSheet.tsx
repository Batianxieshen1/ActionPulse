import { useMemo, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { debriefMarkdown, type DebriefStats } from "../domain/debrief";
import { useT } from "../i18n";
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
  const t = useT();
  const markdown = useMemo(() => debriefMarkdown(stats), [stats]);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");

  const handleCopy = async () => {
    const ok = await copyText(markdown);
    setCopyState(ok ? "ok" : "fail");
    window.setTimeout(() => setCopyState("idle"), 2600);
  };

  const cells: { label: string; value: string; hint?: string }[] = [
    { label: t("debrief.tasksDone"), value: String(stats.tasksDone), hint: t("debrief.tasksUnit") },
    { label: t("debrief.focusMinutes"), value: formatMinutes(stats.focusMinutes), hint: t("debrief.minutesUnit") },
    { label: t("debrief.comboPeak"), value: stats.comboPeak > 0 ? `x${stats.comboPeak}` : "—" },
    { label: t("debrief.habits"), value: stats.habitsTotal > 0 ? `${stats.habitsDone}/${stats.habitsTotal}` : "—" },
    { label: t("debrief.streak"), value: String(stats.streakDays), hint: t("debrief.streakUnit") },
    { label: t("stage.stats.total"), value: String(stats.totalCompleted), hint: t("debrief.totalUnit") },
  ];

  // 近 7 天估时分布的行。条形复用 .ap-breakdown__track/__fill（同一套轨道语言），
  // 以本窗口内的最大桶为满格 —— 看相对构成，不看绝对时长。
  const mixRows = (() => {
    const mix = stats.weekEstimateMix;
    const rows = [
      { label: t("debrief.bucketQuick"), count: mix.quick },
      { label: t("debrief.bucketMedium"), count: mix.medium },
      { label: t("debrief.bucketSlow"), count: mix.slow },
      { label: t("debrief.bucketUntimed"), count: mix.untimed },
    ];
    const max = Math.max(...rows.map((row) => row.count), 1);
    return rows.map((row) => ({ ...row, max }));
  })();

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "var(--scrim)" }} onClick={onClose} aria-hidden="true" />
      <div className="ap-overlay" role="dialog" aria-modal="true" aria-label={t("debrief.title")} style={{ background: "transparent" }}>
        <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-10">
          <div className="ap-card w-full max-w-[520px] space-y-5 p-6">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2 className="ap-t-lg font-semibold">{t("debrief.title")}</h2>
                <p className="ap-label mt-1">{stats.today}</p>
              </div>
              <button type="button" className="ap-icon-btn" aria-label={t("debrief.close")} onClick={onClose}>
                <X size={16} />
              </button>
            </header>

            <div className="grid grid-cols-3 gap-2.5">
              {cells.map((cell) => (
                <div key={cell.label} className="rounded-[var(--radius-md)] border border-[var(--line)] px-3 py-2.5">
                  <div className="ap-label">{cell.label}</div>
                  <div className="ap-mono mt-1 ap-t-lg leading-none font-semibold">
                    {cell.value}
                    {cell.hint ? (
                      <span className="ml-1 ap-t-2xs font-normal text-[var(--text-faint)]">{cell.hint}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {/* 合并策略亮出来：数字取的是各设备的最大值。自己发现「数字少了」会伤信任，
                主动说清楚就把「缺陷」变成「诚实的设计」。 */}
            <p className="px-0.5 ap-t-2xs leading-4 text-[var(--text-faint)]">
              {t("debrief.mergeNote")}
            </p>

            {stats.weekEstimateMix.total > 0 ? (
              <div>
                <div className="ap-label mb-1.5">{t("debrief.weekMix")}</div>
                <div className="space-y-1.5">
                  {mixRows.map(({ label, count, max }) => (
                    <div key={label} className="ap-breakdown__row">
                      <span className="ap-breakdown__label">{label}</span>
                      <span className="ap-breakdown__track" aria-hidden="true">
                        <span
                          className="ap-breakdown__fill"
                          style={{ width: `${Math.round((count / max) * 100)}%` }}
                        />
                      </span>
                      <span className="ap-breakdown__value ap-mono">×{count}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 ap-t-2xs leading-4 text-[var(--text-faint)]">
                  {stats.weekEstimateMix.quickPercent >= 60 && stats.weekEstimateMix.total >= 3
                    ? t("debrief.quickHigh", { n: stats.weekEstimateMix.quickPercent })
                    : t("debrief.quickLow", { n: stats.weekEstimateMix.quickPercent })}
                </p>
              </div>
            ) : null}

            {stats.taskTitles.length > 0 ? (
              <div>
                <div className="ap-label mb-1.5">{t("debrief.doneToday")}</div>
                <ul className="space-y-1">
                  {/* 用下标做 key：同一天完成两个同名任务是完全正常的（"回邮件" ×2），
                      用 title 当 key 会直接撞车。这个列表是静态且不可重排的，下标在这里是正确的。
                      注意生产构建下 React 不会给出重复 key 的告警，所以这类问题不会被 console 抓到。 */}
                  {stats.taskTitles.map((title, index) => (
                    <li key={`${index}-${title}`} className="flex items-center gap-2 ap-t-sm text-[var(--text-dim)]">
                      <Check size={12} strokeWidth={3} className="shrink-0 text-[var(--pulse)]" />
                      <span className="min-w-0 flex-1 truncate">{title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <div className="ap-label mb-1.5">{t("debrief.markdown")}</div>
              <pre className="ap-scroll max-h-[168px] overflow-auto rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--control-bg)] p-3 ap-t-xs leading-5 whitespace-pre-wrap">
                {markdown}
              </pre>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button type="button" className="ap-btn" data-variant="primary" onClick={() => void handleCopy()}>
                  {copyState === "ok" ? <Check size={13} /> : <Copy size={13} />}
                  {copyState === "ok" ? t("debrief.copied") : t("debrief.copy")}
                </button>
                {copyState === "fail" ? (
                  <span className="ap-t-xs" style={{ color: "var(--tier-high)" }}>
                    {t("debrief.copyFail")}
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
