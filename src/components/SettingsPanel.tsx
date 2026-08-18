import { useRef, useState, type ChangeEvent } from "react";
import type { AIModel, ProviderId } from "../types/ai";
import type { DisplayCurrency, ProviderSlot, ThemeMode, UsageSummary } from "../types/app";
import { ConfirmModal } from "./ConfirmModal";
import { UsageDashboard } from "./UsageDashboard";
import { capabilityBadges } from "../models/capabilities";
import { providerImportSupport } from "../archive/registry";
import { isValidTimeZone, systemTimeZone, TIME_ZONE_SUGGESTIONS, type TimeZoneMode, type TurnOrder } from "../time/display";
import { PROVIDER_REGISTRY, providerDefinition } from "../providers/registry";
import { APP_VERSION } from "../version";
import { parseUserDataExport, type UserDataExportFile } from "../data/userDataTransfer";
import { NATIVE_LANGUAGE_LABELS, useI18n, type AppLocale } from "../i18n";

export function SettingsPanel({
  slots,
  theme,
  setTheme,
  timeZoneMode,
  setTimeZoneMode,
  manualTimeZone,
  setManualTimeZone,
  turnOrder,
  setTurnOrder,
  modelCatalogs,
  modelLoading,
  modelErrors,
  onUpdateSlot,
  onSaveKey,
  onDeleteKey,
  onRefreshModels,
  usage,
  usageError,
  onRefreshUsage,
  onClearUsage,
  displayCurrency,
  setDisplayCurrency,
  currencyRates,
  setCurrencyRates,
  onOpenTrialNotice,
  onExportData,
  onImportData,
}: {
  slots: ProviderSlot[];
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  timeZoneMode: TimeZoneMode;
  setTimeZoneMode: (mode: TimeZoneMode) => void;
  manualTimeZone: string;
  setManualTimeZone: (value: string) => void;
  turnOrder: TurnOrder;
  setTurnOrder: (value: TurnOrder) => void;
  modelCatalogs: Record<string, AIModel[]>;
  modelLoading: Record<string, boolean>;
  modelErrors: Record<string, string>;
  onUpdateSlot: (slotId: string, patch: Partial<ProviderSlot>) => void;
  onSaveKey: (slot: ProviderSlot) => Promise<void>;
  onDeleteKey: (slot: ProviderSlot) => Promise<void>;
  onRefreshModels: (provider: ProviderId) => Promise<void>;
  usage: UsageSummary | null;
  usageError: string | null;
  onRefreshUsage: () => Promise<void>;
  onClearUsage: () => Promise<void>;
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  currencyRates: Record<DisplayCurrency, number>;
  setCurrencyRates: (rates: Record<DisplayCurrency, number>) => void;
  onOpenTrialNotice: () => void;
  onExportData: () => Promise<string>;
  onImportData: (payload: UserDataExportFile) => Promise<void>;
}) {
  const { locale, setLocale, t } = useI18n();
  const [confirmSlot, setConfirmSlot] = useState<ProviderSlot | null>(null);
  const [confirmUsageClear, setConfirmUsageClear] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importCandidate, setImportCandidate] = useState<{ fileName: string; payload: UserDataExportFile } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  async function handleExportData() {
    setExportBusy(true);
    setExportPath(null);
    setExportError(null);
    try {
      setExportPath(await onExportData());
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExportBusy(false);
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportError(null);
    if (file.size > 100 * 1024 * 1024) {
      setImportError(t("100MBを超えるファイルはこのバージョンでは復元できません。"));
      return;
    }
    try {
      setImportCandidate({ fileName: file.name, payload: parseUserDataExport(await file.text()) });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  }

  async function confirmImportData() {
    const candidate = importCandidate;
    if (!candidate) return;
    setImportCandidate(null);
    setImportBusy(true);
    setImportError(null);
    try {
      await onImportData(candidate.payload);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
      setImportBusy(false);
    }
  }

  return (
    <section className="settings-panel">
      <div className="settings-title">{t("設定")}</div>

      <div className="settings-section">
        <h3>{t("言語")}</h3>
        <div className="settings-row">
          <label>{t("言語")}</label>
          <select value={locale} onChange={(event) => setLocale(event.target.value as AppLocale)}>
            <option value="system">{t("システム設定")}</option>
            <option value="ja">{NATIVE_LANGUAGE_LABELS.ja}</option>
            <option value="en">{NATIVE_LANGUAGE_LABELS.en}</option>
            <option value="zh-CN">{NATIVE_LANGUAGE_LABELS["zh-CN"]}</option>
            <option value="ko">{NATIVE_LANGUAGE_LABELS.ko}</option>
          </select>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t("外観")}</h3>
        <div className="segmented">
          {(["system", "light", "dark"] as ThemeMode[]).map((mode) => (
            <button key={mode} className={theme === mode ? "selected" : ""} onClick={() => setTheme(mode)}>
              {mode === "system" ? t("システム") : mode === "light" ? t("ライト") : t("ダーク")}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h3>{t("日時 / Conversation Log")}</h3>
        <div className="settings-row settings-timezone-row">
          <label>{t("タイムゾーン")}</label>
          <div>
            <div className="segmented">
              <button className={timeZoneMode === "system" ? "selected" : ""} onClick={() => setTimeZoneMode("system")}>{t("OS設定")}</button>
              <button className={timeZoneMode === "manual" ? "selected" : ""} onClick={() => setTimeZoneMode("manual")}>{t("手動指定")}</button>
            </div>
            <small>OS: {systemTimeZone()}</small>
            {timeZoneMode === "manual" && <>
              <input list="ai-ensemble-timezones" value={manualTimeZone} onChange={(e) => setManualTimeZone(e.target.value)} placeholder="Asia/Tokyo" />
              <datalist id="ai-ensemble-timezones">{TIME_ZONE_SUGGESTIONS.map((zone) => <option key={zone} value={zone} />)}</datalist>
              <small>{isValidTimeZone(manualTimeZone) ? `${t("表示")}: ${manualTimeZone}` : t("有効なIANA timezoneを入力してください（例: Asia/Tokyo）")}</small>
            </>}
          </div>
        </div>
        <div className="settings-row">
          <label>{t("Turn表示順")}</label>
          <select value={turnOrder} onChange={(e) => setTurnOrder(e.target.value as TurnOrder)}>
            <option value="oldest_first">{t("古い → 新しい（最新が下）")}</option>
            <option value="newest_first">{t("新しい → 古い（最新が上）")}</option>
          </select>
        </div>
        <small>{t("保存時刻は変更せず表示だけ変換します。Turn内部のUser→AIの順番は逆転しません。")}</small>
      </div>

      <div className="settings-section">
        <h3>{t("APIキー")}</h3>
        {slots.map((slot) => (
          <div className="settings-row api-key-settings-row" key={slot.id}>
            <label>{providerDefinition(slot.key).displayName}</label>
            {slot.keySaved ? (
              <div className="key-row settings-key-row">
                <span className="saved">{t("✓ キー保存済み")}</span>
                <button className="secondary-button" onClick={() => setConfirmSlot(slot)}>{t("削除")}</button>
              </div>
            ) : (
              <div className="key-row settings-key-row">
                <input
                  type="password"
                  placeholder={`${slot.label} API Key`}
                  value={slot.keyDraft}
                  onChange={(e) => onUpdateSlot(slot.id, { keyDraft: e.target.value })}
                />
                <button onClick={() => onSaveKey(slot)}>{t("保存")}</button>
              </div>
            )}
          </div>
        ))}
        <small>{t("APIキー本体はOSのCredential Storeに保存され、画面には表示されません。")}</small>
      </div>

      <div className="settings-section">
        <h3>{t("AI表示名")}</h3>
        {slots.map((slot) => (
          <div className="settings-row" key={slot.id}>
            <label>Provider: {slot.key}</label>
            <input value={slot.label} onChange={(e) => onUpdateSlot(slot.id, { label: e.target.value })} />
          </div>
        ))}
        <small>{t("表示名だけを変更します。内部のProvider / Model / Slot IDは変わりません。")}</small>
      </div>

      <div className="settings-section">
        <h3>{t("表示通貨")}</h3>
        <div className="settings-row">
          <label>{t("通貨")}</label>
          <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value as DisplayCurrency)}>
            {(["USD", "JPY", "EUR", "GBP", "CNY", "KRW"] as DisplayCurrency[]).map((currency) => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
        </div>
        {displayCurrency !== "USD" && (
          <div className="settings-row">
            <label>1 USD =</label>
            <div className="currency-rate-editor">
              <input
                type="number"
                min="0"
                step="0.0001"
                value={currencyRates[displayCurrency] || ""}
                placeholder={t("レートを入力")}
                onChange={(e) => setCurrencyRates({
                  ...currencyRates,
                  [displayCurrency]: Math.max(0, Number(e.target.value) || 0),
                })}
              />
              <span>{displayCurrency}</span>
            </div>
          </div>
        )}
        <small>{t("内部価格はUSDで保持し、表示時だけ選択通貨へ換算します。為替レートは手動設定です。")}</small>
        {displayCurrency !== "USD" && !(currencyRates[displayCurrency] > 0) && (
          <small className="context-warning">{t("為替レートが未設定のため、換算額は表示されません。")}</small>
        )}
      </div>

      <div className="settings-section">
        <h3>{t("モデル")}</h3>
        {slots.map((slot) => {
          const models = modelCatalogs[slot.key] ?? [slot.model];
          return (
            <div className="model-row model-row-editor" key={slot.id}>
              <strong>{slot.label}</strong>
              <select value={slot.model.id} onChange={(e) => {
                const next = models.find((m) => m.id === e.target.value);
                if (next?.capabilities.availableNow) onUpdateSlot(slot.id, { model: next });
              }}>
                {models.map((model) => (
                  <option key={model.id} value={model.id} disabled={!model.capabilities.availableNow}>
                    {model.name} — {model.id}{model.capabilities.availableNow ? "" : ` (${t("このAdapterでは未対応")})`}
                  </option>
                ))}
              </select>
              <div className="settings-model-capabilities">
                {capabilityBadges(slot.model).map((badge) => (
                  <span key={badge.label} className={`capability-badge ${badge.tone}`}>{badge.label}</span>
                ))}
                <small>{t("情報源")}: {slot.model.capabilities.source}</small>
              </div>
              <button className="secondary-button" disabled={!slot.keySaved || modelLoading[slot.key]} onClick={() => onRefreshModels(slot.key)}>
                {modelLoading[slot.key] ? t("取得中...") : t("モデル一覧を更新")}
              </button>
              {modelErrors[slot.key] && <small className="error">{modelErrors[slot.key]}</small>}
            </div>
          );
        })}
        <small>{t("APIキーで取得したモデルを能力情報付きで表示します。「このAdapterでは未対応」は課金・カード状態ではなく、AI Ensemble側の接続方式の対応状況です。能力情報がAPIから直接得られない項目は inferred として明示します。")}</small>
      </div>

      <div className="settings-section">
        <h3>{t("Provider Registry")}</h3>
        <div className="provider-registry-list">
          {PROVIDER_REGISTRY.map((provider) => {
            const importSupport = providerImportSupport(provider.id);
            const live = provider.runtimeStatus === "live";
            return (
              <div className="provider-registry-row" key={`registry-${provider.id}`}>
                <div>
                  <strong>{provider.defaultNickname}</strong>
                  <small>{provider.displayName} / {provider.id}</small>
                </div>
                <div className="provider-registry-badges">
                  <span className={`capability-badge ${live ? "positive" : "muted"}`}>
                    {live ? "Runtime: Live" : "Runtime: Planned"}
                  </span>
                  <span className={`capability-badge ${provider.modelDiscovery === "live" ? "positive" : "muted"}`}>
                    Models: {provider.modelDiscovery === "live" ? "Live" : "Planned"}
                  </span>
                  <span className={`capability-badge ${importSupport.status === "dedicated" ? "positive" : "neutral"}`}>
                    Import: {importSupport.status === "dedicated" ? "Dedicated" : "Generic"}
                  </span>
                  {provider.billingMode && (
                    <span className={`capability-badge ${provider.billingMode === "free_tier_available" ? "positive" : "neutral"}`}>
                      Billing: {provider.billingMode === "free_tier_available" ? t("Free Tierあり") : provider.billingMode}
                    </span>
                  )}
                </div>
                <small>
                  API: {provider.apiModes.join(" / ")}
                  {!live ? ` ・ ${t("既知Providerとして登録済み。APIキー入力や送信はまだ有効化しません。")}` : ""}
                </small>
                {provider.billingNote && <small>{t(provider.billingNote)}</small>}
              </div>
            );
          })}
        </div>
        <small>{t("Registryへの登録 ≠ Providerが利用可能。Runtime / Model Discovery / Import Adapterを別々に表示し、未実装Providerを誤って送信対象にしません。")}</small>
      </div>

      <div className="settings-section">
        <h3>{t("Conversation Import 翻訳機")}</h3>
        {slots.map((slot) => {
          const support = providerImportSupport(slot.key);
          return (
            <div className="settings-row import-adapter-row" key={`import-${slot.id}`}>
              <label>{slot.label}</label>
              <div>
                {support.status === "dedicated" ? (
                  <>
                    <strong>✓ {t("専用Adapter")}</strong>
                    <div className="settings-import-adapters">
                      {support.dedicated.map((adapter) => <span className="capability-badge good" key={adapter.id}>{adapter.displayName}</span>)}
                    </div>
                  </>
                ) : (
                  <>
                    <strong>{t("汎用Adapterのみ")}</strong>
                    <div className="settings-import-adapters">
                      {support.generic.map((adapter) => <span className="capability-badge neutral" key={adapter.id}>{adapter.displayName}</span>)}
                    </div>
                  </>
                )}
                <small>{t("Providerが追加されるとRegistryから対応翻訳機を自動発見します。専用Adapterが無い場合もGeneric JSON / Markdown / Textを利用できます。")}</small>
              </div>
            </div>
          );
        })}
      </div>

      <div className="settings-section">
        <h3>{t("Usage / Cost")}</h3>
        <UsageDashboard usage={usage} error={usageError} onRefresh={onRefreshUsage} onClear={() => setConfirmUsageClear(true)} displayCurrency={displayCurrency} currencyRate={displayCurrency === "USD" ? 1 : currencyRates[displayCurrency]} />
      </div>

      <div className="settings-section">
        <h3>{t("データの移行 / バックアップ")}</h3>
        <div className="data-transfer-actions">
          <button className="secondary-button" disabled={exportBusy || importBusy} onClick={() => void handleExportData()}>
            {exportBusy ? t("書き出し中…") : t("対話ログ・個人設定を書き出す")}
          </button>
          <button className="secondary-button" disabled={exportBusy || importBusy} onClick={() => importInputRef.current?.click()}>
            {importBusy ? t("復元中…") : t("書き出しファイルから復元")}
          </button>
          <input ref={importInputRef} className="data-transfer-file-input" type="file" accept=".json,application/json" onChange={(event) => void handleImportFile(event)} />
        </div>
        <small>{t("Conversation、AI回答、Context、Project、Archive、Usage、Text Pad、表示設定を1つのJSONで移行します。Credential Storeに保存したAPIキーは書き出し・復元の対象外です。")}</small>
        <small>{t("復元すると、現在の対話ログと対象データ・個人設定をファイルの内容で全置換します。現在PCのAPIキーは維持します。")}</small>
        <small>{t("会話やContext本文へ自分で入力したAPIキー等の文字列は自動検出・削除されません。")}</small>
        <small className="export-data-warning">{t("書き出しファイルには機密情報が含まれる可能性があります。共有先に注意し、復元前には現在のデータも書き出してください。")}</small>
        {exportPath && <div className="saved export-data-result">✓ {t("ダウンロードへ保存しました")}: {exportPath}</div>}
        {exportError && <div className="error export-data-result">{t("書き出しに失敗しました")}: {exportError}</div>}
        {importError && <div className="error export-data-result">{t("復元に失敗しました")}: {importError}</div>}
      </div>

      <div className="settings-section">
        <h3>{t("アプリ情報")}</h3>
        <div className="settings-row">
          <label>{t("バージョン")}</label>
          <strong>AI Ensemble — ECHO v{APP_VERSION}</strong>
        </div>
        <button className="secondary-button" onClick={onOpenTrialNotice}>{t("利用上の注意を再表示")}</button>
        <small>{t("個人開発のアプリです。不具合や使いにくい点のフィードバックを歓迎します。")}</small>
      </div>

      <ConfirmModal
        open={confirmSlot !== null}
        title={t("APIキーを削除")}
        message={t("APIキー削除確認", { name: confirmSlot?.label ?? t("このAI") })}
        onCancel={() => setConfirmSlot(null)}
        onConfirm={() => {
          const slot = confirmSlot;
          setConfirmSlot(null);
          if (slot) void onDeleteKey(slot);
        }}
      />
      <ConfirmModal
        open={confirmUsageClear}
        title={t("Usage履歴を削除")}
        message={t("保存されているUsage / Cost履歴をすべて削除しますか？")}
        onCancel={() => setConfirmUsageClear(false)}
        onConfirm={() => {
          setConfirmUsageClear(false);
          void onClearUsage();
        }}
      />
      <ConfirmModal
        open={importCandidate !== null}
        title={t("現在のデータを上書きして復元")}
        message={t("復元確認詳細", { name: importCandidate?.fileName ?? t("選択したファイル") })}
        confirmLabel={t("上書きして復元")}
        onCancel={() => setImportCandidate(null)}
        onConfirm={() => void confirmImportData()}
      />
    </section>
  );
}
