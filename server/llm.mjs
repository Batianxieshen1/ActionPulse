/**
 * OpenAI 兼容的语义拆解代理（可选能力）。
 *
 * 关键决策：**API Key 只存在服务端**，不回传给浏览器。
 *  - 手机不用重复输入 Key；
 *  - Key 不会在局域网上反复明文传输；
 *  - 也就不存在浏览器直连大模型的 CORS 问题。
 * 配置来源优先级：环境变量（.env）> data/llm.json。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const TIMEOUT_MS = 20_000;

function maskKey(key) {
  if (typeof key !== "string" || key.length === 0) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

function normalizeBaseUrl(value) {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/, "");
}

export function createLlm({ dataFile, env = {} }) {
  function fromEnv() {
    const baseUrl = normalizeBaseUrl(env.AP_LLM_BASE_URL);
    const apiKey = String(env.AP_LLM_API_KEY ?? "").trim();
    const model = String(env.AP_LLM_MODEL ?? "").trim();
    if (baseUrl && apiKey && model) return { baseUrl, apiKey, model, source: "env" };
    return null;
  }

  function fromFile() {
    try {
      const parsed = JSON.parse(readFileSync(dataFile, "utf8"));
      const baseUrl = normalizeBaseUrl(parsed?.baseUrl);
      const apiKey = String(parsed?.apiKey ?? "").trim();
      const model = String(parsed?.model ?? "").trim();
      if (baseUrl && apiKey && model) return { baseUrl, apiKey, model, source: "file" };
    } catch {
      // 没配置过
    }
    return null;
  }

  function config() {
    return fromEnv() ?? fromFile();
  }

  /** 对外只暴露掩码后的信息，绝不回传明文 Key。 */
  function publicConfig() {
    const active = config();
    if (!active) return { configured: false, baseUrl: "", model: "", keyPreview: "", source: null };
    return {
      configured: true,
      baseUrl: active.baseUrl,
      model: active.model,
      keyPreview: maskKey(active.apiKey),
      // env 来源时不允许在 UI 里覆盖，避免"改了没生效"的困惑
      source: active.source,
      editable: active.source !== "env",
    };
  }

  function saveConfig(input) {
    const baseUrl = normalizeBaseUrl(input?.baseUrl);
    const apiKey = String(input?.apiKey ?? "").trim();
    const model = String(input?.model ?? "").trim();
    const invalid = (message) => {
      const error = new Error(message);
      error.code = "bad_config";
      return error;
    };
    if (!/^https?:\/\//.test(baseUrl)) throw invalid("Base URL 必须是以 http(s):// 开头的完整地址");
    if (apiKey.length < 8) throw invalid("API Key 看起来不完整");
    if (model.length === 0) throw invalid("必须填写模型名");
    mkdirSync(dirname(dataFile), { recursive: true });
    writeFileSync(dataFile, JSON.stringify({ baseUrl, apiKey, model }, null, 2), { mode: 0o600 });
    return publicConfig();
  }

  function clearConfig() {
    if (existsSync(dataFile)) rmSync(dataFile, { force: true });
    return publicConfig();
  }

  /** 调上游拿一段文本；解析与校验交给客户端的 parseBreakdownResponse（已有单测覆盖）。 */
  async function complete(messages) {
    const active = config();
    if (!active) {
      const error = new Error("尚未配置 AI，请先在设置里填写 Base URL / API Key / 模型");
      error.code = "not_configured";
      throw error;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetch(`${active.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${active.apiKey}`,
        },
        body: JSON.stringify({ model: active.model, messages, temperature: 0.4 }),
        signal: controller.signal,
      });
    } catch (cause) {
      const error = new Error(
        cause?.name === "AbortError" ? "调用大模型超时" : `无法连接大模型：${cause?.message ?? cause}`,
      );
      error.code = "upstream_unreachable";
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const error = new Error(`大模型返回 ${response.status}：${text.slice(0, 300)}`);
      error.code = "upstream_error";
      throw error;
    }

    const data = await response.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      const error = new Error("大模型响应里没有可用的文本内容");
      error.code = "upstream_empty";
      throw error;
    }
    return content;
  }

  return { config, publicConfig, saveConfig, clearConfig, complete, configured: () => config() !== null };
}
