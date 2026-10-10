/** ActionPulse 领域模型。字段与 PRD §4 / §5 一一对应，v2 起带同步元数据。 */

/** 重要度（PRD §5.1）：high=1.0 / medium=0.6 / low=0.2。 */
export type Importance = "high" | "medium" | "low";

/** 艾森豪威尔四象限（PRD §4 模块1）。q1 重要且紧急 / q2 重要不紧急 / q3 紧急不重要 / q4 不重要不紧急。 */
export type Quadrant = "q1" | "q2" | "q3" | "q4";

/** 双轨优先级引擎（PRD §4 模块1）。 */
export type PriorityMode = "auto" | "manual";

/** 主题偏好：跟随系统 / 强制浅色 / 强制深色。刻意不参与多端同步（见 merge.ts）。 */
export type ThemePreference = "system" | "light" | "dark";

/**
 * 每日习惯 / 日常仪式（v2.1 模块一）。
 * 与 Task 分开是因为：Task 带 due 会产生超期压力，而习惯的本质是「每天重来」。
 * \`completedDates\` 是 G-Set（只增集合），两端合并取并集 —— 天然无冲突。
 */
export interface DailyHabit {
  id: string;
  title: string;
  emoji: string;
  /** 打勾过的本地日期键（YYYY-MM-DD）。 */
  completedDates: string[];
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 按日聚合的指标（v2.1 模块四）。两个 map 都用「取最大值」合并，保证幂等、不会重复计数。 */
export interface DailyMetrics {
  /** dateKey -> 当日专注分钟数 */
  focusMinutes: Record<string, number>;
  /** dateKey -> 当日连击峰值 */
  comboPeak: Record<string, number>;
}

/** 紧迫度颜色分档，仅用于 UI 着色。 */
export type UrgencyTier = "critical" | "high" | "medium" | "low";

/** 微步骤（PRD §4 模块3）：可单独打勾，独立触发正反馈。 */
export interface SubTask {
  id: string;
  title: string;
  done: boolean;
  /** ISO 时间戳；未完成时为 null。 */
  completedAt: string | null;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  importance: Importance;
  /** 本地日期键 YYYY-MM-DD；null = 无截止时间。 */
  due: string | null;
  /** 预估耗时（分钟）；null = 未估时，按最慢档计分。 */
  estimateMinutes: number | null;
  /** 手动模式下的四象限归属；null = 未归类（收集箱）。 */
  quadrant: Quadrant | null;
  /** 手动模式拖拽排序位次，从 0 递增。 */
  manualRank: number;
  subtasks: SubTask[];
  done: boolean;
  /** ISO 时间戳；未完成时为 null。 */
  createdAt: string;
  /** ISO 时间戳；未完成时为 null。 */
  completedAt: string | null;
  /** 归档后不再出现在活动列表，但数据保留可恢复。 */
  archived: boolean;
  /**
   * 毫秒时间戳，**每次内容改动都会严格递增**（见 domain/clock.ts）。
   * 多端合并靠它判断新旧，因此它必须和内容一起变，否则会丢改动。
   */
  updatedAt: number;
}

export interface Settings {
  priorityMode: PriorityMode;
  soundEnabled: boolean;
  /** 0 ~ 1。 */
  soundVolume: number;
  vibrationEnabled: boolean;
  confettiEnabled: boolean;
  encourageEnabled: boolean;
  /** 番茄钟时长（分钟）。 */
  pomodoroMinutes: number;
  /** 桌面端是否常驻左侧（Pin）。 */
  panelPinned: boolean;
  /** 尊重 prefers-reduced-motion，关闭动效。 */
  reduceMotion: boolean;
  /** 优先使用服务端 AI 做语义拆解；未配置或失败时自动回退到离线模板。 */
  aiBreakdown: boolean;
  /** 外观主题。设备本地偏好，不跨端同步。 */
  theme: ThemePreference;
}

export interface Stats {
  /** 当前连击（Combo）：45 分钟内的连续完成次数。 */
  combo: number;
  bestCombo: number;
  lastCompletionAt: number | null;
  totalCompleted: number;
  /** 有完成记录的本地日期键，用于计算连续天数。 */
  completionDates: string[];
}

export interface AppState {
  version: number;
  tasks: Task[];
  habits: DailyHabit[];
  settings: Settings;
  stats: Stats;
  /** 墓碑：taskId -> 删除时刻（毫秒）。用于防止已删除任务被其他设备"复活"。 */
  tombstones: Record<string, number>;
  daily: DailyMetrics;
}

export interface EnergySnapshot {
  done: number;
  total: number;
  percent: number;
}
