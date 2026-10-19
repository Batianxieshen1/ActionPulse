/**
 * localStorage 持久化（PRD §6.2：零后端、离线、自动保存）。
 * 任何存储异常（隐私模式、配额超限、被禁用）都必须降级而不是让应用崩溃。
 */
import { createBackup, defaultState, parseBackup } from "../domain/validation";
import type { AppState } from "../domain/types";

export const STORAGE_KEY = "actionpulse.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function loadState(storage: StorageLike): AppState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = parseBackup(raw);
    return parsed.ok ? parsed.state : defaultState();
  } catch {
    return defaultState();
  }
}

export type SaveResult = { ok: true } | { ok: false; error: unknown };

/**
 * 保存到 localStorage。
 *
 * 失败（配额满 / 隐私模式）时**不抛出**——内存状态仍然可用，应用继续降级运行；
 * 但把失败**如实返回**，让调用方能提示用户「改动没有落盘」。
 * 静默的降级曾让用户在配额满后持续操作、刷新即丢（见审计 Bug 4）。
 */
export function saveState(storage: StorageLike, state: AppState): SaveResult {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(createBackup(state)));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

export function clearState(storage: StorageLike): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // 同上，忽略。
  }
}

/** 浏览器环境下的 localStorage 包装；SSR / 测试环境下返回 null。 */
export function browserStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}
