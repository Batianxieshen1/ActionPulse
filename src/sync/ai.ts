/** 与本地服务的 AI 接口通信（Key 始终留在服务端）。 */
import type { SyncConfig } from "./session";

export interface LlmConfigInfo {
  configured: boolean;
  baseUrl: string;
  model: string;
  keyPreview: string;
  source: "env" | "file" | null;
  editable?: boolean;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body?.error === "string" && body.error.length > 0) return body.error;
  } catch {
    // 忽略
  }
  return `${fallback}（HTTP ${response.status}）`;
}

function headers(config: SyncConfig): Record<string, string> {
  return { "content-type": "application/json", authorization: `Bearer ${config.token}` };
}

export async function fetchLlmConfig(config: SyncConfig): Promise<LlmConfigInfo> {
  const response = await fetch(`${config.baseUrl}/api/llm/config`, { headers: headers(config), cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response, "读取 AI 配置失败"));
  return (await response.json()) as LlmConfigInfo;
}

export async function saveLlmConfig(
  config: SyncConfig,
  input: { baseUrl: string; apiKey: string; model: string },
): Promise<LlmConfigInfo> {
  const response = await fetch(`${config.baseUrl}/api/llm/config`, {
    method: "PUT",
    headers: headers(config),
    cache: "no-store",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response, "保存 AI 配置失败"));
  return (await response.json()) as LlmConfigInfo;
}

export async function clearLlmConfig(config: SyncConfig): Promise<LlmConfigInfo> {
  const response = await fetch(`${config.baseUrl}/api/llm/config`, {
    method: "DELETE",
    headers: headers(config),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await readError(response, "清除 AI 配置失败"));
  return (await response.json()) as LlmConfigInfo;
}

/** 只负责把服务端返回的原始文本取回来；解析由 domain/aiSteps.ts 完成（已有单测覆盖）。 */
export async function requestAiSteps(config: SyncConfig, title: string, notes: string): Promise<string[]> {
  const response = await fetch(`${config.baseUrl}/api/breakdown`, {
    method: "POST",
    headers: headers(config),
    cache: "no-store",
    body: JSON.stringify({ title, notes }),
  });
  if (!response.ok) throw new Error(await readError(response, "AI 拆解失败"));

  const body = (await response.json()) as { content?: string };
  const { parseBreakdownResponse } = await import("../domain/aiSteps");
  const parsed = parseBreakdownResponse(typeof body?.content === "string" ? body.content : "");
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.steps;
}
