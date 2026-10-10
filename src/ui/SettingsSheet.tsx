import { useRef, useState } from "react";
import { Download, Loader2, Plug, PlugZap, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { createBackup, parseBackup } from "../domain/validation";
import type { AppState, Settings, ThemePreference } from "../domain/types";
import type { LlmApi } from "../hooks/useLlmConfig";
import type { SyncApi } from "../hooks/useSync";

interface Props {
  state: AppState;
  onPatch: (patch: Partial<Settings>) => void;
  onImport: (state: AppState) => void;
  onReset: () => void;
  onClose: () => void;
  sync: SyncApi;
  llm: LlmApi;
}

const SYNC_LABEL: Record<string, string> = {
  idle: "未连接",
  connecting: "连接中",
  online: "已连接",
  offline: "服务未响应",
  unauthorized: "token 无效",
  error: "同步出错",
};

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start justify-between gap-3 py-2 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span className="min-w-0">
        <span className="block text-[13px]">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] leading-5 text-[var(--text-faint)]">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--pulse)]"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function SettingsSheet({ state, onPatch, onImport, onReset, onClose, sync, llm }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);

  const [llmBase, setLlmBase] = useState(llm.info?.baseUrl ?? "");
  const [llmModel, setLlmModel] = useState(llm.info?.model ?? "");
  const [llmKey, setLlmKey] = useState("");

  const exportBackup = () => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const blob = new Blob([JSON.stringify(createBackup(state), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `actionpulse-backup-${stamp}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setMessage({ kind: "ok", text: `已导出 ${state.tasks.length} 个任务` });
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    const result = parseBackup(text);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    onImport(result.state);
    setMessage({ kind: "ok", text: `已导入 ${result.state.tasks.length} 个任务（覆盖当前数据）` });
  };

  const tryConnect = () => {
    if (tokenDraft.trim().length < 8) {
      setConnectError("token 看起来不完整");
      return;
    }
    const ok = sync.connect(tokenDraft);
    setConnectError(ok ? null : "token 看起来不完整");
    if (ok) setTokenDraft("");
  };

  const saveLlm = async () => {
    const ok = await llm.save({ baseUrl: llmBase.trim(), apiKey: llmKey.trim(), model: llmModel.trim() });
    setMessage(
      ok
        ? { kind: "ok", text: "AI 配置已保存在本地服务端（Key 不会下发给浏览器）" }
        : { kind: "error", text: llm.error ?? "保存失败" },
    );
    if (ok) setLlmKey("");
  };

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "var(--scrim)" }} onClick={onClose} aria-hidden="true" />
      <aside className="ap-sheet" role="dialog" aria-modal="true" aria-label="设置与备份">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold">设置与备份</h2>
            <p className="ap-label mt-0.5">数据默认只在这台设备；连接同步后可多端共享</p>
          </div>
          <button type="button" className="ap-icon-btn" aria-label="关闭设置" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="ap-scroll flex-1 space-y-7 px-5 py-5">
          {/* ------------------------------- 外观 -------------------------------- */}
          <section>
            <h3 className="ap-label mb-1.5">外观</h3>
            <div className="flex rounded-[10px] border border-[var(--line)] p-0.5">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="ap-btn flex-1"
                  data-variant="ghost"
                  data-active={state.settings.theme === option.value ? "true" : undefined}
                  style={{ padding: "6px 8px", fontSize: 12 }}
                  onClick={() => onPatch({ theme: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-[var(--text-faint)]">
              「跟随系统」会随操作系统的深浅色自动切换。这个偏好只存在这台设备上，不会同步给手机 ——
              手机可以白天用浅色、电脑同时保持深色。
            </p>
          </section>

          {/* ------------------------------ 多端同步 ------------------------------ */}
          <section>
            <h3 className="ap-label mb-1.5">多端同步</h3>
            {sync.config ? (
              <div className="space-y-2.5">
                <div className="ap-card flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="flex items-center gap-2 text-[12.5px]">
                    <span className="ap-sync-dot" data-status={sync.status} />
                    {SYNC_LABEL[sync.status] ?? sync.status}
                  </span>
                  <span className="ap-mono text-[11px] text-[var(--text-faint)]">rev {sync.rev}</span>
                </div>
                {sync.lastError ? (
                  <p className="text-[11.5px]" style={{ color: "var(--tier-critical)" }}>
                    {sync.lastError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="ap-btn" onClick={sync.syncNow}>
                    <RefreshCw size={13} /> 立即同步
                  </button>
                  <button type="button" className="ap-btn" data-variant="danger" onClick={sync.disconnect}>
                    <Plug size={13} /> 断开同步
                  </button>
                </div>
                <p className="text-[11px] leading-5 text-[var(--text-faint)]">
                  任务、微步骤、完成状态会双向实时同步；音量、番茄钟时长等设置保持设备本地，互不影响。
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-[11.5px] leading-5 text-[var(--text-dim)]">
                  在电脑上运行 <code className="ap-mono">npm start</code>，终端会打印带 token 的地址。
                  用那个地址打开本页会自动完成配对；也可以手动粘贴 token：
                </p>
                <div className="flex gap-2">
                  <input
                    className="ap-input ap-mono"
                    style={{ fontSize: 12 }}
                    placeholder="粘贴配对 token"
                    value={tokenDraft}
                    onChange={(event) => setTokenDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") tryConnect();
                    }}
                  />
                  <button type="button" className="ap-btn" data-variant="primary" onClick={tryConnect}>
                    <PlugZap size={13} /> 连接
                  </button>
                </div>
                {connectError ? (
                  <p className="text-[11.5px]" style={{ color: "var(--tier-critical)" }}>
                    {connectError}
                  </p>
                ) : null}
                {sync.serverHere === false ? (
                  <p className="text-[11.5px]" style={{ color: "var(--tier-high)" }}>
                    当前页面不是由本地服务托管的（/api/health 无响应），同步与 AI 都不可用。纯手动访问
                    <code className="ap-mono"> npm run dev </code>或<code className="ap-mono"> npm start </code>。
                  </p>
                ) : null}
              </div>
            )}
          </section>

          {/* ------------------------------ AI 拆解 ------------------------------ */}
          <section>
            <h3 className="ap-label mb-1.5">AI 语义拆解</h3>
            <Toggle
              label="启用 AI 拆解"
              hint="关闭、未配置或调用失败时，自动回退到内置动词模板，功能不会不可用"
              checked={state.settings.aiBreakdown}
              onChange={(value) => onPatch({ aiBreakdown: value })}
            />

            {!sync.config ? (
              <p className="mt-1 text-[11.5px] text-[var(--text-faint)]">需要先连接本地服务才能配置 AI。</p>
            ) : (
              <div className="mt-2 space-y-2.5">
                {llm.info?.configured ? (
                  <div className="ap-card space-y-1 px-3 py-2.5 text-[11.5px]">
                    <div className="flex justify-between gap-3">
                      <span className="text-[var(--text-faint)]">模型</span>
                      <span className="ap-mono truncate">{llm.info.model}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[var(--text-faint)]">Base URL</span>
                      <span className="ap-mono truncate">{llm.info.baseUrl}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[var(--text-faint)]">API Key</span>
                      <span className="ap-mono">{llm.info.keyPreview}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[var(--text-faint)]">来源</span>
                      <span>{llm.info.source === "env" ? ".env（优先）" : "设置界面"}</span>
                    </div>
                  </div>
                ) : null}

                {llm.info?.editable === false ? (
                  <p className="text-[11.5px] text-[var(--text-faint)]">
                    配置来自服务器的 <code className="ap-mono">.env</code>，如需修改请编辑该文件后重启服务。
                  </p>
                ) : (
                  <>
                    <label className="block space-y-1">
                      <span className="ap-label block">Base URL</span>
                      <input
                        className="ap-input ap-mono"
                        style={{ fontSize: 12 }}
                        placeholder="https://api.openai.com/v1"
                        value={llmBase}
                        onChange={(event) => setLlmBase(event.target.value)}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="ap-label block">模型</span>
                      <input
                        className="ap-input ap-mono"
                        style={{ fontSize: 12 }}
                        placeholder="gpt-4o-mini / gemini-2.0-flash / qwen-plus …"
                        value={llmModel}
                        onChange={(event) => setLlmModel(event.target.value)}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="ap-label block">API Key</span>
                      <input
                        type="password"
                        className="ap-input ap-mono"
                        style={{ fontSize: 12 }}
                        placeholder={llm.info?.configured ? "留空则保留现有 Key" : "sk-…"}
                        value={llmKey}
                        onChange={(event) => setLlmKey(event.target.value)}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="ap-btn"
                        data-variant="primary"
                        disabled={llm.busy || llmKey.trim().length === 0}
                        onClick={() => void saveLlm()}
                      >
                        {llm.busy ? <Loader2 size={13} className="ap-spin" /> : null} 保存到本地服务
                      </button>
                      {llm.info?.configured ? (
                        <button type="button" className="ap-btn" data-variant="danger" onClick={() => void llm.clear()}>
                          <Trash2 size={13} /> 清除
                        </button>
                      ) : null}
                    </div>
                    <p className="text-[11px] leading-5 text-[var(--text-faint)]">
                      任何 OpenAI 兼容端点都可以：OpenAI、Gemini 的 OpenAI 兼容层、DeepSeek、Moonshot、
                      本地 Ollama / LM Studio。Key 只保存在这台电脑的本地服务里，不会下发给浏览器、也不经过局域网明文传输。
                    </p>
                  </>
                )}
                {llm.error ? (
                  <p className="text-[11.5px]" style={{ color: "var(--tier-critical)" }}>
                    {llm.error}
                  </p>
                ) : null}
              </div>
            )}
          </section>

          {/* ------------------------------- 反馈 -------------------------------- */}
          <section>
            <h3 className="ap-label mb-1">反馈</h3>
            <Toggle
              label="音效"
              hint="Web Audio 实时合成的水晶音，零网络请求"
              checked={state.settings.soundEnabled}
              onChange={(value) => onPatch({ soundEnabled: value })}
            />
            <div className="flex items-center gap-3 pb-2">
              <span className="text-[12px] text-[var(--text-dim)]">音量</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                className="flex-1 accent-[var(--pulse)]"
                value={state.settings.soundVolume}
                onChange={(event) => onPatch({ soundVolume: Number(event.target.value) })}
                aria-label="音量"
              />
              <span className="ap-mono w-8 text-right text-[11px] text-[var(--text-faint)]">
                {Math.round(state.settings.soundVolume * 100)}
              </span>
            </div>
            <Toggle
              label="礼花纸屑"
              hint="打勾时在点击位置喷射"
              checked={state.settings.confettiEnabled}
              onChange={(value) => onPatch({ confettiEnabled: value })}
            />
            <Toggle
              label="触感震动"
              hint="仅 Android 等支持 Vibration API 的设备生效"
              checked={state.settings.vibrationEnabled}
              onChange={(value) => onPatch({ vibrationEnabled: value })}
            />
            <Toggle
              label="打气语录"
              hint="完成后弹出一句正向反馈"
              checked={state.settings.encourageEnabled}
              onChange={(value) => onPatch({ encourageEnabled: value })}
            />
            <Toggle
              label="关闭全部动效"
              hint="系统「减弱动态效果」开启时会自动生效"
              checked={state.settings.reduceMotion}
              onChange={(value) => onPatch({ reduceMotion: value })}
            />
          </section>

          {/* ------------------------------- 专注 -------------------------------- */}
          <section>
            <h3 className="ap-label mb-1">专注</h3>
            <label className="flex items-center justify-between gap-3 py-2">
              <span className="text-[13px]">番茄钟时长</span>
              <select
                className="ap-select"
                value={state.settings.pomodoroMinutes}
                onChange={(event) => onPatch({ pomodoroMinutes: Number(event.target.value) })}
              >
                {[15, 25, 45, 60].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} 分钟
                  </option>
                ))}
              </select>
            </label>
          </section>

          {/* ------------------------------- 备份 -------------------------------- */}
          <section>
            <h3 className="ap-label mb-1">备份</h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="ap-btn" onClick={exportBackup}>
                <Download size={13} /> 导出 JSON
              </button>
              <button type="button" className="ap-btn" onClick={() => fileRef.current?.click()}>
                <Upload size={13} /> 导入 JSON
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void importFile(file);
                }}
              />
            </div>
            <p className="mt-2 text-[11px] leading-5 text-[var(--text-faint)]">
              导出永远是最后一道保险：即使同步服务停了、浏览器数据被清了，也能靠这份 JSON 恢复。
            </p>
            {message ? (
              <p
                className="mt-2 text-[11.5px]"
                style={{ color: message.kind === "ok" ? "var(--pulse)" : "var(--tier-critical)" }}
              >
                {message.text}
              </p>
            ) : null}
          </section>

          {/* ------------------------------- 数据 -------------------------------- */}
          <section>
            <h3 className="ap-label mb-1">数据</h3>
            <dl className="ap-mono grid grid-cols-2 gap-y-1.5 py-1 text-[11.5px]">
              <dt className="text-[var(--text-faint)]">任务总数</dt>
              <dd className="text-right">{state.tasks.length}</dd>
              <dt className="text-[var(--text-faint)]">累计完成</dt>
              <dd className="text-right">{state.stats.totalCompleted}</dd>
              <dt className="text-[var(--text-faint)]">最高连击</dt>
              <dd className="text-right">{state.stats.bestCombo}</dd>
              <dt className="text-[var(--text-faint)]">有记录天数</dt>
              <dd className="text-right">{state.stats.completionDates.length}</dd>
              <dt className="text-[var(--text-faint)]">删除墓碑</dt>
              <dd className="text-right">{Object.keys(state.tombstones).length}</dd>
            </dl>

            {confirmReset ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-[var(--text-dim)]">清空所有任务？不可撤销。</span>
                <button
                  type="button"
                  className="ap-btn"
                  style={{ color: "var(--tier-critical)" }}
                  onClick={() => {
                    onReset();
                    setConfirmReset(false);
                    setMessage({ kind: "ok", text: "已清空任务" });
                  }}
                >
                  确认清空
                </button>
                <button type="button" className="ap-btn" onClick={() => setConfirmReset(false)}>
                  取消
                </button>
              </div>
            ) : (
              <button type="button" className="ap-btn" data-variant="danger" onClick={() => setConfirmReset(true)}>
                清空全部任务
              </button>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
