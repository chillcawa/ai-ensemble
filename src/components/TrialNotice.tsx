import { useEffect, useRef, useState } from "react";
import { APP_VERSION } from "../version";
import { NATIVE_LANGUAGE_LABELS, type ResolvedLocale, useI18n } from "../i18n";

export function TrialNotice({ open, onAccept }: { open: boolean; onAccept: () => void }) {
  const { resolvedLocale, setLocale, t } = useI18n();
  const [confirmed, setConfirmed] = useState(false);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmed(false);
    setAdultConfirmed(false);
    checkboxRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="confirm-overlay trial-notice-overlay">
      <section className="confirm-modal trial-notice" role="dialog" aria-modal="true" aria-labelledby="trial-notice-title">
        <header>
          <div>
            <h3 id="trial-notice-title">{t("AI Ensemble 利用上の注意")}</h3>
            <small>AI Ensemble — ECHO / v{APP_VERSION}</small>
          </div>
          <span className="capability-badge neutral">ECHO</span>
        </header>

        <div className="trial-language">
          <strong>{t("最初に言語を選択してください")}</strong>
          <div className="trial-language-options" role="group" aria-label={t("言語")}>
            {(Object.keys(NATIVE_LANGUAGE_LABELS) as ResolvedLocale[]).map((code) => (
              <button
                key={code}
                type="button"
                className={resolvedLocale === code ? "primary-button" : "secondary-button"}
                aria-pressed={resolvedLocale === code}
                onClick={() => setLocale(code)}
              >
                {NATIVE_LANGUAGE_LABELS[code]}
              </button>
            ))}
          </div>
        </div>

        <p><strong>{t("AI Ensemble — ECHOは、18歳以上を対象とする複数AI比較・観測ツールです。")}</strong></p>
        <p>{t("複数のAIへ同じ質問を送り、回答を比較する個人開発のアプリです。業務上の検討、開発、調査の補助としてご利用ください。")}</p>
        <ul>
          <li>{t("各AIサービスのAPIキーは利用者自身で用意・管理します。")}</li>
          <li>{t("送信時は、質問・有効なContext・必要な会話履歴を、選択したAI事業者の公式APIへ端末から直接送信します。AI Ensemble独自の中継サーバーは使用しません。")}</li>
          <li>{t("業務データは、所属組織の規程と各AI事業者との契約・データ設定を確認し、外部AIでの利用が許可された範囲で入力してください。")}</li>
          <li>{t("個人情報や機密情報を扱う場合は、目的に必要な範囲へ絞り、匿名化・マスキングを推奨します。")}</li>
          <li>{t("無料枠、API料金、保存・学習利用は各事業者の規約と設定に従います。")}</li>
          <li>{t("生成内容の正確性・安全性は保証されません。利用と結果の判断は自己責任です。")}</li>
          <li>{t("AIは、自分自身の開発元・モデル名・参照元AIなどを誤って説明することがあります。回答者を確認するときは、AI本文の自己申告ではなく、ECHOが表示する識別ラベルを基準にしてください。")}</li>
          <li>{t("AI回答を他AIへ渡す機能は、誤認やハルシネーションの連鎖・増幅を抑えるため、人間の確認を挟んだ1ホップで終了します。")}</li>
          <li>{t("18歳未満の方は使用しないでください。年齢や生年月日そのものは保存しません。")}</li>
          <li>{t("不具合や使いにくい点のフィードバックを歓迎します。")}</li>
        </ul>
        <div className="trial-confirmations">
          <label className="trial-confirmation">
            <input ref={checkboxRef} type="checkbox" checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.target.checked)} />
            {t("私は18歳以上です")}
          </label>
          <label className="trial-confirmation">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            {t("上記を確認しました")}
          </label>
        </div>
        <div className="confirm-actions">
          <button className="primary-button" disabled={!adultConfirmed || !confirmed} onClick={onAccept}>{t("確認して開始")}</button>
        </div>
      </section>
    </div>
  );
}
