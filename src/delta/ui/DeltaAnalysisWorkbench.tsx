import { useEffect, useMemo, useState } from "react";
import type { ConversationMessage } from "../../conversation/types";
import type { AIResponseSlot } from "../../types/app";
import { useI18n } from "../../i18n";
import {
  analyzeSavedTurn,
  type DeltaAnalysisControllerResult,
} from "../controller/analyzeSavedTurn";
import {
  buildDeltaTurnCohorts,
  echoConversationMessageToDeltaLike,
  type EchoDeltaTurnCohort,
} from "../echoBridge";
import type { ComparatorModel } from "../comparator/types";
import type { TranslatorModel, CanonicalDeltaDocument } from "../translator/types";
import { validateDeltaDocumentFormalSchema } from "../schema/validateFormalSchema";
import {
  BrowserDeltaAnalysisStorage,
  newDeltaAnalysisId,
} from "../storage/browserStorage";
import { createDeltaAnalysisRecord } from "../storage/recordFactory";
import type {
  DeltaAnalysisRecord,
  DeltaPersistedStatus,
} from "../storage/types";
import { DeltaPanel } from "./DeltaPanel";

export interface DeltaAnalysisWorkbenchProps {
  messages: ConversationMessage[];
  responseSlots: AIResponseSlot[];
  buildModel: (slotId: string) => TranslatorModel & ComparatorModel;
}

const DELTA_CONVERSATION_SCOPE = "echo:local-conversation";

function cohortLabel(
  cohort: EchoDeltaTurnCohort,
  index: number,
  responseLabel: string,
): string {
  const query = (cohort.queryMessage as any).content || "";
  const preview =
    query.length > 52 ? `${query.slice(0, 52)}…` : query;
  return `${index + 1}. ${cohort.runType.toUpperCase()} · ${
    cohort.assistantMessages.length
  } ${responseLabel} · ${preview}`;
}

function queryMessageId(cohort: EchoDeltaTurnCohort): string {
  return String((cohort.queryMessage as any).id);
}

function cohortSelectionId(cohort: EchoDeltaTurnCohort): string {
  return `${queryMessageId(cohort)}::${cohort.cohortKey}`;
}

function controllerStatusFromRecord(
  record: DeltaAnalysisRecord,
): "ready" | "partial" | "error" {
  if (record.status === "error") return "error";
  if (record.status === "partial") return "partial";
  return "ready";
}

