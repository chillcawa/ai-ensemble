import { useEffect, useRef, useState } from "react";
import type { ProviderSlot } from "../types/app";
import { capabilityBadges } from "../models/capabilities";
import { providerImportSupport } from "../archive/registry";
import { providerDefinition } from "../providers/registry";
import { useI18n } from "../i18n";
import { slotIdAtPoint } from "../models/slotOrder";

export function ProviderGrid({ slots, onToggle, onMove, onReorder }: {
  slots: ProviderSlot[];
  onToggle: (slotId: string, enabled: boolean) => void;
  onMove: (slotId: string, direction: -1 | 1) => void;
  onReorder: (draggedSlotId: string, targetSlotId: string) => void;
}) {
  const { t } = useI18n();
  const stripRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState({ index: 0, atStart: true, atEnd: false });
  const [draggedSlotId, setDraggedSlotId] = useState<string | null>(null);
  const [dropTargetSlotId, setDropTargetSlotId] = useState<string | null>(null);
  const draggedSlotIdRef = useRef<string | null>(null);
  const dropTargetSlotIdRef = useRef<string | null>(null);

  function updatePosition() {
    const strip = stripRef.current;
    if (!strip) return;
    const maxScroll = Math.max(0, strip.scrollWidth - strip.clientWidth);
    const firstCard = strip.querySelector<HTMLElement>(".provider-card");
    const step = (firstCard?.offsetWidth ?? 248) + 16;
    setPosition({
      index: Math.min(slots.length - 1, Math.max(0, Math.round(strip.scrollLeft / step))),
      atStart: strip.scrollLeft <= 2,
      atEnd: maxScroll <= 2 || strip.scrollLeft >= maxScroll - 2,
    });
  }

  function slide(direction: -1 | 1) {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollBy({ left: direction * Math.max(264, strip.clientWidth * 0.75), behavior: "smooth" });
  }

  function updatePointerDropTarget(clientX: number, clientY: number) {
    const draggedId = draggedSlotIdRef.current;
    if (!draggedId) return;

    // Some Windows WebViews report the pointer-capturing handle from
    // elementFromPoint(), even while the pointer is visibly over another card.
    // Compare against every card's viewport rectangle instead.
    const strip = stripRef.current;
    const cards = strip
      ? Array.from(strip.querySelectorAll<HTMLElement>("[data-provider-slot-id]"))
      : [];
    const targetId = slotIdAtPoint(cards.flatMap((candidate) => {
      const slotId = candidate.dataset.providerSlotId;
      if (!slotId) return [];
      const bounds = candidate.getBoundingClientRect();
      return [{ slotId, left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }];
    }), draggedId, clientX, clientY);
    const nextTargetId = targetId && targetId !== draggedId ? targetId : null;
    dropTargetSlotIdRef.current = nextTargetId;
    setDropTargetSlotId(nextTargetId);

    if (!strip) return;
    const bounds = strip.getBoundingClientRect();
    const edgeSize = Math.min(72, bounds.width * 0.16);
    if (clientX < bounds.left + edgeSize) strip.scrollLeft -= 18;
    else if (clientX > bounds.right - edgeSize) strip.scrollLeft += 18;
  }

  function finishPointerReorder(handle: HTMLButtonElement, pointerId: number, commit: boolean) {
    const draggedId = draggedSlotIdRef.current;
    const targetId = dropTargetSlotIdRef.current;
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);

    draggedSlotIdRef.current = null;
    dropTargetSlotIdRef.current = null;
    setDraggedSlotId(null);
    setDropTargetSlotId(null);

    if (commit && draggedId && targetId) onReorder(draggedId, targetId);
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
    };
  }, [slots.length]);

  return (
    <section className="provider-slider">
      <div className="provider-slider-toolbar">
        <div>
          <strong>{t("送信対象AI")}</strong>
          <small>{slots.filter((slot) => slot.enabled).length} / {slots.length} {t("選択中")}</small>
          <small className="provider-reorder-hint">⠿ {t("ドラッグして並べ替え")}</small>
        </div>
        <div className="provider-slider-controls">
          <small>{Math.min(position.index + 1, slots.length)} / {slots.length}</small>
          <button type="button" className="secondary-button" disabled={position.atStart} onClick={() => slide(-1)} aria-label={t("前のAIを表示")}>‹</button>
          <button type="button" className="secondary-button" disabled={position.atEnd} onClick={() => slide(1)} aria-label={t("次のAIを表示")}>›</button>
        </div>
      </div>
      <section className="provider-grid" ref={stripRef} onScroll={updatePosition} aria-label={t("AI送信対象スライダー")}>
      {slots.map((slot, index) => {
        const importSupport = providerImportSupport(slot.key);
        const providerMeta = providerDefinition(slot.key);
        return (
        <div
          className={`provider-card${draggedSlotId === slot.id ? " provider-card-dragging" : ""}${dropTargetSlotId === slot.id ? " provider-card-drop-target" : ""}`}
          key={slot.id}
          data-provider-slot-id={slot.id}
        >
          <div className="provider-card-order-row">
            <button
              type="button"
              className="provider-drag-handle"
              title={t("ドラッグして並べ替え")}
              aria-label={`${slot.label}: ${t("ドラッグして並べ替え")}`}
              onPointerDown={(event) => {
                if (!event.isPrimary || event.button !== 0) return;
                event.preventDefault();
                draggedSlotIdRef.current = slot.id;
                dropTargetSlotIdRef.current = null;
                setDraggedSlotId(slot.id);
                setDropTargetSlotId(null);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!draggedSlotIdRef.current) return;
                event.preventDefault();
                updatePointerDropTarget(event.clientX, event.clientY);
              }}
              onPointerUp={(event) => {
                updatePointerDropTarget(event.clientX, event.clientY);
                finishPointerReorder(event.currentTarget, event.pointerId, true);
              }}
              onPointerCancel={(event) => finishPointerReorder(event.currentTarget, event.pointerId, false)}
            >⠿</button>
            <span>{index + 1}</span>
            <div className="provider-order-buttons">
              <button type="button" disabled={index === 0} onClick={() => onMove(slot.id, -1)} title={t("左へ移動")} aria-label={`${slot.label}: ${t("左へ移動")}`}>←</button>
              <button type="button" disabled={index === slots.length - 1} onClick={() => onMove(slot.id, 1)} title={t("右へ移動")} aria-label={`${slot.label}: ${t("右へ移動")}`}>→</button>
            </div>
          </div>
          <label className="provider-title">
            <input type="checkbox" checked={slot.enabled} onChange={(e) => onToggle(slot.id, e.target.checked)} />
            {slot.label}
            <span className="selection-hint">{slot.enabled ? t("送信対象") : t("送信対象外")}</span>
          </label>
          <div className="model-caption">{slot.model.id}</div>
          <div className="provider-capability-strip">
            {capabilityBadges(slot.model).slice(0, 4).map((badge) => <span key={badge.label} className={`capability-badge ${badge.tone}`}>{badge.label}</span>)}
          </div>
          <div className="provider-status">{slot.keySaved ? t("✓ APIキー設定済み") : t("⚠ APIキー未設定（設定から登録）")} ・ {providerMeta.displayName}</div>
          <div className="provider-import-status">{t("翻訳機")}: {importSupport.status === "dedicated" ? importSupport.dedicated.map((adapter) => adapter.displayName).join(" / ") : "Generic fallback"}</div>
        </div>
      );})}
      </section>
    </section>
  );
}
