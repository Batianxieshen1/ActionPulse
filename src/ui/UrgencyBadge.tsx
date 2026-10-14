import { urgencyTier } from "../domain/urgency";
import { useT } from "../i18n";

export function UrgencyBadge({ score, compact = false }: { score: number; compact?: boolean }) {
  const t = useT();
  const tier = urgencyTier(score);
  return (
    <span
      className={`ap-score ap-tier-${tier}`}
      title={t("score.badgeTitle", { n: score, tier })}
      aria-label={t("score.badge", { n: score })}
    >
      {score}
      {compact ? null : <span className="ap-score__unit">{t("score.unit")}</span>}
    </span>
  );
}
