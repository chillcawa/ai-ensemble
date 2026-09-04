import { useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import type { CanonicalDeltaDocument } from "../translator/types";
import type { HumanDecision, HumanResolutionDraft } from "../resolution/types";

export interface DeltaResolutionViewProps {
  document: CanonicalDeltaDocument;
  humanActorId: string;
  targetIds: string[];
  onConfirm: (draft: HumanResolutionDraft) => void;
  onCancel?: () => void;
}

function decisionLabel(value: string, t: (key: string) => string): string {
  if (value === "accept") return t("採用（Accept）");
  if (value === "reject") return t("却下（Reject）");
  if (value === "hold") return t("保留（Hold）");
  if (value === "other") return t("その他（Other）");
  return value;
}

function itemLabel(doc: CanonicalDeltaDocument, id: string, t: (key: string) => string): string {
  for (const bundle of doc.bundles as any[]) {
    for (const item of [
      ...(bundle.claims || []),
      ...(bundle.support || []),
      ...(bundle.dissents || []),
      ...(bundle.counterpositions || []),
    ]) {
      const itemId =
        item.claim_id ||
        item.support_id ||
        item.dissent_id ||
        item.counterposition_id;
      if (itemId === id) {
        const actor = (doc.actors as any[]).find(
          (candidate) =>
            candidate.actor_id === (item.actor_id || bundle.actor_id),
        );
        return `${actor?.display_name || bundle.actor_id}: ${
          item.text || item.statement || id
        }`;
      }
    }
  }

  const relation = (doc.relations as any[]).find(
    (item) => item.relation_id === id,
  );
  if (relation) return `${t("比較関係")}: ${relation.kind}`;

  const candidate = (doc.resolution_candidates as any[]).find(
    (item) => item.candidate_id === id,
  );
  if (candidate) return `${t("AI提案")}: ${candidate.proposal}`;

  return id;
}

export function DeltaResolutionView(props: DeltaResolutionViewProps) {
  const { t } = useI18n();
  const [decision, setDecision] = useState<HumanDecision | "">("");
  const [basisIds, setBasisIds] = useState<string[]>([]);
  const [candidateId, setCandidateId] = useState<string | undefined>();
  const [decisionValue, setDecisionValue] = useState("");
  const [note, setNote] = useState("");
  const [closeOther, setCloseOther] = useState<boolean | undefined>();
  const [confirming, setConfirming] = useState(false);

  const candidates = useMemo(() => {
    const targetSet = new Set(props.targetIds);
    return (props.document.resolution_candidates as any[]).filter((candidate) =>
      (candidate.target_ids || []).some((id: string) => targetSet.has(id)),
    );
  }, [props.document, props.targetIds]);

  const basisOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const id of props.targetIds) ids.add(id);
    for (const relation of props.document.relations as any[]) {
      if (
        (relation.target_ids || []).some((id: string) =>
          props.targetIds.includes(id),
        )
      ) {
        ids.add(relation.relation_id);
      }
    }
    for (const candidate of candidates) ids.add(candidate.candidate_id);
    for (const bundle of props.document.bundles as any[]) {
      for (const claim of bundle.claims || []) ids.add(claim.claim_id);
      for (const support of bundle.support || []) ids.add(support.support_id);
      for (const dissent of bundle.dissents || []) ids.add(dissent.dissent_id);
    }
    return Array.from(ids);
  }, [props.document, props.targetIds, candidates]);

  function toggleBasis(id: string) {
    setBasisIds((old) =>
      old.includes(id) ? old.filter((x) => x !== id) : [...old, id],
    );
  }

  const canContinue =
    Boolean(decision) &&
    basisIds.length > 0 &&
    (decision !== "other" ||
      (Boolean(decisionValue.trim()) && closeOther !== undefined));

  function confirm() {
    if (!decision || !canContinue) return;

    props.onConfirm({
      human_actor_id: props.humanActorId,
      target_ids: [...props.targetIds],
      basis_ids: basisIds,
      decision,
      decision_value:
        decision === "other" ? decisionValue.trim() : undefined,
      candidate_id: candidateId,
      note: note.trim() || undefined,
      close_unresolved:
        decision === "other" ? closeOther : undefined,
    });
    setConfirming(false);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section>
        <h3 style={{ marginTop: 0 }}>{t("人間による最終解決（Human Resolution）")}</h3>
        <p>
          {t("AIの提案は参考情報です。決定（Decision）と根拠（Basis）は人間が明示的に選択します。")}
        </p>
      </section>

      <section>
        <h4>{t("対象")}</h4>
        {props.targetIds.map((id) => (
          <div key={id} style={{ marginBottom: 8 }}>
            <div>{itemLabel(props.document, id, t)}</div>
            <small style={{ opacity: .55 }}>{id}</small>
          </div>
        ))}
      </section>

      {candidates.length > 0 && (
        <section>
          <h4>{t("AI提案 — 未解決")}</h4>
          {candidates.map((candidate) => (
            <label
              key={candidate.candidate_id}
              style={{ display: "block", marginBottom: 8 }}
            >
              <input
                type="radio"
                name="candidate"
                checked={candidateId === candidate.candidate_id}
                onChange={() => setCandidateId(candidate.candidate_id)}
              />
              {" "}
              {candidate.proposal}
              {candidate.suggested_decision && (
                <small style={{ marginLeft: 8, opacity: .65 }}>
                  {t("提案された決定")}: {decisionLabel(candidate.suggested_decision, t)} ({t("未選択")})
                </small>
              )}
            </label>
          ))}
        </section>
      )}

      <section>
        <h4>1. {t("決定（Decision）")}</h4>
        <select
          value={decision}
          onChange={(event) =>
            setDecision(event.target.value as HumanDecision | "")
          }
        >
          <option value="">{t("未選択")}</option>
          <option value="accept">{t("採用（Accept）")}</option>
          <option value="reject">{t("却下（Reject）")}</option>
          <option value="hold">{t("保留（Hold）")}</option>
          <option value="other">{t("その他（Other）")}</option>
        </select>

        {decision === "other" && (
          <div style={{ marginTop: 8 }}>
            <input
              value={decisionValue}
              onChange={(event) => setDecisionValue(event.target.value)}
              placeholder={t("その他の決定内容")}
            />
            <fieldset style={{ marginTop: 8 }}>
              <legend>{t("未解決状態をどうするか（明示必須）")}</legend>
              <label>
                <input
                  type="radio"
                  name="other-close"
                  checked={closeOther === true}
                  onChange={() => setCloseOther(true)}
                />
                {" "}
                {t("閉じる")}
              </label>
              <label style={{ marginLeft: 12 }}>
                <input
                  type="radio"
                  name="other-close"
                  checked={closeOther === false}
                  onChange={() => setCloseOther(false)}
                />
                {" "}
                {t("維持する")}
              </label>
            </fieldset>
          </div>
        )}
      </section>

      <section>
        <h4>2. {t("根拠（Basis）")}</h4>
        <p>{t("根拠（Basis）は自動入力しません。")}</p>
        <div style={{ maxHeight: 240, overflow: "auto" }}>
          {basisOptions.map((id) => (
            <label
              key={id}
              style={{
                display: "block",
                padding: "5px 0",
                borderBottom: "1px solid rgba(127,127,127,.12)",
              }}
            >
              <input
                type="checkbox"
                checked={basisIds.includes(id)}
                onChange={() => toggleBasis(id)}
              />
              {" "}
              {itemLabel(props.document, id, t)}
              <small
                style={{ display: "block", marginLeft: 22, opacity: .5 }}
              >
                {id}
              </small>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h4>3. {t("メモ（Note）")}</h4>
        <textarea
          style={{ width: "100%", minHeight: 72 }}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </section>

      {!confirming ? (
        <div style={{ display: "flex", gap: 8 }}>
          {props.onCancel && (
            <button onClick={props.onCancel}>{t("キャンセル")}</button>
          )}
          <button
            disabled={!canContinue}
            onClick={() => setConfirming(true)}
          >
            {t("確認へ")}
          </button>
        </div>
      ) : (
        <section>
          <h4>4. {t("確認（Confirm）")}</h4>
          <p>
{t("新しいResolution / DecisionHistory / Revisionを追記します。既存履歴は削除しません。")}
          </p>
          <button onClick={() => setConfirming(false)}>{t("戻る")}</button>
          <button onClick={confirm} style={{ marginLeft: 8 }}>
            {t("人間による解決を記録")}
          </button>
        </section>
      )}
    </div>
  );
}
