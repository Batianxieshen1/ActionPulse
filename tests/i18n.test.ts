import { describe, expect, it } from "vitest";
import { habitScheduleLabel, tr } from "../src/i18n";

describe("habitScheduleLabel（A5 显示文案）", () => {
  it("everyN 显示「每 {n} 天」，缺失时兜底 7", () => {
    expect(habitScheduleLabel({ schedule: "everyN", scheduleDay: null, intervalDays: 10 }, tr)).toBe("每 10 天");
    expect(habitScheduleLabel({ schedule: "everyN", scheduleDay: null, intervalDays: null }, tr)).toBe("每 7 天");
  });

  it("weekdays / weekly / daily 各归其位", () => {
    expect(habitScheduleLabel({ schedule: "weekdays", scheduleDay: null, intervalDays: null }, tr)).toBe("工作日");
    expect(habitScheduleLabel({ schedule: "weekly", scheduleDay: 6, intervalDays: null }, tr)).toBe(tr("weekday.6"));
    expect(habitScheduleLabel({ schedule: "daily", scheduleDay: null, intervalDays: null }, tr)).toBe("每天");
  });
});
