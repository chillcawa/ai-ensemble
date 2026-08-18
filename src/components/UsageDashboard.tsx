import type { DisplayCurrency, UsageSummary, UsageTotals } from "../types/app";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { formatCostCurrency, formatTokens, providerLabel } from "../format";
import { PROVIDER_REGISTRY } from "../providers/registry";
import { useI18n } from "../i18n";

export function UsageDashboard({ usage, error, onRefresh, onClear, displayCurrency, currencyRate }: {
  usage: UsageSummary | null;
  error: string | null;
  onRefresh: () => Promise<void>;
  onClear: () => void;
  displayCurrency: DisplayCurrency;
  currencyRate: number;
}) {
  const { t, resolvedLocale } = useI18n();
  const [officialLinkError, setOfficialLinkError] = useState<string | null>(null);

  async function openOfficialUrl(url: string) {
    try {
      await invoke("open_official_provider_url", { url });
      setOfficialLinkError(null);
    } catch (err) {
      setOfficialLinkError(`${t("公式ページを開けませんでした")}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!usage) return <div className="usage-loading">{t("使用量を読み込み中...")}{error ? ` ${error}` : ""}</div>;
  return (
    <section className="usage-dashboard">
      <div className="usage-header">
        <strong>Usage / Cost</strong>
        <div>
          <button className="secondary-button" onClick={onRefresh}>{t("更新")}</button>
          <button className="secondary-button" onClick={onClear}>{t("履歴を削除")}</button>
        </div>
      </div>
      <div className="usage-cards">
        <UsageCard title={t("今日")} totals={usage.today} displayCurrency={displayCurrency} currencyRate={currencyRate} />
        <UsageCard title={t("累計")} totals={usage.all_time} displayCurrency={displayCurrency} currencyRate={currencyRate} />
      </div>
      <div className="usage-subsection">
        <div className="subsection-title">{t("公式Usage / Billing")}</div>
        <div className="official-usage-links">
          {PROVIDER_REGISTRY.filter((provider) => provider.runtimeStatus === "live" && (provider.officialUsageUrl || provider.officialBillingUrl)).map((provider) => (
            <div className="official-usage-row" key={`official-${provider.id}`}>
              <div>
                <strong>{provider.defaultNickname}</strong>
                <small>{provider.displayName}</small>
              </div>
              <div className="official-usage-actions">
                {provider.officialUsageUrl && (
                  <button className="secondary-button" type="button" onClick={() => void openOfficialUrl(provider.officialUsageUrl!)}>
                    {t("公式Usage")} ↗
                  </button>
                )}
                {provider.officialBillingUrl && provider.officialBillingUrl !== provider.officialUsageUrl && (
                  <button className="secondary-button" type="button" onClick={() => void openOfficialUrl(provider.officialBillingUrl!)}>
                    Billing ↗
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {officialLinkError && <div className="error usage-error">{officialLinkError}</div>}
        <small>{t("AI EnsembleのCostはローカル推定値です。最終的な請求・残高は各Providerの公式画面で確認してください。")}</small>
      </div>
      {usage.by_provider.length > 0 && (
        <div className="usage-subsection">
          <div className="subsection-title">{t("AI別累計")}</div>
          <div className="provider-summary">
            {usage.by_provider.map((p) => (
              <div key={p.provider}><strong>{providerLabel(p.provider)}</strong>：{p.requests} {t("回")} / {formatTokens(p.input_tokens + p.output_tokens)} tokens / {formatCostCurrency(p.cost_usd, displayCurrency, currencyRate)}</div>
            ))}
          </div>
        </div>
      )}
      {usage.recent.length > 0 && (
        <details className="history">
          <summary>{t("直近20件の使用履歴")}</summary>
          <div className="history-list">
            {usage.recent.map((record) => (
              <div className="history-record" key={record.id}>
                <div className="history-row">
                  <span>{new Date(`${record.created_at.replace(" ", "T")}Z`).toLocaleString(resolvedLocale)}</span>
                  <span>{providerLabel(record.provider)} / {record.model}</span>
                  <span>{formatTokens((record.input_tokens ?? 0) + (record.output_tokens ?? 0))} tokens</span>
                  <span>{record.cost_usd != null ? formatCostCurrency(record.cost_usd, displayCurrency, currencyRate) : "—"}</span>
                </div>
                {(record.cache_hit_input_tokens != null || record.cache_miss_input_tokens != null || record.pricing_basis) && (
                  <div className="usage-pricing-detail">
                    {record.cache_hit_input_tokens != null && <span>cache hit {formatTokens(record.cache_hit_input_tokens)}</span>}
                    {record.cache_miss_input_tokens != null && <span>miss {formatTokens(record.cache_miss_input_tokens)}</span>}
                    {record.pricing_basis && <span>{record.pricing_basis}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
      {error && <div className="error usage-error">{error}</div>}
    </section>
  );
}

function UsageCard({ title, totals, displayCurrency, currencyRate }: { title: string; totals: UsageTotals; displayCurrency: DisplayCurrency; currencyRate: number }) {
  return (
    <div className="usage-card">
      <div className="muted">{title}</div>
      <div className="usage-cost">{formatCostCurrency(totals.cost_usd, displayCurrency, currencyRate)}</div>
      <div className="muted">{totals.requests} requests · {formatTokens(totals.input_tokens + totals.output_tokens)} tokens</div>
      <div className="tiny">input {formatTokens(totals.input_tokens)} / output {formatTokens(totals.output_tokens)}</div>
    </div>
  );
}
