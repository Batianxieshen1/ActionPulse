import { useRef, useState } from "react";
import { Download, Loader2, Plug, PlugZap, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { createBackup, parseBackup } from "../domain/validation";
import type { AppState, Language, Settings, ThemePreference } from "../domain/types";
import type { LlmApi } from "../hooks/useLlmConfig";
import type { SyncApi } from "../hooks/useSync";
import { useT } from "../i18n";

interface Props {
  state: AppState;
  onPatch: (patch: Partial<Settings>) => void;
  onImport: (state: AppState) => void;
  onReset: () => void;
  onClose: () => void;
  sync: SyncApi;
  llm: LlmApi;
}

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
        <span className="block ap-t-base">{label}</span>
        {hint ? <span className="mt-0.5 block ap-t-xs leading-5 text-[var(--text-faint)]">{hint}</span> : null}
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
  const t = useT();
  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: "system", label: t("settings.themeSystem") },
    { value: "light", label: t("settings.themeLight") },
    { value: "dark", label: t("settings.themeDark") },
  ];
  // 语言选项用各自的原生名（中文界面写「中文」，英文界面也写「中文」）——语言名不翻译是惯例
  const languageOptions: { value: Language; label: string }[] = [
    { value: "zh", label: "中文" },
    { value: "en", label: "English" },
  ];
  // 同步状态短标签（区别于横幅用的 sync.* 长文案）。
  const syncLabel: Record<string, string> = {
    idle: t("syncLabel.idle"),
    connecting: t("syncLabel.connecting"),
    online: t("syncLabel.online"),
    offline: t("syncLabel.offline"),
    unauthorized: t("syncLabel.unauthorized"),
    error: t("syncLabel.error"),
  };
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
    setMessage({ kind: "ok", text: t("settings.exportDone", { n: state.tasks.length }) });
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    const result = parseBackup(text);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    onImport(result.state);
    setMessage({ kind: "ok", text: t("settings.importOverwrite", { n: result.state.tasks.length }) });
  };

  const tryConnect = () => {
    if (tokenDraft.trim().length < 8) {
      setConnectError(t("settings.tokenInvalid"));
      return;
    }
    const ok = sync.connect(tokenDraft);
    setConnectError(ok ? null : t("settings.tokenInvalid"));
    if (ok) setTokenDraft("");
  };

  const saveLlm = async () => {
    const ok = await llm.save({ baseUrl: llmBase.trim(), apiKey: llmKey.trim(), model: llmModel.trim() });
    setMessage(
      ok
        ? { kind: "ok", text: t("settings.llmSaved") }
        : { kind: "error", text: llm.error ?? t("settings.exportFailed") },
    );
    if (ok) setLlmKey("");
  };

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "var(--scrim)" }} onClick={onClose} aria-hidden="true" />
      <aside className="ap-sheet" role="dialog" aria-modal="true" aria-label={t("header.settings")}>
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div>
            <h2 className="ap-t-md font-semibold">{t("header.settings")}</h2>
            <p className="ap-label mt-0.5">{t("settings.syncIntro")}</p>
          </div>
          <button type="button" className="ap-icon-btn" aria-label={t("settings.close")} onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="ap-scroll flex-1 space-y-7 px-5 py-5">
          {/* ------------------------------- 外观 -------------------------------- */}
          <section>
            <h3 className="ap-label mb-1.5">{t("settings.theme")}</h3>
            <div className="flex rounded-[10px] border border-[var(--line)] p-0.5">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="ap-btn flex-1"
                  data-variant="ghost"
                  data-active={state.settings.theme === option.value ? "true" : undefined}
                  style={{ padding: "6px 8px", fontSize: "var(--fs-sm)" }}
                  onClick={() => onPatch({ theme: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 ap-t-xs leading-5 text-[var(--text-faint)]">
              {t("settings.themeNoteLong")}
            </p>
          </section>

          {/* ------------------------------- 语言 -------------------------------- */}
          <section>
            <h3 className="ap-label mb-1.5">{t("settings.language")}</h3>
            <div className="flex rounded-[10px] border border-[var(--line)] p-0.5">
              {languageOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="ap-btn flex-1"
                  data-variant="ghost"
                  data-active={state.settings.language === option.value ? "true" : undefined}
                  style={{ padding: "6px 8px", fontSize: "var(--fs-sm)" }}
                  onClick={() => onPatch({ language: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 ap-t-xs leading-5 text-[var(--text-faint)]">{t("settings.languageNote")}</p>
          </section>

          {/* ------------------------------ 多端同步 ------------------------------ */}
          <section>
            <h3 className="ap-label mb-1.5">{t("settings.sync")}</h3>
            {sync.config ? (
              <div className="space-y-2.5">
                <div className="ap-card flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="flex items-center gap-2 ap-t-sm">
                    <span className="ap-sync-dot" data-status={sync.status} />
                    {syncLabel[sync.status] ?? sync.status}
                  </span>
                  <span className="ap-mono ap-t-xs text-[var(--text-faint)]">rev {sync.rev}</span>
                </div>
                {sync.lastError ? (
                  <p className="ap-t-xs" style={{ color: "var(--tier-critical)" }}>
                    {sync.lastError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="ap-btn" onClick={sync.syncNow}>
                    <RefreshCw size={13} /> {t("sync.now")}
                  </button>
                  <button type="button" className="ap-btn" data-variant="danger" onClick={sync.disconnect}>
                    <Plug size={13} /> {t("sync.disconnect")}
                  </button>
                </div>
                <p className="ap-t-xs leading-5 text-[var(--text-faint)]">{t("settings.syncLongNote")}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="ap-t-xs leading-5 text-[var(--text-dim)]">{t("settings.pairGuide")}</p>
                <div className="flex gap-2">
                  <input
                    className="ap-input ap-mono"
                    style={{ fontSize: "var(--fs-sm)" }}
                    placeholder={t("settings.tokenLabel")}
                    value={tokenDraft}
                    onChange={(event) => setTokenDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") tryConnect();
                    }}
                  />
                  <button type="button" className="ap-btn" data-variant="primary" onClick={tryConnect}>
                    <PlugZap size={13} /> {t("settings.connect")}
                  </button>
                </div>
                {connectError ? (
                  <p className="ap-t-xs" style={{ color: "var(--tier-critical)" }}>
                    {connectError}
                  </p>
                ) : null}
                {sync.serverHere === false ? (
                  <p className="ap-t-xs" style={{ color: "var(--tier-high)" }}>
                    {t("settings.unmanagedWarn")}
                  </p>
                ) : null}
              </div>
            )}
          </section>

          {/* ------------------------------ AI 拆解 ------------------------------ */}
          <section>
            <h3 className="ap-label mb-1.5">{t("settings.aiConfig")}</h3>
            <Toggle
              label={t("settings.aiEnable")}
              hint={t("settings.aiFallbackNote")}
              checked={state.settings.aiBreakdown}
              onChange={(value) => onPatch({ aiBreakdown: value })}
            />

            {!sync.config ? (
              <p className="mt-1 ap-t-xs text-[var(--text-faint)]">{t("settings.aiNeedConnect")}</p>
            ) : (
              <div className="mt-2 space-y-2.5">
                {llm.info?.configured ? (
                  <div className="ap-card space-y-1 px-3 py-2.5 ap-t-xs">
                    <div className="flex justify-between gap-3">
                      <span className="text-[var(--text-faint)]">{t("settings.llmModel")}</span>
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
                      <span className="text-[var(--text-faint)]">{t("settings.source")}</span>
                      <span>{llm.info.source === "env" ? t("settings.llmEnvNote") : t("misc.panelLabel")}</span>
                    </div>
                  </div>
                ) : null}

                {llm.info?.editable === false ? (
                  <p className="ap-t-xs text-[var(--text-faint)]">{t("settings.envNote")}</p>
                ) : (
                  <>
                    <label className="block space-y-1">
                      <span className="ap-label block">Base URL</span>
                      <input
                        className="ap-input ap-mono"
                        style={{ fontSize: "var(--fs-sm)" }}
                        placeholder="https://api.openai.com/v1"
                        value={llmBase}
                        onChange={(event) => setLlmBase(event.target.value)}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="ap-label block">{t("settings.llmModel")}</span>
                      <input
                        className="ap-input ap-mono"
                        style={{ fontSize: "var(--fs-sm)" }}
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
                        style={{ fontSize: "var(--fs-sm)" }}
                        placeholder={llm.info?.configured ? t("settings.llmKeyPlaceholder") : "sk-…"}
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
                        {llm.busy ? <Loader2 size={13} className="ap-spin" /> : null} {t("settings.saveLocal")}
                      </button>
                      {llm.info?.configured ? (
                        <button type="button" className="ap-btn" data-variant="danger" onClick={() => void llm.clear()}>
                          <Trash2 size={13} /> {t("settings.clearShort")}
                        </button>
                      ) : null}
                    </div>
                    <p className="ap-t-xs leading-5 text-[var(--text-faint)]">{t("settings.openaiNote")}</p>
                  </>
                )}
                {llm.error ? (
                  <p className="ap-t-xs" style={{ color: "var(--tier-critical)" }}>
                    {llm.error}
                  </p>
                ) : null}
              </div>
            )}
          </section>

          {/* ------------------------------- 反馈 -------------------------------- */}
          <section>
            <h3 className="ap-label mb-1">{t("settings.feedback")}</h3>
            <Toggle
              label={t("settings.sound")}
              hint={t("settings.soundNote")}
              checked={state.settings.soundEnabled}
              onChange={(value) => onPatch({ soundEnabled: value })}
            />
            <div className="flex items-center gap-3 pb-2">
              <span className="ap-t-sm text-[var(--text-dim)]">{t("settings.volume")}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                className="flex-1 accent-[var(--pulse)]"
                value={state.settings.soundVolume}
                onChange={(event) => onPatch({ soundVolume: Number(event.target.value) })}
                aria-label={t("settings.volume")}
              />
              <span className="ap-mono w-8 text-right ap-t-xs text-[var(--text-faint)]">
                {Math.round(state.settings.soundVolume * 100)}
              </span>
            </div>
            <Toggle
              label={t("settings.confetti")}
              hint={t("settings.confettiNote")}
              checked={state.settings.confettiEnabled}
              onChange={(value) => onPatch({ confettiEnabled: value })}
            />
            <Toggle
              label={t("settings.vibration")}
              hint={t("settings.vibrationNote")}
              checked={state.settings.vibrationEnabled}
              onChange={(value) => onPatch({ vibrationEnabled: value })}
            />
            <Toggle
              label={t("settings.encourage")}
              hint={t("settings.encourageNote")}
              checked={state.settings.encourageEnabled}
              onChange={(value) => onPatch({ encourageEnabled: value })}
            />
            <Toggle
              label={t("settings.reduceMotion")}
              hint={t("settings.reduceMotionNote")}
              checked={state.settings.reduceMotion}
              onChange={(value) => onPatch({ reduceMotion: value })}
            />
          </section>

          {/* ------------------------------- 专注 -------------------------------- */}
          <section>
            <h3 className="ap-label mb-1">{t("settings.sectionFocus")}</h3>
            <label className="flex items-center justify-between gap-3 py-2">
              <span className="ap-t-base">{t("settings.pomodoro")}</span>
              <select
                className="ap-select"
                value={state.settings.pomodoroMinutes}
                onChange={(event) => onPatch({ pomodoroMinutes: Number(event.target.value) })}
              >
                {[15, 25, 45, 60].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} {t("settings.pomodoroUnit")}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {/* ------------------------------- 备份 -------------------------------- */}
          <section>
            <h3 className="ap-label mb-1">{t("settings.sectionBackup")}</h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="ap-btn" onClick={exportBackup}>
                <Download size={13} /> {t("settings.export")}
              </button>
              <button type="button" className="ap-btn" onClick={() => fileRef.current?.click()}>
                <Upload size={13} /> {t("settings.import")}
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
            <p className="mt-2 ap-t-xs leading-5 text-[var(--text-faint)]">
              {t("settings.backupNote")}
            </p>
            {message ? (
              <p
                className="mt-2 ap-t-xs"
                style={{ color: message.kind === "ok" ? "var(--pulse)" : "var(--tier-critical)" }}
              >
                {message.text}
              </p>
            ) : null}
          </section>

          {/* ------------------------------- 数据 -------------------------------- */}
          <section>
            <h3 className="ap-label mb-1">{t("settings.data")}</h3>
            <dl className="ap-mono grid grid-cols-2 gap-y-1.5 py-1 ap-t-xs">
              <dt className="text-[var(--text-faint)]">{t("settings.statTasks")}</dt>
              <dd className="text-right">{state.tasks.length}</dd>
              <dt className="text-[var(--text-faint)]">{t("stage.stats.total")}</dt>
              <dd className="text-right">{state.stats.totalCompleted}</dd>
              <dt className="text-[var(--text-faint)]">{t("settings.statBestCombo")}</dt>
              <dd className="text-right">{state.stats.bestCombo}</dd>
              <dt className="text-[var(--text-faint)]">{t("settings.statDays")}</dt>
              <dd className="text-right">{state.stats.completionDates.length}</dd>
              <dt className="text-[var(--text-faint)]">{t("settings.statTombstones")}</dt>
              <dd className="text-right">{Object.keys(state.tombstones).length}</dd>
            </dl>

            {confirmReset ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="ap-t-sm text-[var(--text-dim)]">{t("settings.wipeWarn")}</span>
                <button
                  type="button"
                  className="ap-btn"
                  style={{ color: "var(--tier-critical)" }}
                  onClick={() => {
                    onReset();
                    setConfirmReset(false);
                    setMessage({ kind: "ok", text: t("settings.wipeDone") });
                  }}
                >
                  {t("settings.wipeConfirm")}
                </button>
                <button type="button" className="ap-btn" onClick={() => setConfirmReset(false)}>
                  {t("common.cancel")}
                </button>
              </div>
            ) : (
              <button type="button" className="ap-btn" data-variant="danger" onClick={() => setConfirmReset(true)}>
                {t("settings.wipeAction")}
              </button>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
