import { Component, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "../../i18n";

function DeltaErrorFallback(props: { error: string; onReset: () => void }) {
  const { t } = useI18n();
  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid rgba(220,120,120,.6)",
        borderRadius: 10,
      }}
    >
      <strong>{t("Deltaパネルで例外が発生しました。")}</strong>
      <p style={{ margin: "8px 0", opacity: 0.85 }}>
        {t("会話本体は変更されていません。下の内容を控えて再解析できます。")}
      </p>
      <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
        {props.error}
      </pre>
      <button type="button" onClick={props.onReset}>
        {t("Delta UIを再試行")}
      </button>
    </div>
  );
}

export class DeltaErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message || String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Delta UI crashed", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <DeltaErrorFallback
          error={this.state.error}
          onReset={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
