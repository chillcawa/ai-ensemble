import { useEffect, useMemo, useRef, useState } from "react";
import type { DisplayCurrency } from "../types/app";
import type { ConversationMessage, ObservationClass } from "../conversation/types";
import { deriveObservationClasses } from "../conversation/types";
import { formatCostCurrency } from "../format";
import { TurnComparisonModal } from "./TurnComparisonModal";
import { formatTurnTime, type TurnOrder } from "../time/display";
import { localeTag, useI18n } from "../i18n";
import { canonicalAiName, observationLabel } from "../models/aiDisplay";

interface TurnBlock {
  type: "turn";
  id: string;
  index: number;
  messages: ConversationMessage[];
  userMessage?: ConversationMessage;
}

interface BoundaryBlock {
  type: "boundary";
  id: string;
  message: ConversationMessage;
}

type HistoryBlock = TurnBlock | BoundaryBlock;

type ObservationFilter = "all" | "independent" | "self_referenced" | "cross_ai" | "ai_referenced_unknown" | "ai_referenced_any";
type HandoffFilter = "all" | "with" | "without";

function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase();
}

function messageMatchesSearch(message: ConversationMessage, query: string): boolean {
  if (!query) return true;
  const haystack = [
    message.content,
    message.nickname ?? "",
    message.provider ?? "",
    message.model ?? "",
  ].join("\n");
  return normalizeSearch(haystack).includes(query);
}


function isReload(message: ConversationMessage): boolean {
  return message.kind === "context_reload_keep" || message.kind === "context_reload_reset";
}

function buildHistoryBlocks(messages: ConversationMessage[]): HistoryBlock[] {
  const blocks: HistoryBlock[] = [];
  let current: ConversationMessage[] = [];
  let turnIndex = 0;

  const flushTurn = () => {
    if (current.length === 0) return;
    turnIndex += 1;
    const firstUser = current.find((message) => message.role === "user");
    blocks.push({
      type: "turn",
      id: firstUser?.id ?? current[0].id,
      index: turnIndex,
      messages: current,
      userMessage: firstUser,
    });
    current = [];
  };

  for (const message of messages) {
    if (isReload(message)) {
      flushTurn();
      blocks.push({ type: "boundary", id: message.id, message });
      continue;
    }

    // A user message starts a new turn. Handoff requests are intentionally turns too:
    // they have their own user-approved input and one-hop response lineage.
    if (message.role === "user" && current.length > 0) flushTurn();
    current.push(message);
  }

  flushTurn();
  return blocks;
}

function compactText(value: string, max = 92): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

