import { useCallback, useRef, useState } from "react";
import { createId } from "../domain/id";

export type ToastTone = "normal" | "hot" | "info";

export interface Toast {
  id: string;
  text: string;
  tone: ToastTone;
}

const LIFETIME_MS = 2600;
const MAX_VISIBLE = 3;

export interface ToastApi {
  toasts: Toast[];
  push: (text: string, tone?: ToastTone) => void;
  dismiss: (id: string) => void;
}

export function useToasts(): ToastApi {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback((text: string, tone: ToastTone = "normal") => {
    const id = createId("toast");
    setToasts((current) => [...current, { id, text, tone }].slice(-MAX_VISIBLE));
    const timer = window.setTimeout(() => dismiss(id), LIFETIME_MS);
    timers.current.set(id, timer);
  }, [dismiss]);

  return { toasts, push, dismiss };
}
