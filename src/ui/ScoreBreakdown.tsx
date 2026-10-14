import { COMPONENT_MAX, MAX_RAW, urgencyComponents } from "../domain/urgency";
import type { Task } from "../domain/types";
import { useT } from "../i18n";

function formatPart(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * 「为什么是这个分数」：把紧迫度公式的四个分项摊开给用户看（PRD §5 的可解释性承诺）。
 * 条形按各分项相对自身理论满分（35 / 48 / 15 / 10）的占比填充——
 * 四条拼起来正好是总分在 108 里所处的位置。
 */
export function ScoreBreakdown({
  task,
  today,
  score,
}: {
  task: Task;
  today: string;
  score: number;
}) {
  const t = useT();
  const rows = [
    { key: "imp", label: t("score.imp") },
    { key: "due", label: t("score.due") },
    { key: "quick", label: t("score.quick") },
    { key: "age", label: t("score.age") },
  ] as const;
  const parts = urgencyComponents(task, today);
  return (
    <div className="ap-breakdown">
      <span className="ap-label">{t("score.title")}</span>
      {rows.map(({ key, label }) => (
        <div key={key} className="ap-breakdown__row">
          <span className="ap-breakdown__label">{label}</span>
          <span className="ap-breakdown__track" aria-hidden="true">
            <span
              className="ap-breakdown__fill"
              style={{ width: `${Math.round((parts[key] / COMPONENT_MAX[key]) * 100)}%` }}
            />
          </span>
          <span className="ap-breakdown__value ap-mono">{formatPart(parts[key])} {t("score.unit")}</span>
        </div>
      ))}
      <p className="ap-breakdown__total ap-mono">
        {t("score.total", { raw: formatPart(parts.total), max: MAX_RAW, score })}
      </p>
    </div>
  );
}
