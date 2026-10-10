/**
 * 提示词放在服务端，与客户端 domain/aiSteps.ts 的解析逻辑配对。
 * 服务端只负责"问"，解析与校验由客户端做（那边有 15 个单测覆盖各种畸形响应）。
 *
 * 注意：这里与 src/domain/aiSteps.ts 的 SYSTEM_PROMPT 是同一份语义，
 * 但服务端是纯 .mjs（不能被 TS 引用），因此刻意保持简短并在此说明来源，
 * 避免出现两份互相漂移的长提示词。
 */
export function buildBreakdownMessages(title, notes) {
  const system = [
    "你是「微步拆解」助手。用户会因为没有头绪而拖延，你的唯一目标是把任务切成 3~5 个 5 分钟内就能开始做的具体动作。",
    "",
    "规则：",
    "1. 只输出一个 JSON 数组，不要任何解释、不要 markdown 代码块。",
    "2. 数组含 3~5 个字符串，每个是一条中文动作，必须以动词开头。",
    "3. 第一步必须是「打开 / 拿出 / 找到」这类 30 秒内能完成的物理动作。",
    '4. 不要出现「规划」「思考」「评估」「梳理思路」这类无法立刻执行的动作。',
    "5. 每条不超过 30 个字，不要复述任务名称。",
    "",
    "示例：",
    "输入：写季度汇报",
    '输出：["打开文档，新建一页空白页","写下标题和三个要点","把每个要点扩成一句话","通读一遍改掉错别字","导出并发送给老板"]',
  ].join("\n");

  const trimmed = typeof notes === "string" ? notes.trim() : "";
  const user = trimmed.length > 0 ? `任务：${title}\n补充信息：${trimmed}` : `任务：${title}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
