import { describe, expect, it } from "vitest";
import { parseCapture } from "../src/domain/nlp";

// 2026-10-08 是周四（可用 addDays 反推验证），所以周几的期望值可以写死
const THU = "2026-10-08";

describe("parseCapture —— 纯文本", () => {
  it("没有标记时标题原样保留", () => {
    const r = parseCapture("写季度汇报", THU);
    expect(r.title).toBe("写季度汇报");
    expect(r.importance).toBeUndefined();
    expect(r.due).toBeUndefined();
    expect(r.estimateMinutes).toBeUndefined();
  });

  it("折叠多余空白并去掉首尾空格", () => {
    expect(parseCapture("  写   周报  ", THU).title).toBe("写 周报");
  });

  it("保留标题里的标点与 emoji", () => {
    expect(parseCapture("改 bug！🔥", THU).title).toBe("改 bug！🔥");
  });

  it("空输入返回空标题（由调用方决定是否忽略）", () => {
    expect(parseCapture("   ", THU).title).toBe("");
  });
});

describe("parseCapture —— 重要度", () => {
  it("接受长写与缩写", () => {
    expect(parseCapture("甲 !high", THU).importance).toBe("high");
    expect(parseCapture("甲 !h", THU).importance).toBe("high");
    expect(parseCapture("甲 !med", THU).importance).toBe("medium");
    expect(parseCapture("甲 !medium", THU).importance).toBe("medium");
    expect(parseCapture("甲 !m", THU).importance).toBe("medium");
    expect(parseCapture("甲 !low", THU).importance).toBe("low");
    expect(parseCapture("甲 !l", THU).importance).toBe("low");
  });

  it("大小写不敏感", () => {
    expect(parseCapture("甲 !HIGH", THU).importance).toBe("high");
    expect(parseCapture("甲 !High", THU).importance).toBe("high");
  });

  it("标记被剥离，标题只剩正文", () => {
    expect(parseCapture("写周报 !high", THU).title).toBe("写周报");
  });

  it("重复标记时以最后一个为准", () => {
    expect(parseCapture("甲 !high !low", THU).importance).toBe("low");
  });

  it("不成词的感叹号不会误伤（标题里的 ! 要留住）", () => {
    expect(parseCapture("赶紧！!urgent 别拖", THU).title).toBe("赶紧！!urgent 别拖");
    expect(parseCapture("修好了!", THU).title).toBe("修好了!");
    expect(parseCapture("甲 !", THU).title).toBe("甲 !");
  });
});

describe("parseCapture —— 预估耗时（开放区间，不是固定枚举）", () => {
  it("任意分钟数都能解析，不必落在枚举里", () => {
    expect(parseCapture("甲 ~5m", THU).estimateMinutes).toBe(5);
    expect(parseCapture("甲 ~15m", THU).estimateMinutes).toBe(15);
    expect(parseCapture("甲 ~45m", THU).estimateMinutes).toBe(45);
    expect(parseCapture("甲 ~90m", THU).estimateMinutes).toBe(90);
  });

  it("小时换算成分钟", () => {
    expect(parseCapture("甲 ~1h", THU).estimateMinutes).toBe(60);
    expect(parseCapture("甲 ~2h", THU).estimateMinutes).toBe(120);
  });

  it("也接受中文单位", () => {
    expect(parseCapture("甲 ~20分钟", THU).estimateMinutes).toBe(20);
    expect(parseCapture("甲 ~2小时", THU).estimateMinutes).toBe(120);
  });

  it("大小写不敏感", () => {
    expect(parseCapture("甲 ~1H", THU).estimateMinutes).toBe(60);
  });

  it("夹到合理区间，避免 0 分钟或离谱数值", () => {
    expect(parseCapture("甲 ~0m", THU).estimateMinutes).toBe(1);
    expect(parseCapture("甲 ~9999m", THU).estimateMinutes).toBe(600);
  });

  it("孤立的波浪号不算标记", () => {
    expect(parseCapture("甲 ~ 乙", THU).title).toBe("甲 ~ 乙");
  });
});

