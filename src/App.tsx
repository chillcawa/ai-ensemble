import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  TauriProvider,
} from "./providers/tauriProvider";
import { broadcastQuestion, type BroadcastResult } from "./orchestrator/orchestrator";
import type { CostEstimate, DisplayCurrency, ExchangeMode, ProviderSlot, ThemeMode, UsageSummary } from "./types/app";
import { INITIAL_SLOTS, catalogForSlot } from "./models/slots";
import { recommendModelsForSlots } from "./models/recommendation";
import { readStorage, writeStorage } from "./storage/localSettings";
import { formatCostCurrency, formatTokens } from "./format";
import { SettingsPanel } from "./components/SettingsPanel";
import { ProviderGrid } from "./components/ProviderGrid";
import { QuestionComposer } from "./components/QuestionComposer";
import { ResultBoard } from "./components/ResultBoard";
import { TextPad } from "./components/TextPad";
import { ContextPanel } from "./components/ContextPanel";
import { HandoffModal, type HandoffRequest, type HandoffSourceMeta } from "./components/HandoffModal";
import { HandoffResults, type HandoffRun } from "./components/HandoffResults";
import { ConversationSidebar } from "./components/ConversationSidebar";
import { ProjectBar } from "./components/ProjectBar";
import { ContextLibrary } from "./components/ContextLibrary";
import { ConversationArchive } from "./components/ConversationArchive";
import { ConversationHistory } from "./components/ConversationHistory";
import { resolveTimeZone, type TimeZoneMode, type TurnOrder } from "./time/display";
import { ModelPickerPopover } from "./components/ModelPickerPopover";
import { ConfirmModal } from "./components/ConfirmModal";
import { ContextReloadModal, type ContextReloadMode } from "./components/ContextReloadModal";
import { TrialNotice } from "./components/TrialNotice";
import type { ContextItem } from "./context/types";
import { assembleContext } from "./context/assembler";
import { normalizedHandoffRequestToMessages, normalizedRequestToMessages } from "./context/messages";
import { estimateContextBudget, estimateContextTokens } from "./context/budget";
import { loadPersistentContext } from "./context/storage";
import { hasContextStateKey, loadContextItemsSqlite, loadContextMigrationCompleted, loadContextSetSelectionsSqlite, loadContextSetsSqlite, saveContextItemsSqlite, saveContextMigrationCompleted, saveContextSetSelectionsSqlite, saveContextSetsSqlite } from "./context/sqliteStorage";
import { contextItemsForConversation, isolateSharedSetInstructions, loadContextSets, loadContextSetSelections, type ContextSet } from "./context/sets";
import { appendConversationMessage, createConversation, deleteConversation, listConversations, loadConversationMessages, moveConversation, renameConversation } from "./conversation/storage";
import type { ConversationMessage, ConversationSummary } from "./conversation/types";
import { listProjects, createProject, renameProject, deleteProject } from "./project/storage";
import type { Project } from "./project/types";
import { historyForSlot } from "./conversation/types";
import { snapshotAppliedAiReferences } from "./conversation/observation";
import { useProviderSettings } from "./hooks/useProviderSettings";
import { APP_VERSION, TRIAL_NOTICE_STORAGE_KEY } from "./version";
import { applyImportedFrontendSettings, type UserDataExportFile } from "./data/userDataTransfer";
import { useI18n } from "./i18n";
import "./styles.css";