function HighlightedText({ value, query }: { value: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{value}</>;

  const lowerValue = normalizeSearch(value);
  const lowerQuery = normalizeSearch(trimmed);
  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;

  while (cursor < value.length) {
    const index = lowerValue.indexOf(lowerQuery, cursor);
    if (index < 0) {
      parts.push({ text: value.slice(cursor), match: false });
      break;
    }
    if (index > cursor) parts.push({ text: value.slice(cursor, index), match: false });
    parts.push({ text: value.slice(index, index + trimmed.length), match: true });
    cursor = index + trimmed.length;
  }

  return (
    <>
      {parts.map((part, index) => part.match
        ? <mark className="conversation-search-hit" key={index}>{part.text}</mark>
        : <span key={index}>{part.text}</span>)}
    </>
  );
}

function TurnMessage({
  message,
  parent,
  observation,
  displayCurrency,
  currencyRate,
  searchQuery,
  onHandoff,
  originalQuestion,
}: {
  message: ConversationMessage;
  parent?: ConversationMessage;
  observation: ObservationClass | null;
  displayCurrency: DisplayCurrency;
  currencyRate: number;
  searchQuery: string;
  onHandoff?: (message: ConversationMessage, originalQuestion?: string) => void;
  originalQuestion?: string;
}) {
  const { resolvedLocale, t } = useI18n();
  return (
    <article className={`conversation-message ${message.role} ${message.kind !== "normal" ? "special" : ""}`}>
      <div className="conversation-message-meta">
        <strong>{message.role === "user" ? "You" : message.nickname ?? message.provider ?? "AI"}</strong>
        {message.model && <span>{message.model}</span>}
        {message.kind === "handoff_request" && <span className="turn-meta-chip">Handoff request</span>}
        {message.kind === "handoff" && <span className="turn-meta-chip">1-hop response</span>}
        {observation && <span className={`observation-badge ${observation}`}>{observationLabel(observation)}</span>}
        <span>{new Date(message.created_at).toLocaleString(localeTag(resolvedLocale))}</span>
      </div>
      {parent && <small className="conversation-parent">← {t("参照元")}: {parent.nickname ?? parent.provider ?? (parent.role === "user" ? "You" : "message")}</small>}
      {message.role === "assistant" && (
        <div className="response-identity-warning">{t("注意：このレスは {name} によるものです。", { name: canonicalAiName(message.provider, message.nickname) })}</div>
      )}
      <pre><HighlightedText value={message.content} query={searchQuery} /></pre>
      {message.role === "assistant" && message.kind === "normal" && message.slot_id && onHandoff && (
        <div className="conversation-message-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => onHandoff(message, originalQuestion)}
            title={t("この保存済み回答を他のAIへ1ホップで渡す")}
          >
            ⇢ {t("他AIへ渡す")}
          </button>
        </div>
      )}
      {message.role === "assistant" && (message.input_tokens != null || message.output_tokens != null || message.cost_usd != null) && (
        <small className="conversation-usage">
          {message.input_tokens != null ? `in ${message.input_tokens}` : ""}
          {message.output_tokens != null ? ` / out ${message.output_tokens}` : ""}
          {message.cost_usd != null ? ` / ${formatCostCurrency(message.cost_usd, displayCurrency, currencyRate)}` : ""}
        </small>
      )}
    </article>
  );
}

export function ConversationHistory({
  messages,
  displayCurrency,
  currencyRate,
  timeZone,
  turnOrder,
  onHandoff,
}: {
  messages: ConversationMessage[];
  displayCurrency: DisplayCurrency;
  currencyRate: number;
  timeZone: string;
  turnOrder: TurnOrder;
  onHandoff?: (message: ConversationMessage, originalQuestion?: string) => void;
}) {
  const { t } = useI18n();
  const observationClasses = useMemo(() => deriveObservationClasses(messages), [messages]);
  const blocks = useMemo(() => buildHistoryBlocks(messages), [messages]);
  const turns = useMemo(() => blocks.filter((block): block is TurnBlock => block.type === "turn"), [blocks]);
  const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const conversationId = messages[0]?.conversation_id ?? "";
  const latestTurnId = turns.length > 0 ? turns[turns.length - 1].id : null;
  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(new Set());
  const [nearLatest, setNearLatest] = useState(true);
  const [hasNewAway, setHasNewAway] = useState(false);
  const [comparisonTurn, setComparisonTurn] = useState<TurnBlock | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [observationFilter, setObservationFilter] = useState<ObservationFilter>("all");
  const [handoffFilter, setHandoffFilter] = useState<HandoffFilter>("all");
  const latestRef = useRef<HTMLDivElement | null>(null);
  const previousMessageCount = useRef(messages.length);

  // New/switching Conversation: latest turn is expanded, historical turns start folded.
  useEffect(() => {
    setExpandedTurns(latestTurnId ? new Set([latestTurnId]) : new Set());
    setHasNewAway(false);
    previousMessageCount.current = messages.length;
  }, [conversationId]);

  // As a turn grows while streaming/persisting, keep the current latest turn open.
  useEffect(() => {
    if (!latestTurnId) return;
    setExpandedTurns((current) => {
      if (current.has(latestTurnId)) return current;
      const next = new Set(current);
      next.add(latestTurnId);
      return next;
    });
  }, [latestTurnId]);

  // Smart follow: latest may be at the bottom or top.
  useEffect(() => {
    const onScroll = () => {
      const nearTop = window.scrollY < 180;
      const remaining = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      const nearBottom = remaining < 180;
      const isNear = turnOrder === "newest_first" ? nearTop : nearBottom;
      setNearLatest(isNear);
      if (isNear) setHasNewAway(false);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [turnOrder]);

  useEffect(() => {
    const grew = messages.length > previousMessageCount.current;
    previousMessageCount.current = messages.length;
    if (!grew) return;
    if (nearLatest) {
      requestAnimationFrame(() => latestRef.current?.scrollIntoView({
        behavior: "smooth",
        block: turnOrder === "newest_first" ? "start" : "end",
      }));
    } else {
      setHasNewAway(true);
    }
  }, [messages.length, nearLatest, turnOrder]);

  if (messages.length === 0) return null;

  const toggleTurn = (id: string) => {
    setExpandedTurns((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const jumpLatest = () => {
    if (latestTurnId) {
      setExpandedTurns((current) => new Set(current).add(latestTurnId));
    }
    requestAnimationFrame(() => latestRef.current?.scrollIntoView({ behavior: "smooth", block: turnOrder === "newest_first" ? "start" : "end" }));
    setHasNewAway(false);
  };

  const normalizedQuery = normalizeSearch(searchQuery.trim());
  const filtersActive = normalizedQuery.length > 0 || observationFilter !== "all" || handoffFilter !== "all";

  const filteredBlocks = blocks.filter((block) => {
    if (block.type === "boundary") return !filtersActive;

    if (normalizedQuery && !block.messages.some((message) => messageMatchesSearch(message, normalizedQuery))) {
      return false;
    }

    const assistants = block.messages.filter((message) => message.role === "assistant" && message.kind === "normal");
    const observations = assistants.map((message) => observationClasses.get(message.id) ?? "independent");

    if (observationFilter === "ai_referenced_any") {
      if (!observations.some((value) => value !== "independent")) return false;
    } else if (observationFilter !== "all" && !observations.includes(observationFilter)) {
      return false;
    }

    const hasHandoff = block.messages.some((message) => message.kind === "handoff" || message.kind === "handoff_request");
    if (handoffFilter === "with" && !hasHandoff) return false;
    if (handoffFilter === "without" && hasHandoff) return false;

    return true;
  });

  const visibleTurnCount = filteredBlocks.filter((block) => block.type === "turn").length;
  const displayBlocks = turnOrder === "newest_first" ? [...filteredBlocks].reverse() : filteredBlocks;

  return (
    <section className="conversation-history">
      <div className="conversation-history-heading">
        <div>
          <strong>Conversation Log</strong>
          <small>{t("Turn単位の観測履歴")}</small>
        </div>
        <span>{filtersActive ? `${visibleTurnCount} / ${turns.length} turns` : `${turns.length} turns / ${messages.length} messages`}</span>
      </div>

      <div className="conversation-history-tools">
        <label className="conversation-history-search">
          <span>{t("全文検索")}</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("User / AI の原文を検索")}
          />
        </label>
        <label>
          <span>Observation</span>
          <select value={observationFilter} onChange={(event) => setObservationFilter(event.target.value as ObservationFilter)}>
            <option value="all">{t("すべて")}</option>
            <option value="independent">Independent</option>
            <option value="self_referenced">Self-Referenced</option>
            <option value="cross_ai">Cross-AI</option>
            <option value="ai_referenced_unknown">AI-Referenced / Unknown</option>
            <option value="ai_referenced_any">{t("AI参照あり（すべて）")}</option>
          </select>
        </label>
        <label>
          <span>Handoff</span>
          <select value={handoffFilter} onChange={(event) => setHandoffFilter(event.target.value as HandoffFilter)}>
            <option value="all">{t("すべて")}</option>
            <option value="with">{t("あり")}</option>
            <option value="without">{t("なし")}</option>
          </select>
        </label>
        {filtersActive && (
          <button
            className="conversation-history-clear"
            type="button"
            onClick={() => {
              setSearchQuery("");
              setObservationFilter("all");
              setHandoffFilter("all");
            }}
          >{t("クリア")}</button>
        )}
      </div>

      <div className="conversation-history-list">
        {displayBlocks.map((block) => {
          if (block.type === "boundary") {
            const hardReset = block.message.kind === "context_reload_reset";
            return (
              <div className="conversation-context-boundary" key={block.id}>
                <span className="conversation-context-boundary-line" />
                <div className="conversation-context-boundary-card">
                  <strong>↻ {t("Context再読込")}</strong>
                  <span>{t(hardReset ? "以前の履歴を参照しない" : "履歴を保持")}</span>
                  <small>{block.message.applied_context_ids.length > 0 ? t("Context件数", { count: block.message.applied_context_ids.length }) : t("有効Contextなし")}</small>
                </div>
                <span className="conversation-context-boundary-line" />
              </div>
            );
          }

          const expanded = expandedTurns.has(block.id) || normalizedQuery.length > 0;
          const assistants = block.messages.filter((message) => message.role === "assistant");
          const observations = assistants
            .filter((message) => message.kind === "normal")
            .map((message) => observationClasses.get(message.id) ?? "independent");
          const hasCrossAi = observations.includes("cross_ai");
          const hasAiReference = observations.some((value) => value !== "independent");
          const hasHandoff = block.messages.some((message) => message.kind === "handoff" || message.kind === "handoff_request");
          const isLatest = block.id === latestTurnId;
          const label = block.userMessage ? compactText(block.userMessage.content) : "AI response";
          const timestamp = block.userMessage?.created_at ?? block.messages[0]?.created_at;

          return (
            <article className={`conversation-turn ${isLatest ? "latest" : ""}`} key={block.id} ref={isLatest ? latestRef : undefined}>
              <div className="conversation-turn-topline">
                <button className="conversation-turn-header" type="button" onClick={() => toggleTurn(block.id)} aria-expanded={expanded}>
                  <span className="conversation-turn-chevron">{expanded ? "▼" : "▶"}</span>
                  <span className="conversation-turn-title">
                    <strong>Turn {block.index}{isLatest ? ` · ${t("最新")}` : ""}</strong>
                    <span>{label}</span>
                  </span>
                  <span className="conversation-turn-summary">
                    {assistants.length > 0 && <em>{assistants.length} AI</em>}
                    {hasCrossAi && <em>Cross-AI</em>}
                    {!hasCrossAi && hasAiReference && <em>{t("AI参照あり")}</em>}
                    {hasHandoff && <em>Handoff</em>}
                  </span>
                </button>
                <button
                  className="conversation-turn-compare"
                  type="button"
                  onClick={() => setComparisonTurn(block)}
                  disabled={assistants.length < 2}
                  title={t(assistants.length < 2 ? "2つ以上のAI回答があるTurnで比較できます" : "原文を横並びで比較")}
                >{t("比較")}</button>
              </div>
              {timestamp && <div className="conversation-turn-time">{formatTurnTime(timestamp, timeZone)}</div>}

              {expanded && (
                <div className="conversation-turn-body">
                  {block.messages.map((message) => {
                    const parent = message.parent_message_id ? byId.get(message.parent_message_id) : undefined;
                    const observation = message.role === "assistant" && message.kind === "normal"
                      ? observationClasses.get(message.id) ?? "independent"
                      : null;
                    return (
                      <TurnMessage
                        key={message.id}
                        message={message}
                        parent={parent}
                        observation={observation}
                        displayCurrency={displayCurrency}
                        currencyRate={currencyRate}
                        searchQuery={searchQuery}
                        onHandoff={onHandoff}
                        originalQuestion={block.userMessage?.content}
                      />
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
        {filtersActive && visibleTurnCount === 0 && (
          <div className="conversation-history-empty">{t("一致するTurnはありません。")}</div>
        )}
      </div>

      {hasNewAway && !nearLatest && !filtersActive && (
        <button className="conversation-latest-button" type="button" onClick={jumpLatest}>{turnOrder === "newest_first" ? `↑ ${t("最新Turnへ")}` : `↓ ${t("最新Turnへ")}`}</button>
      )}

      <TurnComparisonModal
        open={!!comparisonTurn}
        conversationId={conversationId}
        turnIndex={comparisonTurn?.index ?? 0}
        userMessage={comparisonTurn?.userMessage}
        messages={comparisonTurn?.messages ?? []}
        allMessages={messages}
        onClose={() => setComparisonTurn(null)}
      />
    </section>
  );
}
