import { useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import type { DeltaAnalysisControllerResult } from "../controller/analyzeSavedTurn";
import type { DeltaAnalysisRecord } from "../storage/types";
import type { CanonicalDeltaDocument } from "../translator/types";
import { createHumanResolution, reopenIssue } from "../resolution/controls";
import type { HumanResolutionDraft } from "../resolution/types";
import { validateDeltaDocumentFormalSchema } from "../schema/validateFormalSchema";
import { buildDeltaOverviewViewModel } from "./overviewViewModel";
import { DeltaHistoryView } from "./DeltaHistoryView";
import { DeltaResolutionView } from "./DeltaResolutionView";

type DeltaTab = "overview" | "ir" | "compare" | "resolve" | "history";

export interface DeltaPanelProps {
  result: DeltaAnalysisControllerResult;
  analysisHistory?: DeltaAnalysisRecord[];
  onClose?: () => void;
  onOpenOriginalInput?: (inputId: string) => void;
  onDocumentChange?: (
    document: CanonicalDeltaDocument,
    reason: "resolution" | "reopen",
  ) => void;
}

function badge(text: string) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        border: "1px solid currentColor",
        fontSize: 12,
        opacity: 0.9,
      }}
    >
      {text}
    </span>
  );
}

function relationLabel(kind: string, t: (key: string) => string): string {
  switch (kind) {
    case "agreement":
      return t("一致");
    case "conditional_agreement":
      return t("条件付き一致");
    case "mismatch":
      return t("相違");
    case "contradiction":
      return t("矛盾");
    default:
      return kind;
  }
}

function confidenceLabel(value: unknown, t: (key: string) => string): string {
  if (value === "high") return t("高");
  if (value === "medium") return t("中");
  if (value === "low") return t("低");
  return String(value ?? "—");
}

function decisionLabel(value: string, t: (key: string) => string): string {
  if (value === "accept") return t("採用（Accept）");
  if (value === "reject") return t("却下（Reject）");
  if (value === "hold") return t("保留（Hold）");
  if (value === "other") return t("その他（Other）");
  return value;
}

function statusLabel(value: string, t: (key: string) => string): string {
  if (value === "ready" || value === "resolved") return t("解析完了（READY）");
  if (value === "partial") return t("一部完了（PARTIAL）");
  if (value === "error") return t("エラー（ERROR）");
  return value.toUpperCase();
}

function stateValueLabel(value: string, t: (key: string) => string): string {
  if (value === "unknown") return t("不明（unknown）");
  if (value === "divergence") return t("相違（divergence）");
  if (value === "deadlock") return t("デッドロック（deadlock）");
  return value;
}

function findClaim(doc: CanonicalDeltaDocument, claimId: string, t: (key: string) => string) {
  for (const bundle of doc.bundles as any[]) {
    const claim = (bundle.claims || []).find(
      (item: any) => item.claim_id === claimId,
    );
    if (claim) {
      const actor = (doc.actors as any[]).find(
        (item) => item.actor_id === bundle.actor_id,
      );
      return {
        id: claimId,
        text: claim.text || claimId,
        actorId: bundle.actor_id,
        actorName:
          actor?.display_name ||
          actor?.model ||
          actor?.provider ||
          bundle.actor_id,
      };
    }
  }
  return {
    id: claimId,
    text: claimId,
    actorId: "unknown",
    actorName: t("不明なActor"),
  };
}

