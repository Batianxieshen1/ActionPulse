import { useCallback, useEffect, useState } from "react";
import { clearLlmConfig, fetchLlmConfig, saveLlmConfig, type LlmConfigInfo } from "../sync/ai";
import type { SyncConfig } from "../sync/session";

export interface LlmApi {
  info: LlmConfigInfo | null;
  error: string | null;
  busy: boolean;
  reload: () => void;
  save: (input: { baseUrl: string; apiKey: string; model: string }) => Promise<boolean>;
  clear: () => Promise<void>;
}

export function useLlmConfig(config: SyncConfig | null): LlmApi {
  const [info, setInfo] = useState<LlmConfigInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    if (!config) {
      setInfo(null);
      return;
    }
    void (async () => {
      try {
        setInfo(await fetchLlmConfig(config));
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
  }, [config]);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(
    async (input: { baseUrl: string; apiKey: string; model: string }) => {
      if (!config) return false;
      setBusy(true);
      try {
        setInfo(await saveLlmConfig(config, input));
        setError(null);
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [config],
  );

  const clear = useCallback(async () => {
    if (!config) return;
    setBusy(true);
    try {
      setInfo(await clearLlmConfig(config));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [config]);

  return { info, error, busy, reload, save, clear };
}
