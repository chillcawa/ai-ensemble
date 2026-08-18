import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ConversationMessage } from "../conversation/types";
import { deriveObservationClasses } from "../conversation/types";
import { addComparisonMarker, deleteComparisonMarker, listComparisonMarkers, type ComparisonMarker } from "../conversation/comparison";
import { useI18n } from "../i18n";
import { canonicalAiName, observationLabel } from "../models/aiDisplay";

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function paragraphs(content: string): string[] {
  const parts = content.split(/\n\s*\n/g);
  return parts.length > 0 ? parts : [content];
}

function renderHighlighted(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLocaleLowerCase();
  const needle = q.toLocaleLowerCase();
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  while (cursor < text.length) {
    const index = lower.indexOf(needle, cursor);
    if (index < 0) {
      nodes.push(text.slice(cursor));
      break;
    }
    if (index > cursor) nodes.push(text.slice(cursor, index));
    nodes.push(<mark key={`hit-${key++}`}>{text.slice(index, index + q.length)}</mark>);
    cursor = index + q.length;
  }
  return nodes;
}

export function TurnComparisonModal({
  open,
  conversationId,
  turnIndex,
  userMessage,
  messages,
  allMessages,
  onClose,
}: {
  open: boolean;
  conversationId: string;
  turnIndex: number;
  userMessage?: ConversationMessage;
  messages: ConversationMessage[];
  allMessages: ConversationMessage[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [markers, setMarkers] = useState<ComparisonMarker[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const observations = useMemo(() => deriveObservationClasses(allMessages), [allMessages]);
  const assistants = useMemo(
    () => messages.filter((message) => message.role === "assistant" && message.kind === "normal"),
    [messages],
  );

  useEffect(() => {
    if (!open || !conversationId) return;
    let cancelled = false;
    void listComparisonMarkers(conversationId).then((rows) => {
      if (!cancelled) setMarkers(rows);
    }).catch((error) => console.error("comparison marker load failed", error));
    return () => { cancelled = true; };
  }, [open, conversationId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isMarked = (messageId: string, paragraphIndex: number) =>
    markers.some((marker) => marker.message_id === messageId && marker.paragraph_index === paragraphIndex);

  const toggleMarker = async (message: ConversationMessage, paragraphIndex: number, excerpt: string) => {
    const key = `${message.id}:${paragraphIndex}`;
    if (busyKey) return;
    setBusyKey(key);
    try {
      if (isMarked(message.id, paragraphIndex)) {
        await deleteComparisonMarker(message.id, paragraphIndex);
        setMarkers((current) => current.filter((marker) => !(marker.message_id === message.id && marker.paragraph_index === paragraphIndex)));
      } else {
        const marker = await addComparisonMarker({
          id: uid("cmpmark"),
          conversationId,
          messageId: message.id,
          paragraphIndex,
          excerpt: excerpt.slice(0, 500),
        });
        setMarkers((current) => [...current, marker]);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const matchCount = query.trim()
    ? assistants.reduce((sum, message) => {
        const haystack = message.content.toLocaleLowerCase();
        const needle = query.trim().toLocaleLowerCase();
        let count = 0;
        let cursor = 0;
        while (needle && cursor < haystack.length) {
          const index = haystack.indexOf(needle, cursor);
          if (index < 0) break;
          count += 1;
          cursor = index + needle.length;
        }
        return sum + count;
      }, 0)
    : 0;

  return (
    <div className="modal-backdrop comparison-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="turn-comparison-modal" role="dialog" aria-modal="true" aria-label={`Turn ${turnIndex} ${t("比較")}`}>
        <header className="turn-comparison-header">
          <div>
            <strong>Turn {turnIndex} · {t("原文比較")}</strong>
            <small>{t("自動差分抽出・要約は行いません。★はあなたが選んだ観測点として保存されます。")}</small>
          </div>
          <button className="secondary-button" onClick={onClose}>{t("閉じる")}</button>
        </header>

        {userMessage && (
          <div className="turn-comparison-question">
            <strong>You</strong>
            <span>{userMessage.content}</span>
          </div>
        )}

        <div className="turn-comparison-toolbar">
          <label>
            {t("全回答を同時検索")}
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("語句を入力…")} />
          </label>
          <span>{query.trim() ? `${matchCount} hits` : t("検索は原文を削らず、該当語だけを強調します")}</span>
          <span>★ {markers.filter((marker) => assistants.some((message) => message.id === marker.message_id)).length} markers</span>
        </div>

        <div className="turn-comparison-columns" style={{ gridTemplateColumns: `repeat(${Math.max(assistants.length, 1)}, minmax(320px, 1fr))` }}>
          {assistants.length === 0 && <p className="empty-state">{t("このTurnには比較可能なAI回答がありません。")}</p>}
          {assistants.map((message) => {
            const observation = observations.get(message.id) ?? "independent";
            return (
              <article className="turn-comparison-column" key={message.id}>
                <header>
                  <strong>{message.nickname ?? message.provider ?? "AI"}</strong>
                  <span>{message.model ?? "model unknown"}</span>
                  <span className={`observation-badge ${observation}`}>{observationLabel(observation)}</span>
                </header>
                <div className="response-identity-warning">{t("注意：このレスは {name} によるものです。", { name: canonicalAiName(message.provider, message.nickname) })}</div>
                <div className="turn-comparison-source">
                  {paragraphs(message.content).map((paragraph, index) => {
                    const marked = isMarked(message.id, index);
                    const key = `${message.id}:${index}`;
                    return (
                      <div className={`comparison-paragraph ${marked ? "marked" : ""}`} key={key}>
                        <button
                          className={`comparison-marker-button ${marked ? "active" : ""}`}
                          type="button"
                          title={marked ? t("観測マーカーを外す") : t("この箇所を観測点としてマーク")}
                          disabled={busyKey === key}
                          onClick={() => void toggleMarker(message, index, paragraph)}
                        >★</button>
                        <pre>{renderHighlighted(paragraph, query)}</pre>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>

        <footer className="turn-comparison-footer">
          <span>Comparison Aid ≠ Comparison Conclusion</span>
          <span>{t("原文へのアクセスを常に保持します。")}</span>
        </footer>
      </section>
    </div>
  );
}
