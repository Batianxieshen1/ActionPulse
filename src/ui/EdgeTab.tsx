interface Props {
  hidden: boolean;
  pendingCount: number;
  onOpen: () => void;
}

/** 左侧悬浮把手（PRD §2.1）：面板收起后仍能看到还剩几件事。 */
export function EdgeTab({ hidden, pendingCount, onOpen }: Props) {
  if (hidden) return null;
  return (
    <button type="button" className="ap-edge" onClick={onOpen} aria-label="展开 ActionPulse 面板" title="展开面板（Alt + S）">
      <span className="ap-edge__dot" />
      <span className="ap-edge__label">ActionPulse</span>
      <span className="ap-edge__count">{pendingCount}</span>
    </button>
  );
}
