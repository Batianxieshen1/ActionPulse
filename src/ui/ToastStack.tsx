import { Flame, Sparkles } from "lucide-react";
import type { Toast } from "../hooks/useToasts";

interface Props {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function ToastStack({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="ap-toast-stack pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className="ap-toast pointer-events-auto cursor-pointer"
          onClick={() => onDismiss(toast.id)}
          style={
            toast.tone === "hot"
              ? { borderColor: "color-mix(in srgb, var(--tier-high) 50%, transparent)", color: "var(--tier-high)" }
              : toast.tone === "info"
                ? { color: "var(--text-dim)" }
                : undefined
          }
        >
          {toast.tone === "hot" ? <Flame size={14} /> : <Sparkles size={14} />}
          <span className="text-[13px]">{toast.text}</span>
        </button>
      ))}
    </div>
  );
}
