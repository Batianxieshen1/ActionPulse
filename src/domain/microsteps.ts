/**
 * 微步拆解（PRD §4 模块3）。
 *
 * 规范要求「点击后展开 3~5 个子步骤」，但没有说明这些步骤从哪来。
 * 「纯前端 + 离线 + 零依赖」的约束排除了调用大模型，因此落地为
 * **内置动词模板匹配**：命中关键词就给出一套面向「启动阻力」的步骤，
 * 否则给通用兜底模板；用户始终可以手动增删改。
 */

export interface MicroStepMatch {
  /** 命中的模板 id，便于 UI 展示来源。 */
  ruleId: string;
  steps: string[];
}

interface MicroStepRule {
  id: string;
  test: RegExp;
  steps: () => string[];
}

const RULES: readonly MicroStepRule[] = [
  {
    id: "writing",
    test: /写|撰写|起草|汇报|周报|日报|月报|年报|文档|报告|文章|总结|方案|ppt|PPT|稿/,
    steps: () => [
      "打开编辑器，新建一页空白文档（先不管格式好不好看）",
      "写下标题，再随手敲三行要点，允许写得很烂",
      "把每一行要点扩成一句完整的话",
      "通读一遍，只改错别字和读不通的地方",
      "导出或粘贴到目标位置，然后发送",
    ],
  },
  {
    id: "messaging",
    test: /回复|邮件|消息|微信|联系|沟通|通知|答复|回信|电话|跟进/,
    steps: () => [
      "打开收件箱，把这条消息定位出来",
      "只写最关键的一句话回复，先不追求完整",
      "补上称呼和结尾，检查有没有漏答对方的问题",
      "点发送",
    ],
  },
  {
    id: "tidying",
    test: /整理|清理|归档|收拾|分类|删除|桌面|文件|照片|房间/,
    steps: () => [
      "清空一块巴掌大的空间，作为这次的工作区",
      "把最上面的 5 个东西归成三类：留着 / 扔掉 / 待定",
      "再来一轮，直到眼前这一堆见底",
      "把「留着」的放回固定位置",
    ],
  },
  {
    id: "meeting",
    test: /会议|评审|讨论|对接|面试|约|拜访/,
    steps: () => [
      "打开日历，确认时间、地点或线上链接",
      "写下这次必须拿到的唯一一个结论",
      "准备两个一定要问出口的问题",
      "提前十分钟把背景材料扫一遍",
    ],
  },
  {
    id: "learning",
    test: /学习|阅读|读书|课程|教程|研究|调研|复习|背/,
    steps: () => [
      "把要读的内容打开，翻到第一页",
      "先只读 5 分钟，允许自己随时停下",
      "用一句话记下刚读到的重点",
      "标记下次继续的位置，合上",
    ],
  },
  {
    id: "coding",
    test: /代码|开发|修复|bug|Bug|BUG|重构|实现|部署|联调|测试|上线/,
    steps: () => [
      "先稳定复现一次，把报错原文原样贴到注释里",
      "定位到真正出问题的那一个文件",
      "用一句话写下最小改动的思路",
      "改完立刻跑一次验证",
    ],
  },
  {
    id: "errand",
    test: /买|采购|下单|付款|缴纳|续费|预约|报销|寄/,
    steps: () => [
      "打开对应页面，把目标搜索出来",
      "只挑第一个满足条件的选项，别比价超过两分钟",
      "确认金额、地址和收件人",
      "提交并截图留存",
    ],
  },
  {
    id: "body",
    test: /锻炼|运动|跑步|健身|散步|拉伸|睡觉|喝水|休息/,
    steps: () => [
      "换上能活动的衣服和鞋",
      "先只做 5 分钟热身",
      "完成最低目标，哪怕只有一组",
      "记一笔，喝口水",
    ],
  },
];

const GENERIC_STEP_COUNT = 5;

function genericSteps(label: string): string[] {
  return [
    `把「${label}」改写成一个动词开头的短句`,
    "定义「完成」长什么样：一句话讲清做完的标志",
    "只做那个不超过 5 分钟的第一步",
    "中途停下时，记录一句当前进度",
    "收尾：确认完成，然后划掉它",
  ];
}

/** 匹配到的模板 id（UI 可据此展示「来自写作模板」）。 */
export function matchMicroStepRule(title: string): string {
  return matchRule(title).id;
}

function matchRule(title: string): { id: string; steps: string[] } {
  for (const rule of RULES) {
    if (rule.test.test(title)) return { id: rule.id, steps: rule.steps() };
  }
  return { id: "generic", steps: genericSteps(title.trim() || "这件事") };
}

/**
 * 生成 3~5 条微步骤。确定性：同一标题永远得到同一份结果。
 */
export function suggestMicroSteps(title: string): string[] {
  const normalized = title.trim();
  const matched = matchRule(normalized);
  const seen = new Set<string>();
  const steps: string[] = [];
  for (const step of matched.steps) {
    const trimmed = step.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    steps.push(trimmed);
    if (steps.length >= GENERIC_STEP_COUNT) break;
  }
  return steps;
}
