/**
 * 系统通知（审计路线图差距 4 的**采纳部分**）。
 *
 * 刻意不做"傍晚未完提醒"——那违反产品第三条原则（清单不能变成负罪感来源）。
 * 只做计时结束的后台提醒：页面不可见时，界面内的水晶音和 toast 够不着用户，
 * 系统通知才是合适的通道；页面可见时反而不发（那只是噪音）。
 *
 * 判定逻辑抽成纯函数，环境（Notification API / 可见性）只作为输入——可单测。
 */

export interface NotificationDecision {
  /** 用户在设置里打开的开关。 */
  enabled: boolean;
  visibility: DocumentVisibilityState;
  permission: NotificationPermission;
}

export function shouldFireSystemNotification(decision: NotificationDecision): boolean {
  return decision.enabled && decision.visibility === "hidden" && decision.permission === "granted";
}

/** 当前环境是否可能使用系统通知（用于设置面板的降级提示）。 */
export function notificationsSupported(): boolean {
  return typeof Notification !== "undefined";
}

/** 发送计时结束通知。环境不支持 / 未授权 / 页面可见 时静默返回 false。 */
export function notifyTimerEnd(title: string, body: string): boolean {
  if (!notificationsSupported()) return false;
  const decision: NotificationDecision = {
    enabled: true,
    visibility: document.visibilityState,
    permission: Notification.permission,
  };
  if (!shouldFireSystemNotification(decision)) return false;
  try {
    new Notification(title, { body, icon: "/icons/icon-192.png", tag: "actionpulse-timer" });
    return true;
  } catch {
    return false;
  }
}
