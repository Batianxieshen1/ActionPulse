import { useEffect, useState } from "react";
import type { ThemePreference } from "../domain/types";

export type ResolvedTheme = "light" | "dark";

/** 移动端浏览器用它给状态栏/地址栏着色，必须跟着主题走，否则浅色下状态栏还是近黑。 */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  dark: "#0b0f17",
  light: "#f7f7f4",
};

export const THEME_STORAGE_KEY = "actionpulse.v1";

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveTheme(preference: ThemePreference, system: ResolvedTheme): ResolvedTheme {
  return preference === "system" ? system : preference;
}

function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  if (root.dataset.theme !== resolved) root.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && meta.getAttribute("content") !== THEME_COLOR[resolved]) {
    meta.setAttribute("content", THEME_COLOR[resolved]);
  }
}

/**
 * 应用主题。
 * 注意：首屏不靠这个 effect —— index.html 里有一段内联脚本在首次绘制前就把 data-theme 定好了，
 * 否则浅色用户会先看到一帧深色界面（FOUC）。这里只负责"运行期切换"和"系统主题变化"。
 */
export function useTheme(preference: ThemePreference): ResolvedTheme {
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);
  const resolved = resolveTheme(preference, system);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setSystem(media.matches ? "light" : "dark");
    // 先同步一次：用户可能在别的窗口里改过系统主题
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  return resolved;
}