const DEFAULT_EXCHANGE_RATE = 150;
const DEFAULT_CURRENCY_RATES: Record<DisplayCurrency, number> = { USD: 1, JPY: 150, EUR: 0, GBP: 0, CNY: 0, KRW: 0 };
const MAX_OUTPUT_TOKENS = 1024;
const WORKSPACE_PROJECT_ID = "workspace-default";
const DRAFT_CONVERSATION_ID = "__draft_conversation__";

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function App() {
  const { locale, t } = useI18n();
  const { slots, modelCatalogs, modelLoading, modelErrors, refreshModels, updateSlot, moveProviderSlot, reorderProviderSlot, saveKey: handleSaveKey, deleteKey: handleDeleteKey } = useProviderSettings();
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<Record<string, BroadcastResult>>({});
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => readStorage("ai-ensemble-theme", "system"));
  const [timeZoneMode, setTimeZoneMode] = useState<TimeZoneMode>(() => readStorage("ai-ensemble-timezone-mode", "system"));
  const [manualTimeZone, setManualTimeZone] = useState<string>(() => readStorage("ai-ensemble-timezone-manual", "Asia/Tokyo"));
  const [turnOrder, setTurnOrder] = useState<TurnOrder>(() => readStorage("ai-ensemble-turn-order", "oldest_first"));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [exchangeMode] = useState<ExchangeMode>(() => readStorage("ai-ensemble-exchange-mode", "fixed"));
  const [manualRate] = useState<number>(() => readStorage("ai-ensemble-manual-rate", DEFAULT_EXCHANGE_RATE));
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(() => readStorage("ai-ensemble-display-currency", "JPY"));
  const [currencyRates, setCurrencyRates] = useState<Record<DisplayCurrency, number>>(() => readStorage("ai-ensemble-currency-rates", DEFAULT_CURRENCY_RATES));
  const [showTopButton, setShowTopButton] = useState(false);
  const [estimates, setEstimates] = useState<CostEstimate[]>([]);
  const [textPadOpen, setTextPadOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState<number[]>(() => {
    const saved = readStorage<number[]>("ai-ensemble-column-widths", []);
    return INITIAL_SLOTS.map((_, index) => saved[index] ?? 420);
  });
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [lastSendMeta, setLastSendMeta] = useState<Record<string, { question: string; contextIds: string[]; instructions: string[]; aiReferenceSources: ReturnType<typeof snapshotAppliedAiReferences> }>>({});
  const [handoffSource, setHandoffSource] = useState<{ slot: ProviderSlot; result: BroadcastResult; meta: HandoffSourceMeta } | null>(null);
  const [recommendationsEnabled, setRecommendationsEnabled] = useState<boolean>(() => readStorage("ai-ensemble-model-recommendations-enabled", true));
  const [handoffRuns, setHandoffRuns] = useState<HandoffRun[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [resultMessageIds, setResultMessageIds] = useState<Record<string, string>>({});
  const [modelPickerSlotId, setModelPickerSlotId] = useState<string | null>(null);
  const [conversationDeleteTarget, setConversationDeleteTarget] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => readStorage("ai-ensemble-conversation-sidebar-open", true));
  const [contextSets, setContextSets] = useState<ContextSet[]>([]);
  const [contextSetSelections, setContextSetSelections] = useState<Record<string, string | null>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>(() => readStorage("ai-ensemble-current-project-id", WORKSPACE_PROJECT_ID));
  const [contextLibraryOpen, setContextLibraryOpen] = useState(false);
  const [conversationArchiveOpen, setConversationArchiveOpen] = useState(false);
  const [contextStorageReady, setContextStorageReady] = useState(false);
  const [contextStorageError, setContextStorageError] = useState<string | null>(null);
  const [contextHydrationRetry, setContextHydrationRetry] = useState(0);
  const [contextReloadOpen, setContextReloadOpen] = useState(false);
  const [contextReloadBusy, setContextReloadBusy] = useState(false);
  const [trialNoticeOpen, setTrialNoticeOpen] = useState<boolean>(() => !readStorage(TRIAL_NOTICE_STORAGE_KEY, false));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const syncFullscreenState = async () => {
      try {
        const fullscreen = await appWindow.isFullscreen();
        if (!disposed) setIsFullscreen(fullscreen);
      } catch {
        // The toggle action reports errors to the user. Initial state sync is best-effort.
      }
    };

    void syncFullscreenState();
    void appWindow.onResized(() => void syncFullscreenState())
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch(() => {
        // Fullscreen still works if native resize observation is unavailable.
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  async function toggleFullscreen() {
    try {
      const appWindow = getCurrentWindow();
      const next = !(await appWindow.isFullscreen());
      await appWindow.setFullscreen(next);
      setIsFullscreen(next);
      setFullscreenError(null);
    } catch (err) {
      setFullscreenError(`全画面表示を切り替えられませんでした: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function exportUserData(): Promise<string> {
    const frontendSettings = {
      theme,
      timeZoneMode,
      manualTimeZone,
      turnOrder,
      exchangeMode,
      manualRate,
      displayCurrency,
      currencyRates,
      columnWidths,
      recommendationsEnabled,
      sidebarOpen,
      currentProjectId,
      trialNoticeAccepted: readStorage(TRIAL_NOTICE_STORAGE_KEY, false),
      language: locale,
      textPad: {
        activeDocumentId: readStorage<string | null>("ai-ensemble-textpad-active-id", null),
        pastedSnippets: readStorage<unknown[]>("ai-ensemble-pasted-snippets", []),
      },
      providerSlots: slots.map((slot) => ({
        slotId: slot.id,
        provider: slot.key,
        nickname: slot.label,
        enabled: slot.enabled,
        modelId: slot.model.id,
      })),
    };
    return invoke<string>("export_user_data", { frontendSettings });
  }

  async function importUserData(payload: UserDataExportFile): Promise<void> {
    await invoke("import_user_data", { payload });
    applyImportedFrontendSettings(payload.frontend_settings);
    window.location.reload();
  }

  const displayRate = displayCurrency === "USD" ? 1 : (currencyRates[displayCurrency] ?? 0);
  const recommendations = useMemo(() => recommendModelsForSlots(question, slots, modelCatalogs), [question, slots, modelCatalogs]);
  const activeSlots = useMemo(() => slots.filter((s) => s.enabled && s.keySaved), [slots]);
  const draftConversationId = `${DRAFT_CONVERSATION_ID}:${currentProjectId}`;
  const conversationKey = currentConversationId ?? draftConversationId;
  const currentProject = useMemo(() => projects.find((project) => project.id === currentProjectId) ?? null, [projects, currentProjectId]);
  const projectContextSets = useMemo(() => contextSets.filter((set) => (set.projectId ?? WORKSPACE_PROJECT_ID) === currentProjectId), [contextSets, currentProjectId]);
  const projectContextItems = useMemo(() => contextItems.filter((item) => {
    if (item.scope === "global") return true;
    if (item.scope === "session") return item.conversationId === conversationKey;
    return (item.projectId ?? WORKSPACE_PROJECT_ID) === currentProjectId;
  }), [contextItems, currentProjectId, conversationKey]);
  const selectedContextSetId = contextSetSelections[conversationKey] ?? null;
  const selectedContextSet = useMemo(() => projectContextSets.find((set) => set.id === selectedContextSetId) ?? null, [projectContextSets, selectedContextSetId]);
  const scopedContextItems = useMemo(() => contextItemsForConversation(projectContextItems, selectedContextSet, conversationKey), [projectContextItems, selectedContextSet, conversationKey]);
  const activeContextItems = useMemo(() => scopedContextItems.filter((item) => item.enabled), [scopedContextItems]);
  const contextTokens = useMemo(() => estimateContextTokens(activeContextItems), [activeContextItems]);
  const contextPreview = useMemo(() => activeContextItems.slice(0, 4).map((item) => item.title), [activeContextItems]);

  const contextWarning = useMemo(() => {
    for (const slot of activeSlots) {
      const req = assembleContext({ slotId: slot.id, projectId: currentProjectId, conversationId: conversationKey, contextItems: scopedContextItems, history: historyForSlot(conversationMessages, slot.id), userMessage: question || "(empty)" });
      const budget = estimateContextBudget(req, slot.model);
      if (budget.exceedsKnownLimit) return `${slot.label} のContext上限を超える可能性があります`;
      if (budget.ratio != null && budget.ratio > 0.8) return `${slot.label} のContext上限の80%を超えています`;
    }
    return null;
  }, [activeSlots, scopedContextItems, conversationMessages, question, conversationKey]);

  useEffect(() => {
    const applyTheme = () => {
      document.documentElement.dataset.theme = theme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : theme;
    };
    applyTheme();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => { if (theme === "system") applyTheme(); };
    media.addEventListener("change", onSystemChange);
    writeStorage("ai-ensemble-theme", theme);
    return () => media.removeEventListener("change", onSystemChange);
  }, [theme]);

  useEffect(() => {
    writeStorage("ai-ensemble-exchange-mode", exchangeMode);
    writeStorage("ai-ensemble-manual-rate", manualRate);
  }, [exchangeMode, manualRate]);
  useEffect(() => {
    writeStorage("ai-ensemble-display-currency", displayCurrency);
    writeStorage("ai-ensemble-currency-rates", currencyRates);
  }, [displayCurrency, currencyRates]);

  useEffect(() => {
    const updateTopButton = () => setShowTopButton(window.scrollY > 480);
    updateTopButton();
    window.addEventListener("scroll", updateTopButton, { passive: true });
    return () => window.removeEventListener("scroll", updateTopButton);
  }, []);
  useEffect(() => writeStorage("ai-ensemble-column-widths", columnWidths), [columnWidths]);
  useEffect(() => { if (contextStorageReady) void saveContextItemsSqlite(contextItems); }, [contextItems, contextStorageReady]);
  useEffect(() => writeStorage("ai-ensemble-model-recommendations-enabled", recommendationsEnabled), [recommendationsEnabled]);
  useEffect(() => writeStorage("ai-ensemble-timezone-mode", timeZoneMode), [timeZoneMode]);
  useEffect(() => writeStorage("ai-ensemble-timezone-manual", manualTimeZone), [manualTimeZone]);
  useEffect(() => writeStorage("ai-ensemble-turn-order", turnOrder), [turnOrder]);
  useEffect(() => writeStorage("ai-ensemble-conversation-sidebar-open", sidebarOpen), [sidebarOpen]);
  useEffect(() => writeStorage("ai-ensemble-current-project-id", currentProjectId), [currentProjectId]);
  useEffect(() => { if (contextStorageReady) void saveContextSetsSqlite(contextSets); }, [contextSets, contextStorageReady]);
  useEffect(() => { if (contextStorageReady) void saveContextSetSelectionsSqlite(contextSetSelections); }, [contextSetSelections, contextStorageReady]);

  // A fresh Project/Conversation starts with an active Context Set instead of
  // the blank "Setなし" state. Explicit null is still authoritative: once the
  // user deliberately selects "Setなし", never auto-enable a Set again for
  // that conversation.
  useEffect(() => {
    if (!contextStorageReady) return;
    const hasExplicitSelection = Object.prototype.hasOwnProperty.call(contextSetSelections, conversationKey);
    if (hasExplicitSelection) return;

    const existingDefault = projectContextSets[0];
    if (existingDefault) {
      setContextSetSelections((prev) => ({ ...prev, [conversationKey]: existingDefault.id }));
      return;
    }

    const now = new Date().toISOString();
    const defaultSet: ContextSet = {
      id: uid("context-set"),
      name: "Default",
      projectId: currentProjectId,
      itemIds: [],
      createdAt: now,
      updatedAt: now,
    };
    setContextSets((prev) => [...prev, defaultSet]);
    setContextSetSelections((prev) => ({ ...prev, [conversationKey]: defaultSet.id }));
  }, [contextStorageReady, contextSetSelections, conversationKey, projectContextSets, currentProjectId]);

  // v0.8.1 hotfix migration: older builds could put the same editable
  // Project/slot Instruction object into more than one Context Set. Repair
  // that once on startup by cloning shared Instructions per Set.
  useEffect(() => {
    if (!contextStorageReady) return;
    const repaired = isolateSharedSetInstructions(contextItems, contextSets);
    if (!repaired.changed) return;
    setContextItems(repaired.items);
    setContextSets(repaired.sets);
  }, [contextStorageReady]);
  useEffect(() => setColumnWidths((prev) => slots.map((_, i) => prev[i] ?? 420)), [slots.length]);

  const refreshUsage = useCallback(async () => {
    try {
      setUsage(await invoke<UsageSummary>("get_usage_summary"));
      setUsageError(null);
    } catch (err) {
      setUsageError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const refreshConversations = useCallback(async (autoLoadLatest = false) => {
    try {
      const list = await listConversations(currentProjectId);
      setConversations(list);
      if (autoLoadLatest) {
        if (list.length > 0) {
          const latest = list[0];
          setCurrentConversationId(latest.id);
          setConversationMessages(await loadConversationMessages(latest.id));
        } else {
          setCurrentConversationId(null);
          setConversationMessages([]);
        }
      }
    } catch (err) {
      console.error("conversation list failed", err);
    }
  }, [currentProjectId]);

  async function openConversation(conversationId: string) {
    setCurrentConversationId(conversationId);
    setConversationMessages(await loadConversationMessages(conversationId));
    setResults({});
    setHandoffRuns([]);
    setResultMessageIds({});
    setQuestion("");
  }

  function newConversation() {
    setContextItems((prev) => prev.filter((item) => !(item.scope === "session" && item.conversationId === draftConversationId)));
    setContextSetSelections((prev) => { const next = { ...prev }; delete next[draftConversationId]; return next; });
    setCurrentConversationId(null);
    setConversationMessages([]);
    setResults({});
    setHandoffRuns([]);
    setResultMessageIds({});
    setQuestion("");
  }

  async function removeConversation(conversationId: string) {
    await deleteConversation(conversationId);
    setContextItems((prev) => prev.filter((item) => item.conversationId !== conversationId));
    setContextSetSelections((prev) => { const next = { ...prev }; delete next[conversationId]; return next; });
    if (currentConversationId === conversationId) newConversation();
    await refreshConversations(false);
  }

  async function renameConversationTitle(conversationId: string, title: string) {
    await renameConversation(conversationId, title);
    await refreshConversations(false);
  }

  async function moveConversationToProject(conversationId: string, targetProjectId: string) {
    if (!targetProjectId || targetProjectId === currentProjectId) return;
    await moveConversation(conversationId, targetProjectId);
    // Session Context belongs to the Conversation, so keep it and move its project scope.
    setContextItems((prev) => prev.map((item) => item.scope === "session" && item.conversationId === conversationId ? { ...item, projectId: targetProjectId, updatedAt: new Date().toISOString() } : item));
    // A Context Set is project-scoped. Never carry a selection across the boundary.
    setContextSetSelections((prev) => ({ ...prev, [conversationId]: null }));
    if (currentConversationId === conversationId) {
      setCurrentConversationId(null);
      setConversationMessages([]);
      setResults({});
      setHandoffRuns([]);
      setResultMessageIds({});
      setQuestion("");
    }
    await refreshConversations(false);
  }

  async function ensureConversation(firstQuestion: string): Promise<string> {
    if (currentConversationId) return currentConversationId;
    const id = uid("conversation");
    const compact = firstQuestion.replace(/\s+/g, " ").trim();
    const title = compact.length > 42 ? `${compact.slice(0, 42)}…` : compact || "新しい会話";
    await createConversation(id, title, currentProjectId);
    setCurrentConversationId(id);
    setContextItems((prev) => prev.map((item) => item.scope === "session" && item.conversationId === draftConversationId ? { ...item, conversationId: id, updatedAt: new Date().toISOString() } : item));
    setContextSetSelections((prev) => {
      if (!(draftConversationId in prev)) return prev;
      const next = { ...prev, [id]: prev[draftConversationId] ?? null };
      delete next[draftConversationId];
      return next;
    });
    await refreshConversations(false);
    return id;
  }

  function createContextSet(name: string) {
    const now = new Date().toISOString();
    const id = uid("context-set");
    // New means blank. Use Duplicate when the user explicitly wants to copy
    // the selected Set. This prevents newly-created Sets from silently sharing
    // the same editable Instruction objects.
    setContextSets((prev) => [...prev, { id, name, projectId: currentProjectId, itemIds: [], createdAt: now, updatedAt: now }]);
    setContextSetSelections((prev) => ({ ...prev, [conversationKey]: id }));
  }

  function renameContextSet(id: string, name: string) {
    setContextSets((prev) => prev.map((set) => set.id === id ? { ...set, name, updatedAt: new Date().toISOString() } : set));
  }

  function duplicateContextSet(id: string) {
    const source = contextSets.find((set) => set.id === id);
    if (!source) return;
    const now = new Date().toISOString();
    const copyId = uid("context-set");

    // References may be shared between Sets, but editable Instructions are
    // cloned so editing the duplicate never mutates the source Set.
    const nextItemIds: string[] = [];
    const instructionClones: ContextItem[] = [];
    for (const itemId of source.itemIds) {
      const item = contextItems.find((candidate) => candidate.id === itemId);
      if (item?.role === "instruction" && item.scope !== "global" && item.scope !== "session") {
        const clonedId = uid("instruction");
        instructionClones.push({ ...item, id: clonedId, createdAt: now, updatedAt: now });
        nextItemIds.push(clonedId);
      } else {
        nextItemIds.push(itemId);
      }
    }
    if (instructionClones.length > 0) setContextItems((prev) => [...prev, ...instructionClones]);
    setContextSets((prev) => [...prev, { ...source, id: copyId, projectId: currentProjectId, name: `${source.name} copy`, itemIds: nextItemIds, createdAt: now, updatedAt: now }]);
    setContextSetSelections((prev) => ({ ...prev, [conversationKey]: copyId }));
  }

  function deleteContextSet(id: string) {
    setContextSets((prev) => prev.filter((set) => set.id !== id));
    setContextSetSelections((prev) => Object.fromEntries(Object.entries(prev).map(([key, value]) => [key, value === id ? null : value])));
  }

  function toggleContextSetItem(setId: string, itemId: string, included: boolean) {
    if (included) {
      setContextItems((prev) => prev.map((item) => item.id === itemId && item.scope === "session"
        ? { ...item, scope: "project", projectId: currentProjectId, conversationId: undefined, lifetime: "persistent", updatedAt: new Date().toISOString() }
        : item));
    }
    setContextSets((prev) => prev.map((set) => {
      if (set.id !== setId) return set;
      const itemIds = included ? Array.from(new Set([...set.itemIds, itemId])) : set.itemIds.filter((id) => id !== itemId);
      return { ...set, itemIds, updatedAt: new Date().toISOString() };
    }));
  }

  async function handleCreateProject(name: string) {
    const project = await createProject(uid("project"), name);
    setProjects((prev) => [project, ...prev]);
    setCurrentProjectId(project.id);
  }

  async function handleRenameProject(projectId: string, name: string) {
    const updated = await renameProject(projectId, name);
    setProjects((prev) => prev.map((project) => project.id === projectId ? updated : project));
  }

  async function handleDeleteProject(projectId: string) {
    if (projectId === WORKSPACE_PROJECT_ID) return;
    await deleteProject(projectId);
    const removedSetIds = new Set(contextSets.filter((set) => (set.projectId ?? WORKSPACE_PROJECT_ID) === projectId).map((set) => set.id));
    setContextItems((prev) => prev.filter((item) => item.scope === "global" || (item.projectId ?? WORKSPACE_PROJECT_ID) !== projectId));
    setContextSets((prev) => prev.filter((set) => (set.projectId ?? WORKSPACE_PROJECT_ID) !== projectId));
    setContextSetSelections((prev) => Object.fromEntries(Object.entries(prev).filter(([, setId]) => !setId || !removedSetIds.has(setId))));
    setProjects((prev) => prev.filter((project) => project.id !== projectId));
    if (currentProjectId === projectId) setCurrentProjectId(WORKSPACE_PROJECT_ID);
  }

  function addLibraryItem(item: ContextItem, addToSetId?: string | null) {
    setContextItems((prev) => [...prev, item]);
    if (addToSetId) toggleContextSetItem(addToSetId, item.id, true);
  }

  function updateLibraryItem(id: string, patch: Partial<ContextItem>) {
    setContextItems((prev) => prev.map((item) => item.id === id ? { ...item, ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() } : item));
  }

  useEffect(() => {
    let cancelled = false;
    setContextStorageReady(false);
    setContextStorageError(null);

    (async () => {
      try {
        // Read sequentially instead of opening several SQLite connections at once.
        // This also makes failures easier to localize in the visible error message.
        const projectList = await listProjects();
        if (cancelled) return;
        setProjects(projectList);

        const validProjectId = projectList.some((project) => project.id === currentProjectId)
          ? currentProjectId
          : WORKSPACE_PROJECT_ID;
        if (validProjectId !== currentProjectId) setCurrentProjectId(validProjectId);

        let items = await loadContextItemsSqlite();
        if (cancelled) return;
        let sets = await loadContextSetsSqlite();
        if (cancelled) return;
        let selections = await loadContextSetSelectionsSqlite();
        if (cancelled) return;

        // One-time localStorage migration for pre-v0.9 Persistent Context/Set data.
        // localStorage is migration input only, never runtime state.
        const migrationCompleted = await loadContextMigrationCompleted();
        if (cancelled) return;

        const itemsKeyExists = await hasContextStateKey("context_items_v1");
        const setsKeyExists = await hasContextStateKey("context_sets_v1");
        const selectionsKeyExists = await hasContextStateKey("context_set_selections_v1");
        if (cancelled) return;

        if (!migrationCompleted) {
          const legacyItems = loadPersistentContext();
          const legacySets = loadContextSets();
          const legacySelections = loadContextSetSelections();

          if (!itemsKeyExists) {
            items = legacyItems.map((item) => ({
              ...item,
              projectId: item.scope === "global" ? item.projectId : (item.projectId ?? WORKSPACE_PROJECT_ID),
            }));
            await saveContextItemsSqlite(items);
          }
          if (!setsKeyExists) {
            sets = legacySets.map((set) => ({ ...set, projectId: set.projectId ?? WORKSPACE_PROJECT_ID }));
            await saveContextSetsSqlite(sets);
          }
          if (!selectionsKeyExists) {
            selections = legacySelections;
            await saveContextSetSelectionsSqlite(selections);
          }

          await saveContextMigrationCompleted();
        }

        if (cancelled) return;
        setContextItems(items);
        setContextSets(sets);
        setContextSetSelections(selections);
        setContextStorageError(null);
        setContextStorageReady(true);
      } catch (err) {
        console.error("project/context SQLite hydration failed", err);
        if (!cancelled) {
          setContextStorageReady(false);
          setContextStorageError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [contextHydrationRetry]);

  useEffect(() => { void refreshUsage(); }, [refreshUsage]);

  useEffect(() => {
    setCurrentConversationId(null);
    setConversationMessages([]);
    setResults({});
    setHandoffRuns([]);
    setResultMessageIds({});
    setQuestion("");
    void refreshConversations(true);
  }, [currentProjectId]);

  useEffect(() => {
    let cancelled = false;
    if (!question.trim() || activeSlots.length === 0) {
      setEstimates([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const maxInputTokens = Math.max(...activeSlots.map((slot) => {
          const req = assembleContext({ slotId: slot.id, projectId: currentProjectId, conversationId: conversationKey, contextItems: scopedContextItems, history: historyForSlot(conversationMessages, slot.id), userMessage: question.trim() });
          return estimateContextBudget(req, slot.model).estimatedTokens;
        }));
        const next = await invoke<CostEstimate[]>("estimate_send_cost", {
          targets: activeSlots.map((s) => ({ provider: s.key, model: s.model.id })),
          inputTokens: maxInputTokens,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        });
        if (!cancelled) setEstimates(next);
      } catch {
        if (!cancelled) setEstimates([]);
      }
    }, 150);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [question, activeSlots, scopedContextItems, conversationMessages, conversationKey]);

  function setInstruction(scope: "global" | "project" | "slot", content: string, slotId?: string, setId?: string | null) {
    const setItemIds = new Set(setId ? (contextSets.find((set) => set.id === setId)?.itemIds ?? []) : []);
    const allSetItemIds = new Set(contextSets.flatMap((set) => set.itemIds));
    const baseMatch = (item: ContextItem) => item.role === "instruction"
      && item.scope === scope
      && (scope === "global" || (item.projectId ?? WORKSPACE_PROJECT_ID) === currentProjectId)
      && (scope !== "slot" || item.slotId === slotId);
    const existing = contextItems.find((item) => {
      if (!baseMatch(item)) return false;
      if (scope === "global") return true;
      return setId ? setItemIds.has(item.id) : !allSetItemIds.has(item.id);
    });

    if (!content.trim()) {
      if (!existing) return;
      setContextItems((prev) => prev.filter((item) => item.id !== existing.id));
      setContextSets((sets) => sets.map((set) => ({ ...set, itemIds: set.itemIds.filter((id) => id !== existing.id) })));
      return;
    }

    const now = new Date().toISOString();
    if (existing) {
      setContextItems((prev) => prev.map((item) => item.id === existing.id ? { ...item, content, updatedAt: now } : item));
      return;
    }

    const id = uid("instruction");
    const title = scope === "global" ? "Global Instruction" : scope === "project" ? "Project Instruction" : `${slots.find((slot) => slot.id === slotId)?.label ?? "AI"} Instruction`;
    const newItem: ContextItem = {
      id, kind: "instruction", role: "instruction", scope,
      lifetime: "persistent", provenance: "user_authored", title, content,
      enabled: true, projectId: scope === "project" || scope === "slot" ? currentProjectId : undefined,
      slotId: scope === "slot" ? slotId : undefined, createdAt: now, updatedAt: now,
    };
    setContextItems((prev) => [...prev, newItem]);
    if (setId && scope !== "global") {
      setContextSets((sets) => sets.map((set) => set.id === setId ? { ...set, itemIds: Array.from(new Set([...set.itemIds, id])), updatedAt: now } : set));
    }
  }

  function addReference(item: Omit<ContextItem, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    setContextItems((prev) => [...prev, { ...item, conversationId: item.scope === "session" ? (item.conversationId ?? conversationKey) : item.conversationId, id: uid("context"), createdAt: now, updatedAt: now }]);
  }

  async function handleClearUsage() {
    try { await invoke("clear_usage_history"); await refreshUsage(); }
    catch (err) { setUsageError(err instanceof Error ? err.message : String(err)); }
  }

  async function handleContextReload(mode: ContextReloadMode) {
    if (!currentConversationId || contextReloadBusy || busy) return;
    setContextReloadBusy(true);
    try {
      // Flush the exact Context/Set state being reloaded before the boundary is recorded.
      // The normal useEffect persistence is intentionally not relied on here.
      await saveContextItemsSqlite(contextItems);
      await saveContextSetsSqlite(contextSets);
      await saveContextSetSelectionsSqlite(contextSetSelections);

      const hardReset = mode === "reset_history";
      await appendConversationMessage({
        id: uid("context-reload"),
        conversationId: currentConversationId,
        role: "user",
        kind: hardReset ? "context_reload_reset" : "context_reload_keep",
        content: hardReset
          ? "Contextを再読込。この地点より前の会話履歴を以後のAIリクエストへ含めない。"
          : "Contextを再読込。会話履歴は保持し、現在のContextを再評価する。",
        appliedContextIds: activeContextItems.map((item) => item.id),
        targetSlotIds: activeSlots.map((slot) => slot.id),
      });
      // Read back from SQLite so the reset boundary used by the next send is
      // the persisted source of truth, not a potentially stale React snapshot.
      setConversationMessages(await loadConversationMessages(currentConversationId));
      setResults({});
      setHandoffRuns([]);
      setResultMessageIds({});
      setLastSendMeta({});
      setContextReloadOpen(false);
      await refreshConversations(false);
    } catch (err) {
      console.error("context reload failed", err);
    } finally {
      setContextReloadBusy(false);
    }
  }

  async function handleDisableAiReferenceAndReset(_id: string) {
    const now = new Date().toISOString();
    const remainingActive = activeContextItems.filter((item) => item.enabled && item.provenance !== "imported_conversation");
    setContextItems((prev) => prev.map((item) => item.provenance === "imported_conversation" && item.enabled ? { ...item, enabled: false, updatedAt: now } : item));
    if (!currentConversationId) return;
    try {
      const marker = await appendConversationMessage({
        id: uid("context-reload"),
        conversationId: currentConversationId,
        role: "user",
        kind: "context_reload_reset",
        content: "AI Archive ReferenceをOFFにして独立観測へ戻る。この地点より前の会話履歴を以後のAIリクエストへ含めない。",
        appliedContextIds: remainingActive.map((item) => item.id),
        appliedAiReferenceSources: snapshotAppliedAiReferences(remainingActive),
        targetSlotIds: activeSlots.map((slot) => slot.id),
      });
      setConversationMessages((prev) => [...prev, marker]);
      setResults({});
      setHandoffRuns([]);
      setResultMessageIds({});
      setLastSendMeta({});
      await refreshConversations(false);
    } catch (err) {
      console.error("AI reference disable/reset failed", err);
    }
  }

  async function handleSend() {
    if (!contextStorageReady) return;
    if (!question.trim() || busy || activeSlots.length === 0) return;
    const outgoingQuestion = question.trim();
    const wasDraft = !currentConversationId;
    setBusy(true);
    setResults({});
    try {
      const conversationId = await ensureConversation(outgoingQuestion);
      const selectionId = wasDraft ? (contextSetSelections[draftConversationId] ?? null) : (contextSetSelections[conversationId] ?? null);
      const setForSend = contextSets.find((set) => set.id === selectionId) ?? null;
      const remappedItems = contextItems.map((item) => item.scope === "session" && item.conversationId === draftConversationId ? { ...item, conversationId } : item);
      const sendContextItems = contextItemsForConversation(remappedItems, setForSend, conversationId);
      const sendActiveItems = sendContextItems.filter((item) => item.enabled);
      const userMessageId = uid("message-user");
      const userMessage = await appendConversationMessage({
        id: userMessageId, conversationId, role: "user", kind: "normal", content: outgoingQuestion,
        appliedContextIds: sendActiveItems.map((item) => item.id),
        appliedAiReferenceSources: snapshotAppliedAiReferences(sendActiveItems),
        targetSlotIds: activeSlots.map((slot) => slot.id),
      });
      // Reload the persisted transcript before assembling provider history.
      // This makes Context Reload boundaries authoritative even if React state
      // has not yet committed the marker in a very fast reload -> send sequence.
      const persistedBeforeSend = await loadConversationMessages(conversationId);
      const historyBeforeSend = persistedBeforeSend.filter((message) => message.id !== userMessage.id);
      setConversationMessages(persistedBeforeSend);
      setQuestion("");

      const meta: typeof lastSendMeta = {};
      const targets = activeSlots.map((slot) => {
        const normalized = assembleContext({
          slotId: slot.id, projectId: currentProjectId, conversationId, contextItems: sendContextItems,
          history: historyForSlot(historyBeforeSend, slot.id), userMessage: outgoingQuestion,
        });
        meta[slot.id] = {
          question: outgoingQuestion,
          contextIds: [...normalized.instructions, ...normalized.references].map((item) => item.id),
          instructions: normalized.instructions.map((item) => `${item.title}: ${item.content}`),
          aiReferenceSources: snapshotAppliedAiReferences(normalized.references),
        };
        return {
          slotId: slot.id, provider: new TauriProvider(slot.key, slot.label, catalogForSlot(slot)), model: slot.model, messages: normalizedRequestToMessages(normalized),
        };
      });
      setLastSendMeta(meta);
      const finalResults = await broadcastQuestion(targets, outgoingQuestion, (result) => setResults((prev) => ({ ...prev, [result.slotId]: result })), { streaming: true });
      const saved: ConversationMessage[] = [];
      const messageIds: Record<string, string> = {};
      for (const result of finalResults) {
        if (result.status !== "completed") continue;
        const slot = slots.find((candidate) => candidate.id === result.slotId);
        if (!slot) continue;
        const messageId = uid("message-ai");
        const message = await appendConversationMessage({
          id: messageId, conversationId, role: "assistant", kind: "normal", slotId: slot.id, provider: slot.key, model: result.model.id, nickname: slot.label,
          content: result.content, inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd, elapsedMs: result.elapsedMs, appliedContextIds: meta[slot.id]?.contextIds ?? [],
          appliedAiReferenceSources: meta[slot.id]?.aiReferenceSources ?? [],
        });
        saved.push(message); messageIds[slot.id] = messageId;
      }
      setConversationMessages((prev) => [...prev, ...saved]);
      setResultMessageIds(messageIds);
      await refreshConversations(false);
      await refreshUsage();
    } catch (err) {
      console.error("send failed", err);
    } finally {
      setBusy(false);
    }
  }

  function handleAddResultContext(slot: ProviderSlot, result: BroadcastResult) {
    const meta = lastSendMeta[slot.id];
    addReference({
      kind: "ai_response", role: "reference", scope: "session", lifetime: "session", provenance: "ai_generated",
      title: `${slot.label} の回答`, content: result.content, enabled: true,
      source: { provider: slot.key, model: result.model.id, nickname: slot.label, slotId: slot.id, messageId: uid("response") },
      generation: { originalQuestion: meta?.question, appliedContextIds: meta?.contextIds, appliedInstructions: meta?.instructions },
    });
    setContextOpen(true);
  }

  function openHistoricalHandoff(message: ConversationMessage, originalQuestion?: string) {
    if (message.role !== "assistant" || message.kind !== "normal" || !message.slot_id) return;
    const slot = slots.find((candidate) => candidate.id === message.slot_id);
    if (!slot) {
      console.warn("historical handoff source slot is unavailable", message.slot_id);
      return;
    }

    const historicalModelId = message.model ?? slot.model.id;
    const historicalModel = (modelCatalogs[slot.key] ?? catalogForSlot(slot))
      .find((candidate) => candidate.id === historicalModelId)
      ?? { ...slot.model, id: historicalModelId, name: historicalModelId };

    const historicalResult: BroadcastResult = {
      slotId: slot.id,
      model: historicalModel,
      status: "completed",
      content: message.content,
      inputTokens: message.input_tokens ?? undefined,
      outputTokens: message.output_tokens ?? undefined,
      costUsd: message.cost_usd ?? undefined,
      elapsedMs: message.elapsed_ms ?? undefined,
    };

    setHandoffSource({
      slot,
      result: historicalResult,
      meta: {
        nickname: message.nickname ?? slot.label,
        provider: message.provider ?? slot.key,
        model: historicalModelId,
        slotId: slot.id,
        originalQuestion,
        sourceMessageId: message.id,
      },
    });
  }

  async function handleHandoff(request: HandoffRequest) {
    const runId = uid("handoff");
    setHandoffSource(null);
    setHandoffRuns((prev) => [{ id: runId, sourceSlotId: request.sourceSlotId, sourceMeta: request.sourceMeta, instruction: request.instruction, createdAt: new Date().toISOString(), results: {} }, ...prev]);
    let handoffRequestMessageId: string | undefined;
    if (currentConversationId) {
      handoffRequestMessageId = uid("message-handoff-request");
      const requestMessage = await appendConversationMessage({
        id: handoffRequestMessageId, conversationId: currentConversationId, role: "user", kind: "handoff_request",
        content: request.instruction, parentMessageId: request.sourceMeta.sourceMessageId,
        appliedContextIds: activeContextItems.map((item) => item.id),
        targetSlotIds: request.targetSlotIds,
      });
      setConversationMessages((prev) => [...prev, requestMessage]);
    }
    const ephemeral: ContextItem = {
      id: uid("handoff-ref"), kind: "ai_response", role: "reference", scope: "session", lifetime: "session", provenance: "ai_generated",
      title: `${request.sourceMeta.nickname} の回答（1ホップ参照）`, content: request.sourceResult.content, enabled: true,
      source: { provider: request.sourceMeta.provider, model: request.sourceMeta.model, nickname: request.sourceMeta.nickname, slotId: request.sourceMeta.slotId },
      generation: { originalQuestion: request.sourceMeta.originalQuestion },
      conversationId: conversationKey,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const targets = slots.filter((slot) => request.targetSlotIds.includes(slot.id) && slot.keySaved).map((slot) => {
      const normalized = assembleContext({
        slotId: slot.id, projectId: currentProjectId, conversationId: conversationKey, contextItems: [...scopedContextItems, ephemeral],
        history: historyForSlot(conversationMessages, slot.id), userMessage: request.instruction,
      });
      return { slotId: slot.id, provider: new TauriProvider(slot.key, slot.label, catalogForSlot(slot)), model: slot.model, messages: normalizedHandoffRequestToMessages(normalized, ephemeral) };
    });
    try {
      const finalResults = await broadcastQuestion(targets, request.instruction, (result) => {
        setHandoffRuns((prev) => prev.map((run) => run.id === runId ? { ...run, results: { ...run.results, [result.slotId]: result } } : run));
      }, { streaming: true });
      if (currentConversationId) {
        const saved: ConversationMessage[] = [];
        for (const result of finalResults) {
          if (result.status !== "completed") continue;
          const slot = slots.find((candidate) => candidate.id === result.slotId);
          if (!slot) continue;
          saved.push(await appendConversationMessage({
            id: uid("message-handoff"), conversationId: currentConversationId, role: "assistant", kind: "handoff",
            slotId: slot.id, provider: slot.key, model: result.model.id, nickname: slot.label, content: result.content,
            inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd, elapsedMs: result.elapsedMs,
            appliedContextIds: activeContextItems.map((item) => item.id),
            appliedAiReferenceSources: snapshotAppliedAiReferences([ephemeral]),
            parentMessageId: handoffRequestMessageId ?? request.sourceMeta.sourceMessageId,
          }));
        }
        setConversationMessages((prev) => [...prev, ...saved]);
        await refreshConversations(false);
      }
      await refreshUsage();
    } catch { /* individual errors are represented in results */ }
  }

  function handleAddHandoffResultContext(slot: ProviderSlot, result: BroadcastResult, run: HandoffRun) {
    addReference({
      kind: "ai_response", role: "reference", scope: "session", lifetime: "session", provenance: "ai_generated",
      title: `${slot.label} の相互参照回答`, content: result.content, enabled: true,
      source: { provider: slot.key, model: result.model.id, nickname: slot.label, slotId: slot.id, messageId: uid("handoff-response") },
      generation: {
        originalQuestion: run.instruction,
        appliedContextIds: activeContextItems.map((item) => item.id),
        appliedInstructions: activeContextItems.filter((item) => item.role === "instruction").map((item) => `${item.title}: ${item.content}`),
      },
    });
    setContextOpen(true);
  }

  function handleResize(index: number, startX: number) {
    const startWidths = [...columnWidths];
    const move = (event: PointerEvent) => {
      const delta = event.clientX - startX;
      const next = [...startWidths];
      next[index] = Math.max(280, startWidths[index] + delta);
      if (index + 1 < next.length) next[index + 1] = Math.max(280, startWidths[index + 1] - delta);
      setColumnWidths(next);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  const estimatedUsd = estimates.reduce((sum, e) => sum + (e.max_cost_usd ?? 0), 0);
  const hasUnknownPricing = estimates.some((e) => e.max_cost_usd == null);
  const formattedEstimate = formatCostCurrency(estimatedUsd, displayCurrency, displayRate);
  const estimateLabel = estimates.length > 0
    ? hasUnknownPricing ? ` (${t("最大概算")} ${formattedEstimate} + ${t("料金未登録モデルあり")})` : ` (${t("最大概算")} ${formattedEstimate})`
    : "";
  const estimateText = estimates.length > 0
    ? `${t("送信予定")}：${estimates.length} AI / ${t("Context/会話履歴込み入力概算")} ${formatTokens(estimates[0].input_tokens)} tokens / ${t("最大出力")} ${formatTokens(MAX_OUTPUT_TOKENS)} tokens / ${estimateLabel}`
    : t("質問を入力するとContext/会話履歴込みの概算コストを表示します。");

  const displayTimeZone = resolveTimeZone(timeZoneMode, manualTimeZone);

  return (
    <main className={`app-shell${isFullscreen ? " app-fullscreen" : ""}`}>
      <ConversationSidebar open={sidebarOpen} conversations={conversations} projects={projects} timeZone={displayTimeZone} currentProjectId={currentProjectId} currentId={currentConversationId} onToggle={() => setSidebarOpen((v) => !v)} onSelect={(id) => void openConversation(id)} onNew={newConversation} onRename={(id, title) => void renameConversationTitle(id, title)} onDelete={setConversationDeleteTarget} onMove={(id, projectId) => void moveConversationToProject(id, projectId)} />
      <section className="app-content">
      <header className="app-header">
        <div><h1>AI Ensemble — ECHO <small>v{APP_VERSION}</small></h1><p className="app-tagline">Evaluation, Comparison &amp; Hallucination Observation</p><p>{t("複数のAIへ同じ質問を送り、回答を比較。外部会話のArchiveとContext管理にも対応。")}</p></div>
        <div className="header-actions">
          <div className="context-header-group">
            <button
              className="secondary-button"
              onClick={() => {
                if (contextStorageError) {
                  setContextHydrationRetry((value) => value + 1);
                  return;
                }
                if (contextStorageReady) setContextOpen(true);
              }}
              disabled={!contextStorageReady && !contextStorageError}
              title={contextStorageError ? `Context読込エラー。クリックで再試行: ${contextStorageError}` : (!contextStorageReady ? "ContextをSQLiteから読み込み中です" : "Contextを開く")}
            >🧩 {contextStorageError ? "Context再読込を再試行" : (!contextStorageReady ? "Context読込中…" : "Context")}</button>
            <button
              className="secondary-button context-reload-button"
              onClick={() => setContextReloadOpen(true)}
              disabled={!contextStorageReady || !currentConversationId || busy || contextReloadBusy}
              title={contextStorageError
                ? `Context読込エラー: ${contextStorageError}`
                : (!contextStorageReady
                  ? "ContextをSQLiteから読み込み中です"
                  : (!currentConversationId ? "会話開始後にContext境界を作成できます" : "現在のContextを再評価し、会話履歴との境界を記録します"))}
            >↻ 再読込</button>
          </div>
          <button className="secondary-button" onClick={() => setTextPadOpen(true)}>📝 {t("テキスト")}</button>
          <button
            className="secondary-button fullscreen-button"
            type="button"
            aria-pressed={isFullscreen}
            title={isFullscreen ? t("通常表示へ戻す") : t("画面全体に広げる")}
            onClick={() => void toggleFullscreen()}
          >{isFullscreen ? `🗗 ${t("通常表示")}` : `⛶ ${t("全画面")}`}</button>
          <button className="secondary-button" onClick={() => setSettingsOpen((v) => !v)}>⚙ {t("設定")}</button>
        </div>
      </header>

      {fullscreenError && <div className="error fullscreen-error">{fullscreenError}</div>}

      {!contextStorageReady && (
        <div className={`context-storage-status ${contextStorageError ? "error" : ""}`}>
          {contextStorageError
            ? <>
                ⚠ Context SQLiteの読み込みに失敗しました。古いlocalStorageはruntime stateとして使用していません。<br />
                <small>{contextStorageError}</small>
                <div className="context-storage-status-actions">
                  <button className="secondary-button" onClick={() => setContextHydrationRetry((value) => value + 1)}>再試行</button>
                </div>
              </>
            : <>⏳ Context / Context SetをSQLiteから読み込み中…</>}
        </div>
      )}

      <ProjectBar projects={projects} currentProjectId={currentProjectId} onSelect={setCurrentProjectId} onCreate={(name) => void handleCreateProject(name)} onRename={(id, name) => void handleRenameProject(id, name)} onDelete={(id) => void handleDeleteProject(id)} onOpenLibrary={() => { if (contextStorageReady) setContextLibraryOpen(true); }} onOpenArchive={() => setConversationArchiveOpen(true)} />

      {settingsOpen && <SettingsPanel slots={slots} theme={theme} setTheme={setTheme} timeZoneMode={timeZoneMode} setTimeZoneMode={setTimeZoneMode} manualTimeZone={manualTimeZone} setManualTimeZone={setManualTimeZone} turnOrder={turnOrder} setTurnOrder={setTurnOrder} modelCatalogs={modelCatalogs} modelLoading={modelLoading} modelErrors={modelErrors} onUpdateSlot={updateSlot} onSaveKey={handleSaveKey} onDeleteKey={handleDeleteKey} onRefreshModels={refreshModels} usage={usage} usageError={usageError} onRefreshUsage={refreshUsage} onClearUsage={handleClearUsage} displayCurrency={displayCurrency} setDisplayCurrency={setDisplayCurrency} currencyRates={currencyRates} setCurrencyRates={setCurrencyRates} onOpenTrialNotice={() => setTrialNoticeOpen(true)} onExportData={exportUserData} onImportData={importUserData} />}

      <ProviderGrid
        slots={slots}
        onToggle={(slotId, enabled) => updateSlot(slotId, { enabled })}
        onMove={moveProviderSlot}
        onReorder={reorderProviderSlot}
      />
      <QuestionComposer question={question} onQuestionChange={setQuestion} onSend={() => void handleSend()} busy={busy} activeCount={activeSlots.length} totalCount={slots.length} estimateText={estimateText} estimateLabel={estimateLabel} recommendations={recommendations} recommendationsEnabled={recommendationsEnabled} onToggleRecommendations={setRecommendationsEnabled} onUseRecommendation={(slotId, model) => updateSlot(slotId, { model })} onOpenModelPicker={setModelPickerSlotId} contextCount={activeContextItems.length} contextTokens={contextTokens} contextWarning={contextWarning} contextPreview={contextPreview} onOpenContext={() => setContextOpen(true)} contextReady={contextStorageReady} contextStorageError={contextStorageError} />

      {textPadOpen && <TextPad
        timeZone={displayTimeZone}
        onClose={() => setTextPadOpen(false)}
        onInsertQuestion={(text) => { setQuestion(text); setTextPadOpen(false); }}
        onSaveLibrary={(title, text) => {
          if (!currentProjectId) return;
          const now = new Date().toISOString();
          const id = `textpad-ref-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          addLibraryItem({
            id,
            kind: "text",
            role: "reference",
            scope: "project",
            lifetime: "persistent",
            provenance: "user_authored",
            title,
            content: text,
            enabled: true,
            projectId: currentProjectId,
            createdAt: now,
            updatedAt: now,
          });
          setContextLibraryOpen(true);
        }}
      />}

      <ContextPanel open={contextOpen} slots={slots} items={projectContextItems} activeItems={activeContextItems} conversationKey={conversationKey} sets={projectContextSets} selectedSetId={selectedContextSetId} onClose={() => setContextOpen(false)} onSetInstruction={setInstruction} onToggle={(id, enabled) => setContextItems((prev) => prev.map((item) => item.id === id ? { ...item, enabled, updatedAt: new Date().toISOString() } : item))} onRemove={(id) => { setContextItems((prev) => prev.filter((item) => item.id !== id)); setContextSets((prev) => prev.map((set) => ({ ...set, itemIds: set.itemIds.filter((itemId) => itemId !== id) }))); }} onTogglePersistent={(id) => setContextItems((prev) => prev.map((item) => item.id === id ? { ...item, lifetime: item.lifetime === "persistent" ? "session" : "persistent", updatedAt: new Date().toISOString() } : item))} onCreateSet={createContextSet} onRenameSet={renameContextSet} onDuplicateSet={duplicateContextSet} onDeleteSet={deleteContextSet} onSelectSet={(id) => setContextSetSelections((prev) => ({ ...prev, [conversationKey]: id }))} onToggleSetItem={toggleContextSetItem} />

      <ContextLibrary open={contextLibraryOpen} project={currentProject} timeZone={displayTimeZone} items={contextItems} sets={projectContextSets} selectedSetId={selectedContextSetId} capacityTargets={slots.filter((slot) => slot.enabled).map((slot) => ({ label: slot.label, maxContextTokens: slot.model.capabilities.maxContextTokens }))} onClose={() => setContextLibraryOpen(false)} onAddItem={addLibraryItem} onUpdateItem={updateLibraryItem} onRemoveItem={(id) => { setContextItems((prev) => prev.filter((item) => item.id !== id)); setContextSets((prev) => prev.map((set) => ({ ...set, itemIds: set.itemIds.filter((itemId) => itemId !== id) }))); }} onToggleItem={(id, enabled) => setContextItems((prev) => prev.map((item) => item.id === id ? { ...item, enabled, updatedAt: new Date().toISOString() } : item))} onDisableAiReferenceAndReset={(id) => void handleDisableAiReferenceAndReset(id)} onToggleSetItem={toggleContextSetItem} />

      <ConversationArchive
        open={conversationArchiveOpen}
        project={currentProject}
        slots={slots}
        timeZone={displayTimeZone}
        onClose={() => setConversationArchiveOpen(false)}
        onAddContext={(item) => addLibraryItem(item, null)}
        onOpenLibrary={() => { setConversationArchiveOpen(false); setContextLibraryOpen(true); }}
      />

      <ResultBoard slots={slots} results={results} columnWidths={columnWidths} onResize={handleResize} displayCurrency={displayCurrency} currencyRate={displayRate} onAddContext={handleAddResultContext} onOpenModelPicker={setModelPickerSlotId} onHandoff={(slot, result) => { const sendMeta = lastSendMeta[slot.id]; setHandoffSource({ slot, result, meta: { nickname: slot.label, provider: slot.key, model: result.model.id, slotId: slot.id, originalQuestion: sendMeta?.question, sourceMessageId: resultMessageIds[slot.id] } }); }} />
      <HandoffResults runs={handoffRuns} slots={slots} displayCurrency={displayCurrency} currencyRate={displayRate} onAddContext={handleAddHandoffResultContext} />
      <ConversationHistory
        messages={conversationMessages}
        displayCurrency={displayCurrency} currencyRate={displayRate}
        timeZone={displayTimeZone}
        turnOrder={turnOrder}
        onHandoff={openHistoricalHandoff}
      />

      {showTopButton && (
        <button
          type="button"
          className="back-to-top-button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label={t("ページ上部へ戻る")}
          title={t("ページ上部へ戻る")}
        >
          ↑ Top
        </button>
      )}

      <ContextReloadModal
        open={contextReloadOpen}
        contextCount={activeContextItems.length}
        setName={selectedContextSet?.name}
        onCancel={() => setContextReloadOpen(false)}
        onReload={(mode) => void handleContextReload(mode)}
      />

      <ConfirmModal open={conversationDeleteTarget !== null} title={t("この会話を削除しますか？")} message={t("SQLiteに保存されたConversationとメッセージ履歴を削除します。この操作は元に戻せません。")} onCancel={() => setConversationDeleteTarget(null)} onConfirm={() => { const id = conversationDeleteTarget; setConversationDeleteTarget(null); if (id) void removeConversation(id); }} />

      {handoffSource && <HandoffModal sourceSlot={handoffSource.slot} sourceResult={handoffSource.result} sourceMeta={handoffSource.meta} slots={slots} onClose={() => setHandoffSource(null)} onSend={(request) => void handleHandoff(request)} />}
      {modelPickerSlotId && (() => {
        const slot = slots.find((candidate) => candidate.id === modelPickerSlotId);
        if (!slot) return null;
        const recommendation = recommendations.find((item) => item.slot.id === slot.id);
        return <ModelPickerPopover slot={slot} models={modelCatalogs[slot.key] ?? catalogForSlot(slot)} recommendedModelId={recommendation?.model.id} onSelect={(model) => updateSlot(slot.id, { model })} onClose={() => setModelPickerSlotId(null)} onOpenSettings={() => { setModelPickerSlotId(null); setSettingsOpen(true); }} />;
      })()}
      <TrialNotice open={trialNoticeOpen} onAccept={() => {
        writeStorage(TRIAL_NOTICE_STORAGE_KEY, true);
        setTrialNoticeOpen(false);
      }} />
      </section>
    </main>
  );
}