describe("parseCapture —— 截止日期", () => {
  it("今天 / 明天 / 后天", () => {
    expect(parseCapture("甲 今天", THU).due).toBe("2026-10-08");
    expect(parseCapture("甲 明天", THU).due).toBe("2026-10-09");
    expect(parseCapture("甲 后天", THU).due).toBe("2026-10-10");
  });

  it("周几解析为「下一个该星期几」，包含今天", () => {
    // 2026-10-08 是周四
    expect(parseCapture("甲 周四", THU).due).toBe("2026-10-08"); // 就是今天
    expect(parseCapture("甲 周五", THU).due).toBe("2026-10-09");
    expect(parseCapture("甲 周六", THU).due).toBe("2026-10-10");
    expect(parseCapture("甲 周日", THU).due).toBe("2026-10-11");
    expect(parseCapture("甲 周天", THU).due).toBe("2026-10-11"); // 周天 = 周日
    expect(parseCapture("甲 周一", THU).due).toBe("2026-10-12");
    expect(parseCapture("甲 周二", THU).due).toBe("2026-10-13");
    expect(parseCapture("甲 周三", THU).due).toBe("2026-10-14");
  });

  it("【关键】任何周几都绝不解析成过去的日期", () => {
    // 这是最重要的一条：解析成过去会让任务立刻「已超期」，紧迫度直接冲到榜首，
    // 等于用户用自然语言省事却被系统惩罚。
    const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日", "周天"];
    for (const day of weekdays) {
      const due = parseCapture("甲 " + day, THU).due;
      expect(due, day).toBeDefined();
      expect(due! >= THU, day + " 解析成了过去: " + due).toBe(true);
      // 且不超过一周
      expect(due! <= "2026-10-14", day).toBe(true);
    }
  });

  it("重复日期时以最后一个为准", () => {
    expect(parseCapture("甲 今天 明天", THU).due).toBe("2026-10-09");
  });

  it("句首的「今天」不会被误剥离（否则标题就断了）", () => {
    expect(parseCapture("今天要交报告", THU).title).toBe("今天要交报告");
    expect(parseCapture("今天要交报告", THU).due).toBeUndefined();
  });
});

describe("parseCapture —— 紧贴正文的标记（中文常常不打空格）", () => {
  it("末尾紧贴的日期词能被剥离", () => {
    const r = parseCapture("写周报今天", THU);
    expect(r.title).toBe("写周报");
    expect(r.due).toBe("2026-10-08");
  });

  it("末尾紧贴的估时能被剥离", () => {
    const r = parseCapture("写周报~15m", THU);
    expect(r.title).toBe("写周报");
    expect(r.estimateMinutes).toBe(15);
  });

  it("末尾紧贴的重要度能被剥离", () => {
    const r = parseCapture("写周报!high", THU);
    expect(r.title).toBe("写周报");
    expect(r.importance).toBe("high");
  });

  it("中间的标记不动（无法判断是否属于标题）", () => {
    expect(parseCapture("写!high周报", THU).title).toBe("写!high周报");
  });
});

describe("parseCapture —— 组合与兜底", () => {
  it("三个标记可以同时用", () => {
    const r = parseCapture("写季度汇报 !high 明天 ~30m", THU);
    expect(r.title).toBe("写季度汇报");
    expect(r.importance).toBe("high");
    expect(r.due).toBe("2026-10-09");
    expect(r.estimateMinutes).toBe(30);
  });

  it("剥完只剩标记时，回退成原文，绝不产出空标题把内容吃掉", () => {
    expect(parseCapture("!high", THU).title).toBe("!high");
    expect(parseCapture("今天", THU).title).toBe("今天");
    expect(parseCapture("~15m", THU).title).toBe("~15m");
  });

  it("同一个输入永远得到同一个结果（纯函数）", () => {
    const a = parseCapture("写周报 !high 明天 ~15m", THU);
    const b = parseCapture("写周报 !high 明天 ~15m", THU);
    expect(a).toEqual(b);
  });

  it("不依赖真实时钟：today 必须由调用方传入", () => {
    // 同一个输入、不同的 today，日期解析结果必须随之变化
    expect(parseCapture("甲 今天", "2026-10-08").due).toBe("2026-10-08");
    expect(parseCapture("甲 今天", "2030-01-01").due).toBe("2030-01-01");
  });
});
