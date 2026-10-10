import type { MouseEvent } from "react";
import { Check } from "lucide-react";

interface Props {
  checked: boolean;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  label: string;
  size?: "sm" | "md";
}

export function TaskCheck({ checked, onToggle, label, size = "md" }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      className="ap-check"
      data-checked={checked}
      data-size={size}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(event);
      }}
    >
      {checked ? (
        <Check size={size === "sm" ? 11 : 14} strokeWidth={3.4} className="ap-check__tick" />
      ) : null}
    </button>
  );
}
