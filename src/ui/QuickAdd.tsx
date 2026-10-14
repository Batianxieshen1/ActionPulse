import { useMemo, useState } from "react";
import { CornerDownLeft, Plus } from "lucide-react";
import { addDays, daysBetween, todayKey } from "../domain/dates";
import { parseCapture } from "../domain/nlp";
import type { Importance } from "../domain/types";
import { tr, useT } from "../i18n";

interface Props {
  onAdd: (title: string, patch?: { importance?: Importance; due?: string | null; estimateMinutes?: number | null }) => void;
}

const ESTIMATE_PRESETS = [5, 15, 30, 60];

function dueLabel(due: string, today: string): string {
  const diff = daysBetween(today, due);
  if (diff === 0) return tr("common.today");
  if (diff === 1) return tr("common.tomorrow");
  if (diff === 2) return tr("common.dayAfter");
  if (diff < 0) return due;
  return tr("card.dueIn", { n: diff });
}

/**
 * 快速捕捉（PRD §4 模块1 + v2.1 模块三）。
 * 刻意的低摩擦：只有标题是必填的，三个下拉保留上次的选择，回车即入。
 *
 * 自然语言标记**优先于**下拉框，下拉框作为缺省值 —— 并且**不会**被标记改写，
 * 这样"上次的选择"这份记忆不会被一次临时输入污染。
 * 解析结果实时显示成胶囊：看得见才敢用。
 */
export function QuickAdd({ onAdd }: Props) {
  const t = useT();
  const importanceLabel: Record<Importance, string> = {
    high: t("quick.impHigh"),
    medium: t("quick.impMed"),
    low: t("quick.impLow"),
  };
  const [title, setTitle] = useState("");
  const [importance, setImportance] = useState<Importance>("medium");
  const [due, setDue] = useState<string>("");
  const [estimate, setEstimate] = useState<string>("");

  const today = todayKey();
  const parsed = useMemo(() => parseCapture(title, today), [title, today]);
  const parsedAnything =
    parsed.importance !== undefined || parsed.due !== undefined || parsed.estimateMinutes !== undefined;

  const submit = () => {
    const value = parsed.title.trim();
    if (value.length === 0) return;
    onAdd(value, {
      // 文本标记优先；没写标记才回落到下拉框
      importance: parsed.importance ?? importance,
      due: parsed.due ?? (due === "" ? null : due),
      estimateMinutes: parsed.estimateMinutes ?? (estimate === "" ? null : Number(estimate)),
    });
    setTitle("");
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          className="ap-input"
          style={{ paddingRight: 40 }}
          placeholder={t("quick.placeholder")}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          aria-label={t("quick.title")}
        />
        <button
          type="button"
          className="ap-icon-btn absolute top-1/2 right-1 -translate-y-1/2"
          aria-label={t("common.addTask")}
          onClick={submit}
        >
          {title.trim().length > 0 ? <CornerDownLeft size={14} /> : <Plus size={14} />}
        </button>
      </div>

      {parsedAnything ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
          <span className="ap-label">{t("quick.parsedAs")}</span>
          {parsed.importance ? (
            <span className="ap-chip" data-tone={parsed.importance === "high" ? "warn" : undefined}>
              {importanceLabel[parsed.importance]}
            </span>
          ) : null}
          {parsed.due ? (
            <span className="ap-chip" data-tone="today">
              {dueLabel(parsed.due, today)}
            </span>
          ) : null}
          {parsed.estimateMinutes !== undefined ? (
            <span className="ap-chip">{parsed.estimateMinutes} {t("common.minute")}</span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {/* 标记优先于下拉框（submit 里的 ?? 顺序）。被标记接管的字段下拉框已不生效，
            置灰禁用让「谁说了算」可见可懂 —— 双事实源并存是视觉谎言。逐字段判断，
            因为标记往往只覆盖一部分，其余下拉仍是生效的缺省值。 */}
        <select
          className="ap-select ap-t-xs"
          style={{ opacity: parsed.importance !== undefined ? 0.45 : undefined }}
          disabled={parsed.importance !== undefined}
          title={parsed.importance !== undefined ? t("quick.takenOver") : undefined}
          value={importance}
          onChange={(event) => setImportance(event.target.value as Importance)}
          aria-label={t("quick.impLabel")}
        >
          <option value="high">{t("quick.impHigh")}</option>
          <option value="medium">{t("quick.impMed")}</option>
          <option value="low">{t("quick.impLow")}</option>
        </select>

        <select
          className="ap-select ap-t-xs"
          style={{ opacity: parsed.due !== undefined ? 0.45 : undefined }}
          disabled={parsed.due !== undefined}
          title={parsed.due !== undefined ? t("quick.takenOver") : undefined}
          value={due}
          onChange={(event) => setDue(event.target.value)}
          aria-label={t("quick.dueLabel")}
        >
          <option value="">{t("quick.noDue")}</option>
          <option value={today}>{t("common.today")}</option>
          <option value={addDays(today, 1)}>{t("common.tomorrow")}</option>
          <option value={addDays(today, 3)}>{t("quick.due3d")}</option>
          <option value={addDays(today, 7)}>{t("quick.due1w")}</option>
        </select>

        <select
          className="ap-select ap-t-xs"
          style={{ opacity: parsed.estimateMinutes !== undefined ? 0.45 : undefined }}
          disabled={parsed.estimateMinutes !== undefined}
          title={parsed.estimateMinutes !== undefined ? t("quick.takenOver") : undefined}
          value={estimate}
          onChange={(event) => setEstimate(event.target.value)}
          aria-label={t("quick.estimateLabel")}
        >
          <option value="">{t("common.untimed")}</option>
          {ESTIMATE_PRESETS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} {t("common.minute")}
            </option>
          ))}
          <option value={120}>2 {t("common.hour")}</option>
        </select>
      </div>

      <p className="ap-t-2xs leading-5 text-[var(--text-faint)]">
        {t("quick.hint")}<code className="ap-mono">!high</code> <code className="ap-mono">!med</code>{" "}
        <code className="ap-mono">!low</code> · <code className="ap-mono">今天</code>{" "}
        <code className="ap-mono">明天</code> <code className="ap-mono">周三</code> ·{" "}
        <code className="ap-mono">~15m</code> <code className="ap-mono">~1h</code>
      </p>
    </div>
  );
}