export function DeltaAnalysisWorkbench(
  props: DeltaAnalysisWorkbenchProps,
) {
  const { t } = useI18n();
  const storage = useMemo(
    () => new BrowserDeltaAnalysisStorage(),
    [],
  );

  const cohorts = useMemo(
    () => buildDeltaTurnCohorts(props.messages),
    [props.messages],
  );

  const baselineCohorts = useMemo(
    () =>
      cohorts.filter((cohort) => cohort.runType === "baseline"),
    [cohorts],
  );

  const processorSlots = useMemo(
    () =>
      props.responseSlots.filter(
        (slot) => slot.enabled && slot.keySaved,
      ),
    [props.responseSlots],
  );

  const [selectedCohortId, setSelectedCohortId] =
    useState("");
  const [processorSlotId, setProcessorSlotId] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] =
    useState<DeltaAnalysisControllerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<
    DeltaAnalysisRecord[]
  >([]);
  const [activeAnalysisId, setActiveAnalysisId] =
    useState<string>();

  const selectedCohort =
    baselineCohorts.find(
      (cohort) =>
        cohortSelectionId(cohort) === selectedCohortId,
    ) ?? baselineCohorts[baselineCohorts.length - 1];

  const selectedProcessor =
    processorSlots.find(
      (slot) => slot.id === processorSlotId,
    ) ?? processorSlots[0];

  async function refreshHistory(
    cohort: EchoDeltaTurnCohort | undefined,
  ) {
    if (!cohort) {
      setAnalysisHistory([]);
      return;
    }

    const turnId = queryMessageId(cohort);
    const turnRecords = await storage.listByTurn(
      DELTA_CONVERSATION_SCOPE,
      turnId,
    );
    const keyedRecords = turnRecords.filter(
      (record) => record.cohort_key === cohort.cohortKey,
    );
    const sameQueryCohortCount = baselineCohorts.filter(
      (candidate) => queryMessageId(candidate) === turnId,
    ).length;
    const legacyRecords = turnRecords.filter((record) => !record.cohort_key);
    // Pre-fix records did not store cohort identity. They are safe to surface only
    // when this query has a single baseline cohort; otherwise showing them could
    // load the wrong context lineage.
    const records = keyedRecords.length > 0
      ? keyedRecords
      : sameQueryCohortCount === 1
        ? legacyRecords
        : [];
    setAnalysisHistory(records);

    const latest = records.length
      ? records[records.length - 1]
      : undefined;

    if (latest) {
      setActiveAnalysisId(latest.analysis_id);
      setResult({
        status: controllerStatusFromRecord(latest),
        run_id: latest.run_id,
        document: latest.document,
        failures: latest.failures ? [...latest.failures] : [],
        warnings: [
          ...(latest.warnings || []),
          t("保存済みDelta解析を読み込みました: {time}", { time: latest.created_at }),
        ],
      });
      setProgress(
        t("保存済みDelta解析を読み込みました: {time}", { time: latest.created_at }),
      );
    } else {
      setActiveAnalysisId(undefined);
      setResult(null);
      setProgress("");
    }
  }

  useEffect(() => {
    void refreshHistory(selectedCohort);
  }, [selectedCohortId, selectedCohort?.queryMessage, selectedCohort?.cohortKey]);

  async function persistSnapshot(args: {
    next: DeltaAnalysisControllerResult;
    status?: DeltaPersistedStatus;
    parentAnalysisId?: string;
  }): Promise<string | undefined> {
    if (!selectedCohort || !args.next.document) return undefined;

    const gate = validateDeltaDocumentFormalSchema(
      args.next.document,
    );
    if (!gate.valid) {
      setError(
        `Formal Schema gate failed: ${gate.errors
          .slice(0, 8)
          .join(" | ")}`,
      );
      return undefined;
    }

    const createdAt = new Date().toISOString();
    const analysisId = newDeltaAnalysisId();
    const record = createDeltaAnalysisRecord({
      analysisId,
      parentAnalysisId: args.parentAnalysisId,
      conversationId: DELTA_CONVERSATION_SCOPE,
      turnId: queryMessageId(selectedCohort),
      cohortKey: selectedCohort.cohortKey,
      contextLineageKey: selectedCohort.contextLineageKey,
      queryMessageId: queryMessageId(selectedCohort),
      responseMessageIds: selectedCohort.assistantMessages.map(
        (message: any) => String(message.id),
      ),
      result: args.next,
      createdAt,
    });

    if (args.status) record.status = args.status;

    try {
      await storage.save(record);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : String(error),
      );
      return undefined;
    }
    setActiveAnalysisId(analysisId);
    await refreshHistory(selectedCohort);
    return analysisId;
  }

  async function analyze() {
    if (!selectedCohort) {
      setError(
        t("解析可能なBASELINE cohortがありません。"),
      );
      return;
    }
    if (!selectedProcessor) {
      setError(
        t("Delta処理AIとして利用できる有効なモデルがありません。設定でモデルを有効化し、必要なAPIキーまたは接続設定を確認してください。"),
      );
      return;
    }

    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(t("Delta解析を準備中…"));

    try {
      const translatorModel = props.buildModel(
        selectedProcessor.id,
      );
      const comparatorModel = props.buildModel(
        selectedProcessor.id,
      );

      const next = await analyzeSavedTurn({
        queryMessage: echoConversationMessageToDeltaLike(
          selectedCohort.queryMessage,
        ),
        assistantMessages:
          selectedCohort.assistantMessages.map(
            echoConversationMessageToDeltaLike,
          ),
        deps: {
          translatorResolver: {
            resolve() {
              return translatorModel;
            },
          },
          comparatorModel,
          onProgress(event) {
            setProgress(event.message || event.stage);
          },
        },
        runOptions: {
          cohortKey: selectedCohort.cohortKey,
        },
      });

      setResult(next);

      if (next.document) {
        const gate = validateDeltaDocumentFormalSchema(
          next.document,
        );
        if (!gate.valid) {
          setError(
            `Formal Schema gate failed: ${gate.errors
              .slice(0, 10)
              .join(" | ")}`,
          );
          setProgress(
            t("DeltaDocumentは作成されましたが、Formal Schema検証に失敗しました。"),
          );
        } else {
          const savedAnalysisId = await persistSnapshot({
            next,
            parentAnalysisId: activeAnalysisId,
          });
          if (savedAnalysisId) {
            setProgress(
              next.status === "ready"
                ? t("Delta解析完了。Formal Schema PASS。保存済み。")
                : t("Delta解析は一部完了。Formal Schema PASS。保存済み。"),
            );
          } else {
            setProgress(
              next.status === "ready"
                ? t("Delta解析完了。Formal Schema PASS。保存失敗。")
                : t("Delta解析は一部完了。Formal Schema PASS。保存失敗。"),
            );
          }
        }
      } else {
        setProgress(t("Delta解析に失敗しました。"));
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : String(cause),
      );
      setProgress(t("Delta解析に失敗しました。"));
    } finally {
      setRunning(false);
    }
  }

  async function handleDocumentChange(
    document: CanonicalDeltaDocument,
    reason: "resolution" | "reopen",
  ) {
    if (!result) return;

    const next: DeltaAnalysisControllerResult = {
      ...result,
      status: "ready",
      document,
      failures: result.failures,
      warnings: result.warnings,
    };

    const status: DeltaPersistedStatus =
      reason === "resolution" ? "resolved" : "ready";

    const savedAnalysisId = await persistSnapshot({
      next,
      status,
      parentAnalysisId: activeAnalysisId,
    });

    if (!savedAnalysisId) {
      setProgress(
        reason === "resolution"
          ? t("Human Resolutionは保存されませんでした。永続化済み状態は変更されていません。")
          : t("Human Reopenは保存されませんでした。永続化済み状態は変更されていません。"),
      );
      return;
    }

    setResult(next);
    setProgress(
      reason === "resolution"
        ? t("Human Resolutionを追記保存しました。")
        : t("Human Reopenを追記保存しました。"),
    );
  }

  return (
    <section
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid rgba(127,127,127,.3)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <strong>{t("Delta解析")}</strong>
        <span style={{ opacity: .7 }}>
          {t("Conversation保存後の派生解析")}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(240px, 1fr) minmax(220px, 1fr) auto",
          gap: 8,
          marginTop: 10,
          alignItems: "end",
        }}
      >
        <label>
          <small>{t("解析対象 BASELINE cohort")}</small>
          <select
            style={{ width: "100%" }}
            value={
              selectedCohort
                ? cohortSelectionId(selectedCohort)
                : ""
            }
            onChange={(event) => {
              setSelectedCohortId(event.target.value);
              setResult(null);
              setError(null);
              setProgress("");
            }}
          >
            {baselineCohorts.map((cohort, index) => (
              <option
                key={cohortSelectionId(cohort)}
                value={cohortSelectionId(cohort)}
              >
                {cohortLabel(cohort, index, t("回答"))}
              </option>
            ))}
          </select>
        </label>

        <label>
          <small>
            {t("Delta処理AI（有効なモデルから1つ選択）")}
          </small>
          <select
            style={{ width: "100%" }}
            value={selectedProcessor?.id || ""}
            onChange={(event) => {
              setProcessorSlotId(event.target.value);
              setError(null);
              setProgress("");
            }}
            disabled={running || processorSlots.length === 0}
            title={t("選択した1モデルをTranslatorとComparatorの両方で使用します。")}
          >
            {processorSlots.length === 0 && (
              <option value="">{t("利用可能なモデルがありません")}</option>
            )}
            {processorSlots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.label} · {slot.model.id}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={() => void analyze()}
          disabled={
            running ||
            !selectedCohort ||
            !selectedProcessor
          }
        >
          {running ? t("Delta解析中…") : t("Delta解析")}
        </button>
      </div>

      {selectedCohort && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            opacity: .8,
          }}
        >
          {t("選択中のBASELINE")}: {queryMessageId(selectedCohort)} · {selectedCohort.cohortKey} ·{" "}
          {String(
            (selectedCohort.queryMessage as any).content ||
              "",
          ).slice(0, 120)}
        </div>
      )}

      <div
        style={{
          marginTop: 8,
          padding: "8px 10px",
          border: "1px solid rgba(127,127,127,.2)",
          borderRadius: 8,
          fontSize: 12,
        }}
      >
        {t("Delta Processorは、現在ECHOで有効かつ利用可能なモデルから1つ選択します。選択したモデルをTranslatorとComparatorの両方で使用します。複数モデルによるDelta解析の並列実行や、Delta解析結果同士の比較は行いません。") }
      </div>

      <small
        style={{
          display: "block",
          marginTop: 8,
          opacity: .7,
        }}
      >
        {t("Translatorは各OriginalInputを1件ずつ独立処理します。2件以上のvalid Bundleがある場合のみComparatorを実行します。Delta結果はConversationとは別にappend-only保存します。") }
      </small>

      {progress && (
        <div style={{ marginTop: 10 }}>{progress}</div>
      )}
      {error && (
        <div
          className="error"
          style={{ marginTop: 10 }}
        >
          {error}
        </div>
      )}

      {result && !running && (
        <div style={{ marginTop: 12 }}>
          <DeltaPanel
            result={result}
            analysisHistory={analysisHistory}
            onDocumentChange={(document, reason) =>
              void handleDocumentChange(document, reason)
            }
          />
        </div>
      )}
    </section>
  );
}
