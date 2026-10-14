import { useCallback, useEffect, useRef, useState } from "react";

const UPDATE_POLL_MS = 30 * 60 * 1000;

/**
 * Service Worker 更新感知。
 *
 * sw.js 安装即 skipWaiting，所以新 worker 接管时 controllerchange 会触发——
 * 此刻页面里跑的还是旧版 JS，必须刷新一次才能拿到新资产：
 *  - 页面在前台 → 出横幅让用户自己点刷新（不打断可能正在进行的输入）；
 *  - 页面在后台 → 直接 reload（用户回来时已是新版，无感）。
 * 另外每 30 分钟 + 每次回到前台轮询一次 registration.update()，
 * 让长开的应用也有机会发现新版本（浏览器默认只在导航时检查 sw.js）。
 */
export function useSwUpdate(): { updateReady: boolean; applyUpdate: () => void; dismiss: () => void } {
  const [updateReady, setUpdateReady] = useState(false);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onControllerChange = () => {
      if (handledRef.current) return;
      handledRef.current = true;
      if (document.visibilityState === "hidden") window.location.reload();
      else setUpdateReady(true);
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const poll = () => {
      void navigator.serviceWorker
        .getRegistration()
        .then((registration) => registration?.update())
        .catch(() => undefined);
    };
    const interval = window.setInterval(poll, UPDATE_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const applyUpdate = useCallback(() => window.location.reload(), []);
  const dismiss = useCallback(() => setUpdateReady(false), []);

  return { updateReady, applyUpdate, dismiss };
}