function downloadJson(document: CanonicalDeltaDocument, t: (key: string) => string) {
  const gate = validateDeltaDocumentFormalSchema(document);
  if (!gate.valid) {
    window.alert(
      `${t("Formal Schema エラー")}\n\n${gate.errors
        .slice(0, 12)
        .join("\n")}`,
    );
    return;
  }

  const blob = new Blob(
    [JSON.stringify(document, null, 2)],
    { type: "application/json;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${document.document_id.replace(
    /[^a-zA-Z0-9._-]+/g,
    "_",
  )}.delta.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DeltaPanel(props: DeltaPanelProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<DeltaTab>("overview");
  const [resolutionTargetIds, setResolutionTargetIds] = useState<string[]>([]);
  const [reopenResolutionId, setReopenResolutionId] = useState<string>();
  const [reopenReason, setReopenReason] = useState("");

  const vm = useMemo(
    () => buildDeltaOverviewViewModel(props.result),
    [props.result],
  );
  const doc = props.result.document;
  const schemaGate = useMemo(
    () =>
      doc
        ? validateDeltaDocumentFormalSchema(doc)
        : { valid: false, errors: [t("Canonical DeltaDocumentがありません")] },
    [doc, t],
  );

  const humanActorId = useMemo(
    () =>
      (doc?.actors as any[] | undefined)?.find(
        (actor) => actor.actor_type === "human",
      )?.actor_id,
    [doc],
  );

  function openResolution(targetIds: string[]) {
    setResolutionTargetIds([...new Set(targetIds)]);
    setTab("resolve");
  }

  function confirmResolution(draft: HumanResolutionDraft) {
    if (!doc) return;
    const next = createHumanResolution(doc, draft);
    const gate = validateDeltaDocumentFormalSchema(next);
    if (!gate.valid) {
      window.alert(
        `${t("ResolutionはFormal Schema gateにより拒否されました。")}\n\n${gate.errors
          .slice(0, 12)
          .join("\n")}`,
      );
      return;
    }
    props.onDocumentChange?.(next, "resolution");
    setResolutionTargetIds([]);
    setTab("history");
  }

  function confirmReopen() {
    if (!doc || !humanActorId || !reopenResolutionId) return;
    const resolution = (doc.resolutions as any[]).find(
      (item) => item.resolution_id === reopenResolutionId,
    );
    if (!resolution) return;

    const next = reopenIssue(doc, {
      human_actor_id: humanActorId,
      target_ids: resolution.target_ids || [],
      reason: reopenReason,
    });
    const gate = validateDeltaDocumentFormalSchema(next);
    if (!gate.valid) {
      window.alert(
        `${t("ReopenはFormal Schema gateにより拒否されました。")}\n\n${gate.errors
          .slice(0, 12)
          .join("\n")}`,
      );
      return;
    }

    props.onDocumentChange?.(next, "reopen");
    setReopenResolutionId(undefined);
    setReopenReason("");
    setTab("history");
  }

  return (
    <section
      aria-label="Delta Protocol"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 420,
        maxHeight: "80vh",
        border: "1px solid rgba(127,127,127,.35)",
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--panel-bg, #111)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderBottom: "1px solid rgba(127,127,127,.25)",
          flexWrap: "wrap",
        }}
      >
        <strong>Delta Protocol</strong>
        {badge(statusLabel(vm.status, t))}
        {badge(
          schemaGate.valid
            ? t("Formal Schema: PASS")
            : t("Formal Schema: FAIL"),
        )}
        <div style={{ flex: 1 }} />
        {doc && (
          <button
            disabled={!schemaGate.valid}
            onClick={() => downloadJson(doc, t)}
          >
            {t("JSON書き出し")}
          </button>
        )}
        {props.onClose && (
          <button onClick={props.onClose}>{t("閉じる")}</button>
        )}
      </header>

      <nav
        style={{
          display: "flex",
          gap: 6,
          padding: "8px 12px",
          borderBottom: "1px solid rgba(127,127,127,.2)",
          flexWrap: "wrap",
        }}
      >
        {([
          ["overview", t("概要")],
          ["ir", t("中間表現（IR）")],
          ["compare", t("比較").toUpperCase()],
          ["resolve", t("解決")],
          ["history", t("履歴")],
        ] as Array<[DeltaTab, string]>).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            style={{ fontWeight: tab === id ? 700 : 400 }}
          >
            {label}
          </button>
        ))}
      </nav>

      <div style={{ overflow: "auto", padding: 12 }}>
        {!schemaGate.valid && (
          <details
            open
            style={{
              marginBottom: 12,
              border: "1px solid rgba(220,120,120,.5)",
              borderRadius: 8,
              padding: 10,
            }}
          >
            <summary>{t("Formal Schema エラー")}</summary>
            <ul>
              {schemaGate.errors.slice(0, 20).map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </details>
        )}

        {tab === "overview" && (
          <DeltaOverview result={props.result} />
        )}

        {tab === "ir" && (
          <DeltaIRView
            result={props.result}
            onOpenOriginalInput={props.onOpenOriginalInput}
          />
        )}

        {tab === "compare" && (
          <DeltaCompareView
            result={props.result}
            onResolve={openResolution}
          />
        )}

        {tab === "resolve" && doc && (
          <div style={{ display: "grid", gap: 16 }}>
            {resolutionTargetIds.length > 0 &&
            humanActorId ? (
              <DeltaResolutionView
                document={doc}
                humanActorId={humanActorId}
                targetIds={resolutionTargetIds}
                onConfirm={confirmResolution}
                onCancel={() => {
                  setResolutionTargetIds([]);
                  setTab("compare");
                }}
              />
            ) : (
              <p>
                {t("COMPAREの「人間による最終解決」から対象を選んでください。")}
              </p>
            )}

            {(doc.resolutions as any[]).length > 0 && (
              <section>
                <h3>{t("解決済み項目 / 再オープン")}</h3>
                {(doc.resolutions as any[]).map((resolution) => (
                  <div
                    key={resolution.resolution_id}
                    style={{
                      ...cardStyle,
                      marginBottom: 8,
                    }}
                  >
                    <strong>
                      {decisionLabel(resolution.decision, t)}
                      {resolution.decision_value
                        ? ` (${resolution.decision_value})`
                        : ""}
                    </strong>
                    <div style={{ marginTop: 6 }}>
                      {resolution.text || t("メモなし")}
                    </div>
                    <small style={{ opacity: .6 }}>
                      {resolution.resolution_id}
                    </small>

                    {reopenResolutionId !==
                    resolution.resolution_id ? (
                      <div style={{ marginTop: 8 }}>
                        <button
                          onClick={() =>
                            setReopenResolutionId(
                              resolution.resolution_id,
                            )
                          }
                        >
                          {t("人間による再オープン")}
                        </button>
                      </div>
                    ) : (
                      <div style={{ marginTop: 8 }}>
                        <textarea
                          style={{ width: "100%", minHeight: 60 }}
                          placeholder={t("再オープン理由（必須）")}
                          value={reopenReason}
                          onChange={(event) =>
                            setReopenReason(event.target.value)
                          }
                        />
                        <button
                          disabled={!reopenReason.trim()}
                          onClick={confirmReopen}
                        >
                          {t("再オープンを記録")}
                        </button>
                        <button
                          style={{ marginLeft: 8 }}
                          onClick={() => {
                            setReopenResolutionId(undefined);
                            setReopenReason("");
                          }}
                        >
                          {t("キャンセル")}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}
          </div>
        )}

        {tab === "history" && doc && (
          <div style={{ display: "grid", gap: 16 }}>
            <section>
              <h3>{t("解析履歴")}</h3>
              {!props.analysisHistory?.length ? (
                <p>{t("保存済み解析履歴はありません。")}</p>
              ) : (
                props.analysisHistory.map((record) => (
                  <div
                    key={record.analysis_id}
                    style={{ ...cardStyle, marginBottom: 8 }}
                  >
                    <strong>{statusLabel(record.status, t)}</strong>
                    <div>
                      {record.created_at} · {record.analysis_id}
                    </div>
                    {record.parent_analysis_id && (
                      <small style={{ opacity: .6 }}>
                        {t("親解析")}: {record.parent_analysis_id}
                      </small>
                    )}
                  </div>
                ))
              )}
            </section>
            <section>
              <h3>{t("決定 / 改訂履歴")}</h3>
              <DeltaHistoryView document={doc} />
            </section>
          </div>
        )}
      </div>
    </section>
  );
}

function DeltaOverview({
  result,
}: {
  result: DeltaAnalysisControllerResult;
}) {
  const { t } = useI18n();
  const vm = buildDeltaOverviewViewModel(result);
  const doc = result.document;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <section>
        <h3 style={{ marginTop: 0 }}>{t("質問（Query）")}</h3>
        <div style={{ whiteSpace: "pre-wrap" }}>
          {doc?.query.text || t("Canonical DeltaDocumentがありません")}
        </div>
      </section>

      <section>
        <h3>{t("集計")}</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 8,
          }}
        >
          <Metric label={t("参加者（Actors）")} value={vm.actor_count} />
          <Metric label={t("IRバンドル（Bundles）")} value={vm.bundle_count} />
          <Metric label={t("関係（Relations）")} value={vm.relation_count} />
          <Metric label={t("未解決（Unresolved）")} value={vm.unresolved_count} />
          <Metric label={t("解決候補（Candidates）")} value={vm.candidate_count} />
          <Metric
            label={t("Translator失敗")}
            value={vm.translator_failures}
          />
        </div>
      </section>

      {(result.failures.length > 0 ||
        result.warnings.length > 0) && (
        <section>
          <h3>{t("警告 / 失敗")}</h3>
          <ul>
            {result.failures.map((failure, index) => (
              <li key={`f-${index}`}>
                <strong>{failure.stage}</strong>: {failure.message}
              </li>
            ))}
            {result.warnings.map((warning, index) => (
              <li key={`w-${index}`}>{warning}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div
      style={{
        padding: 10,
        border: "1px solid rgba(127,127,127,.25)",
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 12, opacity: .7 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}

function DeltaIRView(props: {
  result: DeltaAnalysisControllerResult;
  onOpenOriginalInput?: (inputId: string) => void;
}) {
  const { t } = useI18n();
  const doc = props.result.document;
  if (!doc) return <p>{t("Canonical DeltaDocumentがありません")}</p>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {doc.bundles.map((bundle: any) => {
        const actor = doc.actors.find(
          (item: any) => item.actor_id === bundle.actor_id,
        );
        const input = doc.original_inputs.find(
          (item: any) =>
            item.input_id === bundle.original_input_id,
        );

        return (
          <section
            key={bundle.bundle_id}
            style={cardStyle}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <h3 style={{ margin: 0 }}>
                {actor?.display_name ||
                  actor?.provider ||
                  bundle.actor_id}
              </h3>
            </div>

            {input && (
              <details style={{ marginTop: 10 }}>
                <summary>{t("元入力（OriginalInput）")}</summary>
                <pre style={{ whiteSpace: "pre-wrap" }}>
                  {input.content}
                </pre>
                {props.onOpenOriginalInput && (
                  <button
                    onClick={() =>
                      props.onOpenOriginalInput?.(input.input_id)
                    }
                  >
                    {t("元レスポンスを開く")}
                  </button>
                )}
              </details>
            )}

            <IRGroup
              title={t("主張（Claims）")}
              items={bundle.claims}
              textKey="text"
            />
            <IRGroup
              title={t("根拠・観測（Evidence / Observation）")}
              items={bundle.support}
              textKey="text"
            />
            <IRGroup
              title={t("意味情報（Semantics）")}
              items={bundle.semantics}
              textKey="text"
            />
            <IRGroup
              title={t("仮説（Hypotheses）")}
              items={bundle.hypotheses}
              textKey="text"
            />
            <IRGroup
              title={t("解釈（Interpretations）")}
              items={bundle.interpretations}
              textKey="text"
            />
            <IRGroup
              title={t("異論（Dissent）")}
              items={bundle.dissents}
              textKey="text"
            />
            <IRGroup
              title={t("対立立場（Counterposition）")}
              items={bundle.counterpositions}
              textKey="text"
            />
          </section>
        );
      })}
    </div>
  );
}

function IRGroup(props: {
  title: string;
  items: any[];
  textKey: string;
}) {
  const { t } = useI18n();
  if (!props.items?.length) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <h4 style={{ marginBottom: 6 }}>{props.title}</h4>
      <ul>
        {props.items.map((item: any, index: number) => (
          <li
            key={
              item.claim_id ||
              item.support_id ||
              item.semantic_id ||
              item.dissent_id ||
              item.counterposition_id ||
              index
            }
          >
            <span>
              {item[props.textKey] || JSON.stringify(item)}
            </span>
            {item.confidence && (
              <small style={{ marginLeft: 8, opacity: .7 }}>
                {t("信頼度")}:{" "}
                {item.confidence.qualitative ??
                  item.confidence.value ??
                  t("記録あり")}
              </small>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeltaCompareView(props: {
  result: DeltaAnalysisControllerResult;
  onResolve: (targetIds: string[]) => void;
}) {
  const { t } = useI18n();
  const doc = props.result.document;
  if (!doc) return <p>{t("Canonical DeltaDocumentがありません")}</p>;

  if (
    !doc.relations.length &&
    !doc.unresolved_states.length &&
    !doc.resolution_candidates.length
  ) {
    return (
      <div>
        <p>{t("比較結果はありません。")}</p>
        {doc.bundles.length < 2 && (
          <p>
            {t("valid Bundleが2件未満のためComparatorは実行されていません。")}
          </p>
        )}
        {props.result.failures.some(
          (failure) => failure.stage === "comparator",
        ) && <p>{t("Comparatorに失敗しました。Bundlesは保持されています。")}</p>}
        {props.result.warnings.length > 0 && (
          <details style={{ marginTop: 8 }} open>
            <summary>{t("警告 / 失敗")}</summary>
            <ul>
              {props.result.warnings.map((warning, index) => (
                <li key={`${index}:${warning}`}>{warning}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {(doc.relations as any[]).map((relation) => {
        const targets = (relation.target_ids || []).map(
          (id: string) => findClaim(doc, id, t),
        );

        return (
          <section
            key={relation.relation_id}
            style={cardStyle}
          >
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <strong style={{ fontSize: 16 }}>
                {relationLabel(relation.kind, t)}
              </strong>
              <small style={{ opacity: .65 }}>
                {relation.kind}
              </small>
              {relation.confidence && (
                <span style={{ marginLeft: "auto" }}>
                  {t("比較信頼度")}:{" "}
                  <strong>
                    {confidenceLabel(
                      relation.confidence.qualitative ??
                        relation.confidence.value,
                      t,
                    )}
                  </strong>
                </span>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 8,
                marginTop: 10,
              }}
            >
              {targets.map((target: any) => (
                <div
                  key={target.id}
                  style={{
                    padding: 10,
                    border:
                      "1px solid rgba(127,127,127,.2)",
                    borderRadius: 8,
                  }}
                >
                  <strong>{target.actorName}</strong>
                  <div
                    style={{
                      marginTop: 6,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {target.text}
                  </div>
                </div>
              ))}
            </div>

            {relation.note && (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  background: "rgba(127,127,127,.08)",
                  borderRadius: 8,
                }}
              >
                <strong>{t("比較実行者")}:</strong>{" "}
                {relation.note}
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <button
                onClick={() =>
                  props.onResolve(relation.target_ids || [])
                }
              >
                {t("人間による最終解決")}
              </button>
            </div>

            <details style={{ marginTop: 8 }}>
              <summary>{t("内部ID")}</summary>
              <div>
                {t("関係（Relations）")}: {relation.relation_id}
              </div>
              <div>
                {t("対象ID")}: {(relation.target_ids || []).join(", ")}
              </div>
              <div>{t("比較実行者")}: {relation.actor_id}</div>
            </details>
          </section>
        );
      })}

      {(doc.unresolved_states as any[]).map((state) => (
        <section key={state.state_id} style={cardStyle}>
          <strong>{t("未解決")}</strong>
          <div style={{ marginTop: 6 }}>
            {t("状態")}: {(state.states || []).map((value: string) => stateValueLabel(value, t)).join(", ") || t("未解決")}
          </div>
          {state.note && <div>{state.note}</div>}
          <button
            style={{ marginTop: 8 }}
            onClick={() =>
              props.onResolve(state.target_ids || [])
            }
          >
            {t("人間による最終解決")}
          </button>
        </section>
      ))}

      {(doc.resolution_candidates as any[]).map(
        (candidate) => (
          <section
            key={candidate.candidate_id}
            style={cardStyle}
          >
            <strong>{t("AI提案 — 未解決")}</strong>
            <div style={{ marginTop: 6 }}>
              {candidate.proposal}
            </div>
            {candidate.suggested_decision && (
              <div style={{ marginTop: 6, opacity: .7 }}>
                {t("提案された決定")}:{" "}
                {decisionLabel(candidate.suggested_decision, t)} ({t("未選択")})
              </div>
            )}
            <button
              style={{ marginTop: 8 }}
              onClick={() =>
                props.onResolve(candidate.target_ids || [])
              }
            >
              {t("人間による最終解決")}
            </button>
          </section>
        ),
      )}
    </div>
  );
}

const cardStyle = {
  border: "1px solid rgba(127,127,127,.25)",
  borderRadius: 8,
  padding: 12,
} as const;
