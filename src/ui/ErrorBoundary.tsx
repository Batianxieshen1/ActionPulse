import { Component, type ReactNode } from "react";
import { tr } from "../i18n";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 全局错误边界（审计路线图差距 6）：极端输入或数据结构异常时兜住整屏白屏。
 * 数据在 localStorage / 服务端，崩溃不丢——所以兜底页的第一句话就是告诉用户
 * 「刷新即可恢复」，并给出错误详情供排查。用类组件是 React 的硬性要求。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown): void {
    console.error("ActionPulse 界面异常：", error, info);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="ap-shell">
        <main className="ap-stage">
          <div className="w-full max-w-[420px] space-y-4 text-center">
            <p className="ap-t-lg font-semibold">{tr("error.title")}</p>
            <p className="ap-t-sm leading-6 text-[var(--text-dim)]">{tr("error.body")}</p>
            <div className="flex justify-center pt-1">
              <button
                type="button"
                className="ap-btn ap-btn--cta"
                data-variant="primary"
                onClick={() => window.location.reload()}
              >
                {tr("error.reload")}
              </button>
            </div>
            <details className="text-left">
              <summary className="ap-t-xs cursor-pointer select-none text-[var(--text-faint)]">
                {tr("error.details")}
              </summary>
              <pre className="ap-scroll mt-2 max-h-44 overflow-auto rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--control-bg)] p-2.5 ap-t-2xs leading-5 whitespace-pre-wrap">
                {String(this.state.error.stack ?? this.state.error.message ?? this.state.error)}
              </pre>
            </details>
          </div>
        </main>
      </div>
    );
  }
}
