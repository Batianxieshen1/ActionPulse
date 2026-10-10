let sequence = 0;

/** 生成稳定前缀的唯一 id；优先用 crypto.randomUUID，降级到时间戳 + 自增 + 随机。 */
export function createId(prefix = "id"): string {
  sequence += 1;
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `${prefix}_${cryptoObj.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}${sequence.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
