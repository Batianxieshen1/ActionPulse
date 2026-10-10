import { urgencyTier } from "../domain/urgency";

export function UrgencyBadge({ score, compact = false }: { score: number; compact?: boolean }) {
  const tier = urgencyTier(score);
  return (
    <span
      className={`ap-score ap-tier-${tier}`}
      title={`系统紧迫度 ${score} / 100（${tier}）`}
      aria-label={`紧迫度 ${score}`}
    >
      {score}
      {compact ? null : <span className="ap-score__unit">分</span>}
    </span>
  );
}
