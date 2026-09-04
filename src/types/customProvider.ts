// [Phase CP-1 MVP] Custom Provider（ユーザー追加のOpenAI互換エンドポイント）の設定型。
//
// 設計方針: 既存の ProviderSlot / ProviderId とは完全に独立させる。
// providerDefinition() / catalogForSlot() / INITIAL_MODEL_CATALOGS 等、
// 固定9社のenum(ProviderId)を前提にしたコードには一切触れない。
// Custom Providerは並行する別のデータ構造として扱い、UI・送信処理の
// 合流ポイント(App.tsxのtargets構築、ResultBoardでの表示)でのみ橋渡しする。

export interface CustomProviderConfig {
  /** 安定した一意ID。keychainのprovider識別子・stream_runs.provider・
   *  BroadcastTarget.slotIdとして使う。"custom-"prefixで built-in と衝突しないようにする。 */
  id: string;
  /** UI表示名 */
  name: string;
  /** OpenAI互換のBase URL (例: http://localhost:8000/v1)。/chat/completionsは自動付与。 */
  baseUrl: string;
  /** モデル名。MVPでは自動取得を行わずユーザーが直接入力する。 */
  model: string;
  enabled: boolean;
  /** APIキー保存状態。本体はOS Credential Storeにあり、ここにもDBにも平文保存しない。 */
  keySaved: boolean;
  /** 未保存時の入力途中の値。保存後は空文字に戻す(既存ProviderSlotと同じ扱い)。 */
  keyDraft: string;
}

export function isCustomProviderId(id: string): boolean {
  return id.startsWith("custom-");
}


export function normalizeCustomProviderBaseUrl(value: string): string {
  let next = value.trim();
  if (!next) return "";
  if (!/^https?:\/\//i.test(next)) next = `http://${next}`;
  next = next.replace(/\/+$/, "");
  const lowered = next.toLowerCase();
  const chatCompletionsSuffix = "/chat/completions";
  if (lowered.endsWith(chatCompletionsSuffix)) {
    next = next.slice(0, -chatCompletionsSuffix.length).replace(/\/+$/, "");
  }
  return next;
}
