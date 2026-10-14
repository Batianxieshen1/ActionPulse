import { useCallback, useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * 捕获浏览器的 PWA 安装时机（beforeinstallprompt），
 * 交给应用内横幅温和地提示——浏览器原生入口（地址栏小图标）太隐蔽。
 * 只有 Chromium 系且站点满足 PWA 条件（HTTPS + manifest + SW）时才会触发；
 * 触发不了就静默不显示，绝不硬推。
 */
export function usePwaInstall() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    setDeferred(null);
  }, [deferred]);

  const dismiss = useCallback(() => setDeferred(null), []);

  return { canInstall: deferred !== null, promptInstall, dismiss };
}
