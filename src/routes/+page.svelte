<script lang="ts">
  import {
    browser,
    dev,
    version as buildVersion,
  } from "$app/environment";
  import { base } from "$app/paths";
  import { onDestroy, onMount, tick } from "svelte";
  import { version as appVersion } from "../../package.json";
  import FieldGuide from "$lib/components/FieldGuide.svelte";
  import GameMenu from "$lib/components/GameMenu.svelte";
  import InstallCoach from "$lib/components/InstallCoach.svelte";
  import {
    ERAS,
    type Era,
    type ScienceSource,
    formatEraScale,
    journeyHoursForEraProgress,
  } from "$lib/scale-data";
  import {
    CORE_RADIUS_MIN,
    canStartPointerSteering,
    deepLensUnlocked,
    radiusForLayerProgress,
  } from "$lib/game-rules";
  import {
    PERFORMANCE_PROFILE_STORAGE_KEY,
    type PerformanceProfile,
    parsePerformanceProfile,
  } from "$lib/performance-profile";
  import {
    INSTALL_COACH_INSTALLED_VALUE,
    INSTALL_COACH_STORAGE_KEY,
    type BeforeInstallPromptEvent,
    type InstallPromptKind,
    type InstallSignals,
    installCoachSnoozeValue,
    installCoachSuppressed,
    isAppleTouchDevice,
    isAppleTablet,
    isPhoneOrTablet,
    isStandaloneApp,
  } from "$lib/pwa-install";
  import {
    SAVE_KEYS,
    createSaveData,
    loadSaveCandidates,
    serializeSaveData,
    type CollectionEntry,
    type GameMode,
    type MashRecordV4,
    type SaveDataV4,
  } from "$lib/save-data";
  import {
    semanticViewScale,
  } from "$lib/world-system";
  import { createGameAudio } from "$lib/game/audio";
  import type {
    FactCard,
    FactKind,
    GameState,
    HudState,
    MutableRef,
  } from "$lib/game/runtime";

  const buildHash = buildVersion.match(
    /(?:^|g)([0-9a-f]{7,40})(?:-dirty)?$/,
  )?.[1];
  const buildLabel = `${buildHash?.slice(0, 7) ?? buildVersion}${
    buildVersion.endsWith("-dirty") ? "+dirty" : ""
  }`;
  const RESET_GENERATION_KEY = "everything-roll-reset-generation";
  const LAST_SEEN_BUILD_KEY = "quantamari-last-seen-build";
  const INSTALL_COACH_REVEAL_DELAY_MS = 900;
  const WORKER_BUILD_TIMEOUT_MS = 1_000;
  const WORKER_BUILD_RETRY_DELAY_MS = 1_500;
  const WORKER_BUILD_RETRY_LIMIT = 2;
  const DEPLOYED_BUILD_TIMEOUT_MS = 3_500;
  const UPDATE_ACTIVATION_TIMEOUT_MS = 8_000;
  const PICKUP_FACT_DURATION_MS = 5_500;
  const PICKUP_FACT_COOLDOWN_MS = 2_500;
  const ROLL_KEYS = new Set([
    "w",
    "a",
    "s",
    "d",
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright",
  ]);

  const showAtlasRef: MutableRef<boolean> = { current: false };
  const showGuideRef: MutableRef<boolean> = { current: false };
  const showMenuRef: MutableRef<boolean> = { current: false };
  const modalOpenRef: MutableRef<boolean> = { current: false };
  const labReturnRef: MutableRef<{
    x: number;
    z: number;
    originX: number;
    originZ: number;
    vx: number;
    vz: number;
    lens: number;
    factCard: FactCard;
    hadFact: boolean;
  } | null> = { current: null };
  const mashHistoryRef: MutableRef<MashRecordV4[]> = { current: [] };
  const collectionRef: MutableRef<CollectionEntry[]> = { current: [] };
  const collectedAuthoredAnchorIdsRef: MutableRef<Set<string>> = {
    current: new Set(),
  };
  const advanceLayerRef: MutableRef<(() => boolean) | null> = {
    current: null,
  };
  const unitemizedPickedRef: MutableRef<number> = { current: 0 };
  const keysRef: MutableRef<Record<string, boolean>> = { current: {} };
  const joystickRef = {
    current: { active: false, x: 0, y: 0, originX: 0, originY: 0 },
  };
  const gameRef: MutableRef<GameState> = {
    current: {
      x: 0,
      z: 0,
      originX: 0,
      originZ: 0,
      literalSceneOriginX: null,
      literalSceneOriginZ: null,
      vx: 0,
      vz: 0,
      radius: CORE_RADIUS_MIN,
      lens: 1,
      progress: 0,
      picked: 0,
      zooms: 0,
      cycles: 0,
      era: 0,
      mode: "journey",
      running: false,
      sound: true,
      lastPickup: -99,
      lastSave: 0,
      id: 0,
    },
  };
  const {
    ping,
    playPickupSound,
    resume: resumeAudio,
    close: closeAudio,
  } = createGameAudio({
    isEnabled: () => gameRef.current.sound,
    pickedCount: () => gameRef.current.picked,
  });

  let mount = $state<HTMLDivElement | null>(null);
  let atlasDialog = $state<HTMLDialogElement | null>(null);
  let menuButton = $state<HTMLButtonElement | null>(null);
  let guideButton = $state<HTMLButtonElement | null>(null);
  let atlasOpener: HTMLElement | null = null;
  let guideOpener: HTMLElement | null = null;
  let menuOpener: HTMLElement | null = null;
  let childOpenedFromMenu: "atlas" | "guide" | null = null;
  let started = $state(false);
  let showAtlas = $state(false);
  let showGuide = $state(false);
  let showMenu = $state(false);
  let atlasEra = $state(0);
  let labEra = $state<number | null>(null);
  let sound = $state(true);
  let gameMode = $state<GameMode>("journey");
  let performanceProfile = $state<PerformanceProfile>("standard");
  let collection = $state<CollectionEntry[]>([]);
  let legacyUnitemizedCount = $state(0);
  let updateState = $state<"idle" | "ready" | "applying">("idle");
  let updateReady = $derived(updateState === "ready");
  let updateApplying = $derived(updateState === "applying");
  let installKind = $state<InstallPromptKind | null>(null);
  let installAppleTablet = $state(false);
  let installCoachVisible = $state(false);
  let installCoachManual = $state(false);
  let installApplying = $state(false);
  let installedDisplayMode = $state(false);
  let installPromptEvent: BeforeInstallPromptEvent | null = null;
  let installCoachTimer: number | null = null;
  let installCoachSuppressedForVisit = false;
  let toast = $state(
    "Current-scale things stick. Older specks dissolve quietly into mass.",
  );
  let toastVisible = $state(false);
  let toastTimer: number | null = null;
  let factAchievement = $state("");
  let factMilestone = $state("");
  let factVisible = $state(false);
  let factTimer: number | null = null;
  let factBurstCount = $state(0);
  let pickupAnnouncement = $state("");
  let factCooldownUntil = 0;
  let lastFact = $state<FactCard>({
    name: "Spacetime fluctuation",
    fact: ERAS[0].lesson,
    source: ERAS[0].curios[0].source ?? ERAS[0].sources[0],
  });
  let hasFact = $state(false);
  let joystickVisual = $state({
    active: false,
    originX: 0,
    originY: 0,
    x: 0,
    y: 0,
  });
  let touchTipSeen = $state(false);
  let hud = $state<HudState>({
    hours: 0,
    picked: 0,
    era: 0,
    journeyEra: 0,
    progress: 0,
    radius: CORE_RADIUS_MIN,
    lens: 1,
    zooms: 0,
    cycles: 0,
  });
  const saveStatus = { errorReported: false };
  let applyWaitingUpdate = () => {};
  let resetInProgress = false;
  let resetGeneration: string | null = null;

  function currentInstallSignals(): InstallSignals {
    const installNavigator = navigator as Navigator & {
      standalone?: boolean;
      userAgentData?: { mobile?: boolean };
    };
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      userAgentMobile: installNavigator.userAgentData?.mobile === true,
      coarsePointer: window.matchMedia("(pointer: coarse)").matches,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      navigatorStandalone: installNavigator.standalone === true,
      displayModeStandalone: window.matchMedia("(display-mode: standalone)")
        .matches,
    };
  }

  function clearInstallCoachTimer() {
    if (installCoachTimer === null) return;
    window.clearTimeout(installCoachTimer);
    installCoachTimer = null;
  }

  function storeInstallCoachState(value: string) {
    try {
      localStorage.setItem(INSTALL_COACH_STORAGE_KEY, value);
    } catch {
      // Installation guidance remains useful for this visit without storage.
    }
  }

  function scheduleInstallCoach() {
    if (
      !started ||
      !installKind ||
      installedDisplayMode ||
      installCoachSuppressedForVisit ||
      installCoachVisible ||
      installCoachTimer !== null
    ) {
      return;
    }
    installCoachTimer = window.setTimeout(() => {
      installCoachTimer = null;
      if (
        started &&
        installKind &&
        !installedDisplayMode &&
        !installCoachSuppressedForVisit
      ) {
        installCoachVisible = true;
      }
    }, INSTALL_COACH_REVEAL_DELAY_MS);
  }

  function dismissInstallCoach() {
    clearInstallCoachTimer();
    installCoachVisible = false;
    installCoachManual = false;
    installCoachSuppressedForVisit = true;
    storeInstallCoachState(installCoachSnoozeValue());
  }

  function markInstallComplete() {
    clearInstallCoachTimer();
    installPromptEvent = null;
    installKind = null;
    installCoachVisible = false;
    installCoachManual = false;
    installApplying = false;
    installCoachSuppressedForVisit = true;
    storeInstallCoachState(INSTALL_COACH_INSTALLED_VALUE);
  }

  async function activateInstallCoach() {
    if (installKind === "apple" || installKind === "manual") {
      dismissInstallCoach();
      return;
    }
    const promptEvent = installPromptEvent;
    if (!promptEvent || installApplying) return;
    installPromptEvent = null;
    installApplying = true;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") markInstallComplete();
      else {
        dismissInstallCoach();
        installKind = null;
      }
    } catch (error) {
      installKind = null;
      installApplying = false;
      installCoachVisible = false;
      installCoachManual = false;
      console.warn("Quantamari install prompt failed", error);
      updateToast(
        "The browser could not open its install prompt. Try its browser menu instead.",
      );
    }
  }

  function installFromMenu() {
    closeMenu();
    installCoachSuppressedForVisit = false;
    installCoachManual = true;
    if (installKind === "native") {
      void activateInstallCoach();
      return;
    }
    installCoachVisible = installKind === "apple" || installKind === "manual";
  }

  function updateToast(message: string) {
    hideFact(true);
    toast = message;
    toastVisible = true;
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastVisible = false;
      toastTimer = null;
    }, 4_000);
  }
  function announceAchievement(message: string) {
    if (factVisible) {
      factAchievement = message
        .replace(/^Achievements? unlocked:\s*/i, "")
        .split(" — ")[0];
      return;
    }
    updateToast(message);
  }
  function announcePickupMilestone(message: string) {
    if (factVisible) {
      factMilestone = message;
      return;
    }
    updateToast(message);
  }
  function hideToast() {
    toastVisible = false;
    if (toastTimer !== null) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }
  }
  function hideFact(startCooldown = false) {
    const wasVisible = factVisible;
    factVisible = false;
    factBurstCount = 0;
    factAchievement = "";
    factMilestone = "";
    pickupAnnouncement = "";
    if (factTimer !== null) {
      window.clearTimeout(factTimer);
      factTimer = null;
    }
    if (startCooldown && wasVisible) {
      factCooldownUntil = Date.now() + PICKUP_FACT_COOLDOWN_MS;
    }
  }
  function updateLastFact(fact: FactCard, kind: FactKind) {
    lastFact = fact;
    hasFact = true;
    if (kind !== "pickup") return;
    if (
      !factVisible &&
      (toastVisible || installCoachVisible || Date.now() < factCooldownUntil)
    ) {
      return;
    }

    // A pickup fact owns one bounded bottom-HUD window. Later pickups update
    // that window and its burst count without extending the original deadline,
    // so a dense field can never replace journey progress forever.
    hideToast();
    const startsBurst = !factVisible;
    factBurstCount = startsBurst ? 1 : factBurstCount + 1;
    if (startsBurst) pickupAnnouncement = `Rolled up ${fact.name}.`;
    factVisible = true;
    if (factTimer === null) {
      factTimer = window.setTimeout(() => {
        factVisible = false;
        factBurstCount = 0;
        factAchievement = "";
        factMilestone = "";
        pickupAnnouncement = "";
        factTimer = null;
        factCooldownUntil = Date.now() + PICKUP_FACT_COOLDOWN_MS;
      }, PICKUP_FACT_DURATION_MS);
    }
  }
  function updateCollection(entries: CollectionEntry[]) {
    collection = entries;
  }
  function updateHud(next: HudState) {
    hud = next;
  }

  function confidenceClass(confidence: Era["confidence"]) {
    return confidence.toLowerCase().replaceAll(" ", "-");
  }

  function formatLens(lens: number) {
    return lens >= 100 || lens < 0.01
      ? lens.toExponential(1)
      : lens.toFixed(2);
  }

  $effect(() => {
    showAtlasRef.current = showAtlas;
    showGuideRef.current = showGuide;
    showMenuRef.current = showMenu;
    modalOpenRef.current = showAtlas || showGuide || showMenu;
    if (showAtlas || showGuide || showMenu) {
      joystickRef.current.active = false;
      keysRef.current = {};
      worldPointers.clear();
      steeringPointerId = null;
      pinchDistance = null;
      // Property write only: spreading joystickVisual here would make this
      // effect read the state it writes and loop forever.
      joystickVisual.active = false;
    }
  });

  $effect(() => {
    const dialog = atlasDialog;
    if (!showAtlas || !dialog) return;

    const returnToMenu = childOpenedFromMenu === "atlas";
    atlasOpener = returnToMenu ? null : activeElement();
    let cancelled = false;
    void tick().then(() => {
      if (cancelled || !dialog.isConnected) return;
      if (!dialog.open) dialog.showModal();
      dialog.querySelector<HTMLButtonElement>(".atlas-close")?.focus();
    });

    return () => {
      cancelled = true;
      if (dialog.open) dialog.close();
      const opener = atlasOpener;
      if (!returnToMenu) {
        window.requestAnimationFrame(() => opener?.focus());
      }
    };
  });

  function chooseMode(mode: GameMode) {
    gameRef.current.mode = mode;
    gameMode = mode;
    if (gameRef.current.running) {
      updateToast(
        mode === "journey"
          ? "Long game pace selected. Your progress stays exactly where it is."
          : "Learning tour selected. Same world, much faster scale shifts.",
      );
    }
  }

  function adjustLens(factor: number) {
    const game = gameRef.current;
    const finishedJourney = deepLensUnlocked(
      game.era,
      ERAS.length,
      game.cycles,
    );
    const minimumLens = finishedJourney ? 1 / 256 : 1 / 8;
    const maximumLens = finishedJourney ? 256 : 8;
    game.lens = Math.max(
      minimumLens,
      Math.min(maximumLens, game.lens * factor),
    );
    hud = { ...hud, lens: game.lens };
  }

  function begin() {
    gameRef.current.running = true;
    started = true;
    hideToast();
    scheduleInstallCoach();
    if (gameRef.current.sound) {
      resumeAudio();
    }
  }

  function startMode(mode: GameMode) {
    chooseMode(mode);
    begin();
  }

  function toggleSound() {
    const next = !gameRef.current.sound;
    gameRef.current.sound = next;
    sound = next;
    if (next) ping(520);
  }

  function toggleBatteryOptimized() {
    const next =
      performanceProfile === "battery" ? "standard" : "battery";
    try {
      localStorage.setItem(PERFORMANCE_PROFILE_STORAGE_KEY, next);
    } catch {
      updateToast(
        "This browser blocked device settings. The current graphics profile is unchanged.",
      );
      return;
    }
    performanceProfile = next;
    updateToast(
      next === "battery"
        ? "Battery Optimized is on: cooler rendering, same universe."
        : "Standard graphics restored: stable detail with no automatic switching.",
    );
  }

  function activeElement() {
    return document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }

  function openMenu() {
    menuOpener = activeElement();
    guideOpener = null;
    childOpenedFromMenu = null;
    showAtlas = false;
    showGuide = false;
    showMenu = true;
    if (started) persistSnapshot();
  }

  function closeMenu() {
    const opener = menuOpener;
    menuOpener = null;
    showMenu = false;
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
      else menuButton?.focus();
    });
  }

  function openGuide(event?: Event) {
    const requestedOpener =
      event?.currentTarget instanceof HTMLElement
        ? event.currentTarget
        : activeElement();
    guideOpener =
      requestedOpener && requestedOpener !== document.body
        ? requestedOpener
        : guideButton;
    childOpenedFromMenu = null;
    showAtlas = false;
    showGuide = true;
  }

  function closeGuide() {
    const returnToMenu = childOpenedFromMenu === "guide";
    const opener = guideOpener;
    guideOpener = null;
    showGuide = false;
    if (returnToMenu) {
      childOpenedFromMenu = null;
      showMenu = true;
    } else {
      void tick().then(() => {
        window.requestAnimationFrame(() => opener?.focus({ preventScroll: true }));
      });
    }
  }

  function openAtlas() {
    childOpenedFromMenu = null;
    showGuide = false;
    atlasEra = journeyIndex;
    showAtlas = true;
  }

  function closeAtlas() {
    const returnToMenu = childOpenedFromMenu === "atlas";
    showAtlas = false;
    if (returnToMenu) {
      childOpenedFromMenu = null;
      showMenu = true;
    }
  }

  function openGuideFromMenu() {
    guideOpener = null;
    childOpenedFromMenu = "guide";
    showMenu = false;
    showAtlas = false;
    showGuide = true;
  }

  function openAtlasFromMenu() {
    childOpenedFromMenu = "atlas";
    showMenu = false;
    showGuide = false;
    atlasEra = journeyIndex;
    showAtlas = true;
  }

  function resetProgress() {
    resetInProgress = true;
    try {
      resetGeneration = crypto.randomUUID();
      localStorage.setItem(RESET_GENERATION_KEY, resetGeneration);
      for (const key of Object.values(SAVE_KEYS)) {
        localStorage.removeItem(key);
      }
    } catch {
      resetInProgress = false;
      return false;
    }
    window.location.reload();
    return true;
  }

  function previewEra(index: number) {
    const game = gameRef.current;
    labReturnRef.current ??= {
      x: game.x,
      z: game.z,
      originX: game.originX,
      originZ: game.originZ,
      vx: game.vx,
      vz: game.vz,
      lens: game.lens,
      factCard: lastFact,
      hadFact: hasFact,
    };
    game.running = true;
    started = true;
    labEra = index;
    childOpenedFromMenu = null;
    menuOpener = null;
    showAtlas = false;
    updateLastFact(
      {
        name: ERAS[index].name,
        fact: ERAS[index].lesson,
        source: ERAS[index].sources[0],
      },
      "lab",
    );
  }

  function returnToJourney() {
    const snapshot = labReturnRef.current;
    if (snapshot) {
      const { factCard, hadFact, ...journeyState } = snapshot;
      Object.assign(gameRef.current, journeyState);
      hud = { ...hud, lens: snapshot.lens };
      lastFact = factCard;
      hasFact = hadFact;
    }
    labReturnRef.current = null;
    labEra = null;
    updateToast("Journey restored exactly where you left it.");
  }

  function growToNextScale() {
    void resumeAudio();
    if (advanceLayerRef.current?.()) return;
    updateToast("Keep rolling until this scale is ready to grow.");
  }

  function persistSnapshot() {
    if (resetInProgress) return;
    try {
      if (localStorage.getItem(RESET_GENERATION_KEY) !== resetGeneration) {
        resetInProgress = true;
        window.location.reload();
        return;
      }
    } catch {
      // storeSave reports blocked storage without interrupting the current run.
    }
    const game = gameRef.current;
    const labSnapshot = labReturnRef.current;
    const save: SaveDataV4 = createSaveData({
      mode: game.mode,
      eraId: ERAS[game.era].id,
      progress: game.progress,
      picked: game.picked,
      unitemizedPicked: unitemizedPickedRef.current,
      x: labSnapshot
        ? labSnapshot.x + labSnapshot.originX
        : game.x + game.originX,
      z: labSnapshot
        ? labSnapshot.z + labSnapshot.originZ
        : game.z + game.originZ,
      zooms: game.zooms,
      cycles: game.cycles,
      sound: game.sound,
      mash: mashHistoryRef.current,
      collectedAuthoredAnchors: [
        ...collectedAuthoredAnchorIdsRef.current,
      ],
      literalSceneOrigin:
        game.literalSceneOriginX !== null &&
        game.literalSceneOriginZ !== null
          ? {
              x: game.literalSceneOriginX,
              z: game.literalSceneOriginZ,
            }
          : null,
      collection: collectionRef.current,
    });
    storeSave(save);
  }

  function storeSave(save: SaveDataV4) {
    try {
      localStorage.setItem(SAVE_KEYS.v4, serializeSaveData(save));
    } catch {
      if (!saveStatus.errorReported) {
        saveStatus.errorReported = true;
        updateToast("This browser blocked local saves. The current run still works.");
      }
    }
  }

  function readWorkerBuild(worker: ServiceWorker) {
    return new Promise<string | null>((resolve) => {
      const channel = new MessageChannel();
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        channel.port1.close();
        resolve(value);
      };
      const timeout = window.setTimeout(
        () => finish(null),
        WORKER_BUILD_TIMEOUT_MS,
      );
      channel.port1.onmessage = (event) => {
        const response = event.data as {
          type?: unknown;
          version?: unknown;
        };
        finish(
          response?.type === "BUILD_VERSION" &&
            typeof response.version === "string"
            ? response.version
            : null,
        );
      };
      try {
        worker.postMessage(
          { type: "GET_BUILD_VERSION" },
          [channel.port2],
        );
      } catch {
        finish(null);
      }
    });
  }

  async function readDeployedBuild() {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      DEPLOYED_BUILD_TIMEOUT_MS,
    );
    try {
      const response = await fetch(`${base}/_app/version.json`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const metadata = (await response.json()) as { version?: unknown };
      return typeof metadata.version === "string" ? metadata.version : null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function applyUpdate() {
    applyWaitingUpdate();
  }

  onMount(() => {
    document.documentElement.dataset.quarkatamariReady = "true";
    window.dispatchEvent(new Event("quarkatamari:ready"));
  });

  onMount(() => {
    try {
      const previousBuild = localStorage.getItem(LAST_SEEN_BUILD_KEY);
      localStorage.setItem(LAST_SEEN_BUILD_KEY, buildVersion);
      if (previousBuild && previousBuild !== buildVersion) {
        updateToast(`Quantamari updated to v${appVersion}.`);
      }
    } catch {
      // Build confirmation is optional when storage is unavailable.
    }
  });

  onMount(() => {
    try {
      performanceProfile = parsePerformanceProfile(
        localStorage.getItem(PERFORMANCE_PROFILE_STORAGE_KEY),
      );
    } catch {
      performanceProfile = "standard";
    }
    const syncPerformanceProfile = (event: StorageEvent) => {
      if (event.key !== PERFORMANCE_PROFILE_STORAGE_KEY) return;
      performanceProfile = parsePerformanceProfile(event.newValue);
    };
    window.addEventListener("storage", syncPerformanceProfile);
    return () =>
      window.removeEventListener("storage", syncPerformanceProfile);
  });

  onMount(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const signals = currentInstallSignals();
    installedDisplayMode = isStandaloneApp(signals);
    try {
      installCoachSuppressedForVisit = installCoachSuppressed(
        localStorage.getItem(INSTALL_COACH_STORAGE_KEY),
      );
    } catch {
      installCoachSuppressedForVisit = false;
    }

    if (!installedDisplayMode && isPhoneOrTablet(signals)) {
      if (isAppleTouchDevice(signals)) {
        installKind = "apple";
        installAppleTablet = isAppleTablet(signals);
      } else {
        installKind = "manual";
      }
    }

    const beforeInstall = (event: Event) => {
      const nextSignals = currentInstallSignals();
      if (isStandaloneApp(nextSignals) || !isPhoneOrTablet(nextSignals)) return;
      event.preventDefault();
      installPromptEvent = event as BeforeInstallPromptEvent;
      installKind = "native";
      installAppleTablet = false;
      scheduleInstallCoach();
    };
    const appInstalled = () => markInstallComplete();
    const displayModeChanged = () => {
      installedDisplayMode = isStandaloneApp(currentInstallSignals());
      if (installedDisplayMode) markInstallComplete();
    };

    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", appInstalled);
    displayMode.addEventListener("change", displayModeChanged);
    document.documentElement.dataset.quantamariInstallReady = "true";
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", appInstalled);
      displayMode.removeEventListener("change", displayModeChanged);
      delete document.documentElement.dataset.quantamariInstallReady;
    };
  });

  onMount(() => {
    if (
      !browser ||
      dev ||
      !("serviceWorker" in navigator) ||
      !["https:", "http:"].includes(location.protocol)
    ) {
      return;
    }

    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;
    let trackedWorker: ServiceWorker | null = null;
    let displayedWorker: ServiceWorker | null = null;
    let displayedWorkerStateListener: (() => void) | null = null;
    let candidateGeneration = 0;
    let controllerCheckGeneration = 0;
    let updateCheckInterval = 0;
    let activationTimer = 0;
    let identityRetryTimer = 0;
    let reloadStarted = false;
    let reloadWhenWorkerActivates: ServiceWorker | null = null;

    const clearActivationTimer = () => {
      window.clearTimeout(activationTimer);
      activationTimer = 0;
    };
    const clearIdentityRetryTimer = () => {
      window.clearTimeout(identityRetryTimer);
      identityRetryTimer = 0;
    };
    const detachDisplayedWorker = (expected?: ServiceWorker) => {
      if (expected && displayedWorker !== expected) return;
      if (displayedWorker && displayedWorkerStateListener) {
        displayedWorker.removeEventListener(
          "statechange",
          displayedWorkerStateListener,
        );
      }
      displayedWorker = null;
      displayedWorkerStateListener = null;
    };
    const reloadOnce = () => {
      if (disposed || reloadStarted) return;
      reloadStarted = true;
      clearActivationTimer();
      window.location.reload();
    };
    const checkForUpdate = () => {
      if (disposed || !registration || updateState === "applying") return;
      void registration.update().catch((error) => {
        console.warn("Quantamari update check failed", error);
      });
    };
    const recoverUpdate = (worker: ServiceWorker, message: string) => {
      clearActivationTimer();
      const retryable =
        displayedWorker === worker && worker.state === "installed";
      updateState = retryable ? "ready" : "idle";
      updateToast(message);
      checkForUpdate();
    };
    const onDisplayedWorkerState = () => {
      const worker = displayedWorker;
      if (!worker) return;
      if (worker.state === "activated") {
        const shouldReload =
          updateState === "applying" || reloadWhenWorkerActivates === worker;
        if (reloadWhenWorkerActivates === worker) {
          reloadWhenWorkerActivates = null;
        }
        detachDisplayedWorker(worker);
        updateState = "idle";
        if (shouldReload) reloadOnce();
        return;
      }
      if (worker.state === "redundant") {
        const wasApplying = updateState === "applying";
        if (reloadWhenWorkerActivates === worker) {
          reloadWhenWorkerActivates = null;
        }
        clearActivationTimer();
        detachDisplayedWorker(worker);
        updateState = "idle";
        if (wasApplying) {
          updateToast("That update was replaced before it could open. Checking again…");
          checkForUpdate();
        }
        return;
      }
      if (worker.state === "activating" && updateState === "ready") {
        updateState = "idle";
      }
    };
    const displayUpdate = (worker: ServiceWorker) => {
      if (
        disposed ||
        updateApplying ||
        worker.state !== "installed"
      ) {
        return;
      }
      if (
        reloadWhenWorkerActivates &&
        reloadWhenWorkerActivates !== worker
      ) {
        reloadWhenWorkerActivates = null;
      }
      detachDisplayedWorker();
      displayedWorker = worker;
      displayedWorkerStateListener = onDisplayedWorkerState;
      worker.addEventListener("statechange", onDisplayedWorkerState);
      updateState = "ready";
    };
    const activateMatchingWorker = (worker: ServiceWorker) => {
      if (disposed || worker.state !== "installed") return;
      if (
        reloadWhenWorkerActivates &&
        reloadWhenWorkerActivates !== worker
      ) {
        reloadWhenWorkerActivates = null;
      }
      detachDisplayedWorker();
      updateState = "idle";
      try {
        worker.postMessage({ type: "ACTIVATE_UPDATE" });
      } catch (error) {
        console.warn("Quantamari matching worker could not activate", error);
      }
    };
    const considerWaitingWorker = async (
      worker: ServiceWorker,
      retryAttempt = 0,
    ) => {
      if (retryAttempt === 0) clearIdentityRetryTimer();
      if (
        disposed ||
        updateApplying ||
        worker.state !== "installed"
      ) {
        return;
      }
      const generation = ++candidateGeneration;
      const [workerBuild, deployedBuild] = await Promise.all([
        readWorkerBuild(worker),
        readDeployedBuild(),
      ]);
      if (
        disposed ||
        generation !== candidateGeneration ||
        updateApplying ||
        worker.state !== "installed"
      ) {
        return;
      }
      if (workerBuild === buildVersion) {
        clearIdentityRetryTimer();
        if (!deployedBuild || deployedBuild === buildVersion) {
          activateMatchingWorker(worker);
        } else {
          checkForUpdate();
        }
        return;
      }
      // Never label an unidentified or stale worker as a newer build. Only the
      // worker that exactly matches the deployed manifest is actionable.
      if (
        workerBuild === null ||
        deployedBuild === null ||
        workerBuild !== deployedBuild
      ) {
        checkForUpdate();
        if (
          (workerBuild === null || deployedBuild === null) &&
          retryAttempt < WORKER_BUILD_RETRY_LIMIT
        ) {
          clearIdentityRetryTimer();
          identityRetryTimer = window.setTimeout(() => {
            identityRetryTimer = 0;
            if (
              disposed ||
              updateApplying ||
              worker.state !== "installed" ||
              (registration?.waiting && registration.waiting !== worker)
            ) {
              return;
            }
            void considerWaitingWorker(worker, retryAttempt + 1);
          }, WORKER_BUILD_RETRY_DELAY_MS * (retryAttempt + 1));
        }
        return;
      }
      clearIdentityRetryTimer();
      displayUpdate(worker);
    };
    const revealUpdate = (worker: ServiceWorker) => {
      ++candidateGeneration;
      clearIdentityRetryTimer();
      displayUpdate(worker);
    };
    const markReady = (worker: ServiceWorker) => {
      if (
        disposed ||
        worker.state !== "installed" ||
        !navigator.serviceWorker.controller
      ) {
        return;
      }
      void considerWaitingWorker(registration?.waiting ?? worker);
    };
    const onWorkerState = () => {
      if (trackedWorker) markReady(trackedWorker);
    };
    const trackInstallingWorker = () => {
      trackedWorker?.removeEventListener("statechange", onWorkerState);
      trackedWorker = registration?.installing ?? null;
      trackedWorker?.addEventListener("statechange", onWorkerState);
    };
    const onUpdateFound = () => trackInstallingWorker();
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    const onControllerChange = () => {
      const generation = ++controllerCheckGeneration;
      if (updateState === "applying") {
        reloadOnce();
        return;
      }
      const controller = navigator.serviceWorker.controller;
      if (!controller) return;
      void (async () => {
        for (
          let attempt = 0;
          attempt <= WORKER_BUILD_RETRY_LIMIT;
          attempt += 1
        ) {
          const controllerBuild = await readWorkerBuild(controller);
          if (
            disposed ||
            generation !== controllerCheckGeneration ||
            navigator.serviceWorker.controller !== controller
          ) {
            return;
          }
          if (controllerBuild) {
            if (controllerBuild !== buildVersion) {
              persistSnapshot();
              reloadOnce();
            }
            return;
          }
          if (attempt < WORKER_BUILD_RETRY_LIMIT) {
            await new Promise<void>((resolve) =>
              window.setTimeout(
                resolve,
                WORKER_BUILD_RETRY_DELAY_MS * (attempt + 1),
              ),
            );
          }
        }
      })();
    };
    const performUpdate = () => {
      const worker = displayedWorker;
      if (!worker || updateState === "applying") return;
      if (worker.state !== "installed") {
        detachDisplayedWorker(worker);
        updateState = "idle";
        checkForUpdate();
        return;
      }
      persistSnapshot();
      reloadWhenWorkerActivates = worker;
      updateState = "applying";
      updateToast("Saving this universe and opening the new build…");
      clearActivationTimer();
      activationTimer = window.setTimeout(() => {
        if (disposed || updateState !== "applying") return;
        if (worker.state === "activated") {
          reloadOnce();
          return;
        }
        recoverUpdate(
          worker,
          worker.state === "installed"
            ? "The update did not start. Try Update now again."
            : "The update is still finishing. Reopen Quantamari to use it.",
        );
      }, UPDATE_ACTIVATION_TIMEOUT_MS);
      try {
        worker.postMessage({ type: "ACTIVATE_UPDATE" });
      } catch {
        reloadWhenWorkerActivates = null;
        recoverUpdate(worker, "The update could not start. Try Update now again.");
      }
    };
    applyWaitingUpdate = performUpdate;
    const updateDebugWindow = window as typeof window & {
      __QUARKATAMARI_PERFORMANCE_REQUESTED__?: boolean;
      __QUARKATAMARI_UPDATE_DEBUG__?: {
        buildVersion: string;
        considerWaitingWorker: (worker: ServiceWorker) => Promise<void>;
        showUpdateReady: (worker: ServiceWorker) => void;
      };
    };
    if (updateDebugWindow.__QUARKATAMARI_PERFORMANCE_REQUESTED__) {
      updateDebugWindow.__QUARKATAMARI_UPDATE_DEBUG__ = {
        buildVersion,
        considerWaitingWorker,
        showUpdateReady: revealUpdate,
      };
    }
    window.addEventListener("focus", checkForUpdate);
    window.addEventListener("online", checkForUpdate);
    document.addEventListener("visibilitychange", checkWhenVisible);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );
    updateCheckInterval = window.setInterval(checkForUpdate, 10 * 60 * 1000);

    const serviceWorkerUrl = new URL(`${base}/service-worker.js`, location.href);
    serviceWorkerUrl.searchParams.set("build", buildVersion);
    void navigator.serviceWorker
      .register(serviceWorkerUrl, { type: "module" })
      .then((nextRegistration) => {
        if (disposed) return;
        registration = nextRegistration;
        registration.addEventListener("updatefound", onUpdateFound);
        if (registration.waiting && navigator.serviceWorker.controller) {
          void considerWaitingWorker(registration.waiting);
        }
        trackInstallingWorker();
        checkForUpdate();
      })
      .catch((error) => {
        console.warn("Quantamari service worker registration failed", error);
      });

    return () => {
      disposed = true;
      ++candidateGeneration;
      ++controllerCheckGeneration;
      clearActivationTimer();
      clearIdentityRetryTimer();
      reloadWhenWorkerActivates = null;
      detachDisplayedWorker();
      if (applyWaitingUpdate === performUpdate) applyWaitingUpdate = () => {};
      window.clearInterval(updateCheckInterval);
      window.removeEventListener("focus", checkForUpdate);
      window.removeEventListener("online", checkForUpdate);
      document.removeEventListener("visibilitychange", checkWhenVisible);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      registration?.removeEventListener("updatefound", onUpdateFound);
      trackedWorker?.removeEventListener("statechange", onWorkerState);
      if (
        updateDebugWindow.__QUARKATAMARI_UPDATE_DEBUG__?.showUpdateReady ===
        revealUpdate
      ) {
        delete updateDebugWindow.__QUARKATAMARI_UPDATE_DEBUG__;
      }
    };
  });

  onMount(() => {
    try {
      resetGeneration = localStorage.getItem(RESET_GENERATION_KEY);
    } catch {
      // The save hydration below owns the user-facing blocked-storage message.
    }
    const onStorage = (event: StorageEvent) => {
      if (
        event.key !== RESET_GENERATION_KEY ||
        event.newValue === null ||
        event.newValue === resetGeneration
      ) {
        return;
      }
      resetGeneration = event.newValue;
      resetInProgress = true;
      try {
        for (const key of Object.values(SAVE_KEYS)) {
          localStorage.removeItem(key);
        }
      } finally {
        window.location.reload();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  });

  onMount(() => {
    let loaded: ReturnType<typeof loadSaveCandidates>;
    try {
      loaded = loadSaveCandidates(
        {
          v4: localStorage.getItem(SAVE_KEYS.v4),
          v3: localStorage.getItem(SAVE_KEYS.v3),
          v2: localStorage.getItem(SAVE_KEYS.v2),
        },
        ERAS,
      );
    } catch {
      saveStatus.errorReported = true;
      updateToast("This browser blocked local saves. The current run still works.");
      return;
    }
    if (!loaded) return;

    const saved = loaded.save;
    const game = gameRef.current;
    game.era = Math.max(
      0,
      ERAS.findIndex((era) => era.id === saved.eraId),
    );
    game.mode = saved.mode;
    game.progress = saved.progress;
    game.picked = saved.picked;
    game.x = saved.x;
    game.z = saved.z;
    game.originX = 0;
    game.originZ = 0;
    game.literalSceneOriginX = saved.literalSceneOrigin?.x ?? null;
    game.literalSceneOriginZ = saved.literalSceneOrigin?.z ?? null;
    game.radius = radiusForLayerProgress(game.progress);
    game.zooms = saved.zooms;
    game.cycles = saved.cycles;
    game.sound = saved.sound;
    mashHistoryRef.current = saved.mash;
    collectedAuthoredAnchorIdsRef.current = new Set(
      saved.collectedAuthoredAnchors,
    );
    collectionRef.current = saved.collection;
    unitemizedPickedRef.current = saved.unitemizedPicked;

    gameMode = game.mode;
    sound = game.sound;
    collection = saved.collection;
    legacyUnitemizedCount = saved.unitemizedPicked;
    hud = {
      ...hud,
      hours: journeyHoursForEraProgress(game.era, game.progress),
      picked: game.picked,
      era: game.era,
      journeyEra: game.era,
      progress: game.progress,
      radius: game.radius,
      zooms: game.zooms,
      cycles: game.cycles,
    };

    if (loaded.sourceVersion < 4) {
      storeSave(saved);
    }
  });

  onMount(() => {
    const onPageHide = () => persistSnapshot();
    const onVisibilityChange = () => {
      if (document.hidden) persistSnapshot();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

  onMount(() => {
    const onDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const interactive = target?.closest(
        "button, a, input, select, textarea, [contenteditable='true']",
      );
      if (key === "escape") {
        if (showMenuRef.current) return;
        event.preventDefault();
        if (showAtlasRef.current) {
          closeAtlas();
          return;
        }
        if (showGuideRef.current) {
          closeGuide();
          return;
        }
        openMenu();
        return;
      }
      if (modalOpenRef.current || interactive) return;
      if (!gameRef.current.running && [" ", "enter"].includes(key)) {
        event.preventDefault();
        begin();
        return;
      }
      if (ROLL_KEYS.has(key)) {
        keysRef.current[key] = true;
        event.preventDefault();
      }
      if (key === "m") toggleSound();
      if (key === "i") openAtlas();
      if (key === "g") openGuide();
    };
    const onUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (ROLL_KEYS.has(key)) keysRef.current[key] = false;
    };
    const clearInput = () => {
      keysRef.current = {};
      joystickRef.current.active = false;
      worldPointers.clear();
      steeringPointerId = null;
      pinchDistance = null;
      joystickVisual.active = false;
    };
    const onVisibilityChange = () => {
      if (document.hidden) clearInput();
    };
    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clearInput);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clearInput);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

  $effect(() => {
    const target = mount;
    const preview = labEra;
    const selectedPerformanceProfile = performanceProfile;
    if (!started || !target) return;
    let cancelled = false;
    let destroy: (() => void) | undefined;
    void import("$lib/game/runtime")
      .then(({ mountGame }) => {
        if (cancelled) return;
        destroy = mountGame(target, {
          gameRef,
          keysRef,
          joystickRef,
          modalOpenRef,
          mashHistoryRef,
          collectedAuthoredAnchorIdsRef,
          collectionRef,
          advanceLayerRef,
          labEra: preview,
          performanceProfile: selectedPerformanceProfile,
          setToast: updateToast,
          setAchievement: announceAchievement,
          setPickupMilestone: announcePickupMilestone,
          setLastFact: updateLastFact,
          setCollection: updateCollection,
          setHud: updateHud,
          ping,
          playPickupSound,
          persistSnapshot,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        gameRef.current.running = false;
        updateToast("The game code could not start. Reload to try again.");
        console.error("Quantamari runtime boot failed", error);
      });
    return () => {
      cancelled = true;
      destroy?.();
    };
  });

  onDestroy(() => {
    clearInstallCoachTimer();
    hideToast();
    hideFact();
    closeAudio();
  });

  // One finger steers through joystickRef; a second finger converts the
  // gesture into a pinch that drives the free lens. Pointer ids are tracked
  // so stray touches can never hijack or kill an active gesture.
  const worldPointers = new Map<number, { x: number; y: number }>();
  let steeringPointerId: number | null = null;
  let pinchDistance: number | null = null;

  function pinchPointerPair() {
    const points = [...worldPointers.values()];
    return points.length === 2 ? points : null;
  }

  function pinchSpread() {
    const pair = pinchPointerPair();
    if (!pair) return null;
    return Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
  }

  function beginSteering(pointerId: number, x: number, y: number) {
    touchTipSeen = true;
    steeringPointerId = pointerId;
    joystickRef.current = {
      active: true,
      x,
      y,
      originX: x,
      originY: y,
    };
    joystickVisual.active = true;
    joystickVisual.originX = x;
    joystickVisual.originY = y;
    joystickVisual.x = x;
    joystickVisual.y = y;
  }

  function stopSteering() {
    steeringPointerId = null;
    joystickRef.current.active = false;
    joystickVisual.active = false;
  }

  function pointerDown(event: PointerEvent) {
    const target = event.target as HTMLElement;
    const insideInteractiveUi = Boolean(
      target.closest("button, a, input, select, textarea, .modal, dialog"),
    );
    if (
      !canStartPointerSteering(
        started,
        modalOpenRef.current,
        insideInteractiveUi,
      )
    ) {
      return;
    }
    if (worldPointers.size >= 2) return;
    worldPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (worldPointers.size === 2) {
      stopSteering();
      pinchDistance = pinchSpread();
    } else {
      beginSteering(event.pointerId, event.clientX, event.clientY);
    }
    try {
      (event.currentTarget as HTMLDivElement).setPointerCapture(
        event.pointerId,
      );
    } catch {
      // Synthetic or already-released pointers cannot be captured; steering
      // still tracks moves that stay over the world element.
    }
  }

  function pointerMove(event: PointerEvent) {
    const tracked = worldPointers.get(event.pointerId);
    if (!tracked) return;
    tracked.x = event.clientX;
    tracked.y = event.clientY;
    if (pinchDistance !== null) {
      const spread = pinchSpread();
      if (spread !== null && spread > 24) {
        adjustLens(pinchDistance / spread);
        pinchDistance = spread;
      }
      return;
    }
    if (event.pointerId !== steeringPointerId) return;
    joystickRef.current.x = event.clientX;
    joystickRef.current.y = event.clientY;
    joystickVisual.x = event.clientX;
    joystickVisual.y = event.clientY;
  }

  function pointerUp(event: PointerEvent) {
    if (!worldPointers.delete(event.pointerId)) return;
    if (pinchDistance !== null) {
      pinchDistance = null;
      // Hand steering back to the finger that stayed down.
      const [remaining] = [...worldPointers.entries()];
      if (remaining) {
        beginSteering(remaining[0], remaining[1].x, remaining[1].y);
      }
      return;
    }
    if (event.pointerId === steeringPointerId) stopSteering();
  }

  function wheelLens(event: WheelEvent) {
    if (!started || modalOpenRef.current) return;
    event.preventDefault();
    adjustLens(event.deltaY > 0 ? 1.08 : 0.92);
  }

  const collectibleCount = ERAS.reduce(
    (total, item) => total + item.curios.length,
    0,
  );
  const scienceSourceCount = new Set(
    ERAS.flatMap((item) => item.sources.map((source) => source.url)),
  ).size;

  const JOYSTICK_THROW_PX = 62;
  let joyThumb = $derived.by(() => {
    const dx = joystickVisual.x - joystickVisual.originX;
    const dy = joystickVisual.y - joystickVisual.originY;
    const length = Math.hypot(dx, dy);
    const scale =
      length > JOYSTICK_THROW_PX ? JOYSTICK_THROW_PX / length : 1;
    return {
      x: joystickVisual.originX + dx * scale,
      y: joystickVisual.originY + dy * scale,
    };
  });

  let era = $derived(ERAS[hud.era]);
  let journeyIndex = $derived(hud.journeyEra);
  // The final layer wraps to layer 0 as a new cycle, so "Next" names it.
  let nextEra = $derived(ERAS[(journeyIndex + 1) % ERAS.length]);
  let remainingScaleCollection = $derived.by(() => {
    const found = new Set(
      collection
        .filter((entry) => entry.eraId === era.id && entry.count > 0)
        .map((entry) => entry.curioId),
    );
    const missing = era.curios.filter((curio) => !found.has(curio.id));
    return {
      specimens: missing.length,
      landmarks: missing.filter((curio) => curio.spawnMode === "singleton")
        .length,
    };
  });
  let scale = $derived(
    labEra === null
      ? formatEraScale(journeyIndex, hud.progress)
      : formatEraScale(labEra, 0),
  );
  let atlasItem = $derived(ERAS[atlasEra]);
  let semanticScale = $derived(
    semanticViewScale(labEra ?? journeyIndex, hud.lens, ERAS.length),
  );
  let semanticFoundationIndex = $derived(Math.ceil(semanticScale) - 1);
  let semanticFoundation = $derived(
    semanticFoundationIndex >= 0
      ? ERAS[semanticFoundationIndex]
      : null,
  );
  let installCoachShowing = $derived(
    installCoachVisible &&
      (started || installCoachManual) &&
      !installedDisplayMode &&
      !toastVisible &&
      !factVisible &&
      !updateReady &&
      !updateApplying &&
      !showMenu &&
      !showGuide &&
      !showAtlas,
  );
</script>

<svelte:head>
  <title>Quantamari — Roll up the scale of everything</title>
  <meta
    name="description"
    content="A browser-only rolling game from the theory below known physics to the fiction beyond the observable universe."
  />
  <meta name="application-name" content="Quantamari" />
  <link rel="canonical" href="https://quantamari.royashbrook.com/" />
  <meta property="og:title" content="Quantamari — The Scale of Everything" />
  <meta
    property="og:description"
    content="Roll from the theory below known physics to the fiction beyond the observable universe."
  />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://quantamari.royashbrook.com/" />
  <meta name="twitter:card" content="summary" />
</svelte:head>

<main class="shell">
  <div
    bind:this={mount}
    class:started
    class:awaiting-start={!started}
    class:empty-origin={started && hud.era === 0}
    class:lab-active={labEra !== null}
    class:has-bottom-notice={toastVisible || factVisible || installCoachShowing}
    class="world"
    style={`--pop: ${era.palette[2]}; --deep: ${era.palette[0]}`}
    onpointerdown={pointerDown}
    onpointermove={pointerMove}
    onpointerup={pointerUp}
    onpointercancel={pointerUp}
    onwheel={wheelLens}
    oncontextmenu={(event) => {
      const target = event.target as HTMLElement;
      const interactive = target.closest(
        "button, a, input, select, textarea, .modal, dialog",
      );
      if (started && !modalOpenRef.current && !interactive) {
        event.preventDefault();
      }
    }}
    role="group"
    aria-label="Quantamari game world and controls"
  >
    <header class="topbar hud">
      <div class="brand">
        <div class="brand-ball" aria-hidden="true">✦</div>
        <div>
          <b>QUANTAMARI</b>
          <small class="tagline">the scale of everything</small>
          <small
            class="version-stamp"
            data-testid="build-stamp"
            title={`Quantamari v${appVersion}, build ${buildVersion}`}
          >
            v{appVersion} · {buildLabel}
          </small>
        </div>
      </div>
      <div class="actions">
        <button
          bind:this={guideButton}
          class="quick-action field-guide-trigger"
          aria-label="Open rolled-up field guide"
          onclick={openGuide}
        >
          <span aria-hidden="true">✦</span> <span>Field guide</span>
        </button>
        <button
          class="quick-action atlas-trigger"
          onclick={openAtlas}
          aria-label="Open scale and science atlas"
        >
          <span aria-hidden="true">⌁</span> <span>Scale & science</span>
        </button>
        <button
          bind:this={menuButton}
          class="menu-trigger"
          onclick={openMenu}
          aria-label="Open game menu"
          aria-haspopup="dialog"
          aria-expanded={showMenu}
        >
          <span aria-hidden="true">☰</span> <span>Menu</span>
        </button>
      </div>
    </header>

    {#if updateReady || updateApplying}
      <aside
        class="update-banner"
        role="status"
        aria-label="Update ready"
        aria-live="polite"
        aria-atomic="true"
      >
        <span class="update-banner-mark" aria-hidden="true">↻</span>
        <span class="update-banner-copy">
          <b>{updateApplying ? "Updating Quantamari…" : "Update ready"}</b>
          <small>
            {updateApplying
              ? "Your universe is saved. Loading the new build now."
              : "A new build is waiting. Save and load it whenever you’re ready."}
          </small>
        </span>
        <button type="button" onclick={applyUpdate} disabled={updateApplying}>
          {updateApplying ? "Loading…" : "Update now"}
        </button>
      </aside>
    {/if}

    <InstallCoach
      visible={installCoachShowing}
      kind={installKind}
      appleTablet={installAppleTablet}
      applying={installApplying}
      onPrimary={() => void activateInstallCoach()}
      onDismiss={dismissInstallCoach}
    />

    {#if labEra !== null}
      <div class="lab-banner hud">
        <span>Scale Lab preview · progress paused</span>
        <button onclick={returnToJourney}>Return to journey</button>
      </div>
    {/if}

    <div
      class:ready-to-grow={labEra === null && hud.progress >= 1}
      class="journey-dock hud"
      aria-label="Journey status"
    >
      <section class="scale-card hud" aria-label="Scale progress">
        <div class="kicker">
          <span>{era.name}</span>
          <span class={`confidence ${confidenceClass(era.confidence)}`}>
            {era.confidence}
          </span>
        </div>
        <div class="scale">
          <small class="mobile-current">
            {era.name} · {era.confidence}
          </small>
          <span>{scale}</span>
        </div>
        <div class="quip">{era.quip}</div>
        <div class="track">
          <i style={`--progress: ${Math.max(0.015, hud.progress)}`}></i>
        </div>
        <div class:scale-ready={labEra === null && hud.progress >= 1} class="meta">
          {#if labEra === null && hud.progress >= 1}
            <button
              class="grow-action"
              type="button"
              data-testid="grow-layer"
              aria-label={`Grow to ${nextEra.name}`}
              onclick={growToNextScale}
            >
              <span>
                <small>Scale ready</small>
                <b>Grow to {nextEra.name}</b>
              </span>
              <span class="grow-choice">
                {remainingScaleCollection.specimens === 0
                  ? "scale guide complete"
                  : remainingScaleCollection.landmarks > 0
                    ? `${remainingScaleCollection.specimens} finds · ${remainingScaleCollection.landmarks} landmark${remainingScaleCollection.landmarks === 1 ? "" : "s"}`
                    : `${remainingScaleCollection.specimens} finds remain`}
                <b aria-hidden="true">→</b>
              </span>
            </button>
          {:else}
            <span class="frontier">
              <small>{labEra === null ? "Next frontier" : "Scale Lab"}</small>
              <b>{labEra === null ? nextEra.name : "Specimen preview"}</b>
            </span>
            <span class="progress-value">
              {labEra === null
                ? `${(hud.progress * 100).toFixed(2)}%`
                : "PREVIEW"}
            </span>
          {/if}
        </div>
        <div
          class="lens-control"
          aria-label="Free scale lens"
          title="Optical zoom also selects which earlier layer is resolved as the non-interactive fabric underfoot; it never changes journey progress."
        >
          <button
            type="button"
            onclick={() => adjustLens(0.82)}
            aria-label="Zoom camera in"
          >
            −
          </button>
          <span>
            {formatLens(hud.lens)}× lens ·
            {semanticFoundation
              ? `${semanticFoundation.name} fabric`
              : "no prior fabric"}
          </span>
          <button
            type="button"
            onclick={() => adjustLens(1.22)}
            aria-label="Zoom camera out"
          >
            +
          </button>
        </div>
      </section>

      <aside class="stats hud" aria-label="Run totals">
        <div title="Things collected">
          <b>{hud.picked.toLocaleString()}</b>
          <small>
            <span class="wide-label">things collected</span>
            <span class="compact-label">finds</span>
          </small>
        </div>
        <i></i>
        <div title="Layers underfoot">
          <b>{journeyIndex}</b>
          <small>
            <span class="wide-label">layers underfoot</span>
            <span class="compact-label">layers</span>
          </small>
        </div>
        <i></i>
        <div title="Scale shifts">
          <b>{hud.zooms}</b>
          <small>
            <span class="wide-label">scale shifts</span>
            <span class="compact-label">shifts</span>
          </small>
        </div>
        {#if hud.cycles > 0}
          <i></i>
          <div class="cycle-stat">
            <b>♻ {hud.cycles + 1}</b>
            <small>cycle</small>
          </div>
        {/if}
      </aside>

      {#if !touchTipSeen && !hasFact}
        <div class="touch-tip">◎ drag to roll · pinch to zoom</div>
      {/if}
    </div>

    {#if factVisible || labEra !== null}
      <aside
        class="fact-card hud"
      >
        <div
          class="find-token"
          aria-hidden="true"
          style={`--find-color: ${lastFact.color ?? "#ff7dd0"}`}
        >
          {lastFact.symbol ?? "✦"}
        </div>
        <div class="fact-kicker">
          <span>{labEra === null ? "ROLLED UP" : "SCALE LAB SPECIMEN"}</span>
          {#if factAchievement}
            <b class="achievement-unlock">🏆 {factAchievement}</b>
          {/if}
          {#if factVisible && factBurstCount > 1}
            <b>+{factBurstCount - 1} more</b>
          {/if}
        </div>
        {#if factMilestone}
          <b class="scale-ready-unlock">{factMilestone}</b>
        {/if}
        <h2>{lastFact.name}</h2>
        <p>{lastFact.fact}</p>
        <span class="fact-citation">
          {lastFact.source.organization} · {lastFact.source.label}
        </span>
        <div class="fact-actions">
          <a
            class="fact-source"
            href={lastFact.source.url}
            target="_blank"
            rel="noreferrer"
          >
            {lastFact.source.organization} · {lastFact.source.label} ↗
          </a>
          <button
            type="button"
            onclick={openGuide}
          >
            <span class="wide-label">See every find</span>
            <span class="compact-label">Guide</span>
          </button>
        </div>
      </aside>
      {#if factVisible}
        <p
          class="pickup-announcement"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {pickupAnnouncement}
        </p>
      {/if}
    {/if}

    {#if toastVisible}
      <div class="toast hud" role="status" aria-live="polite">
        <span>✦</span>
        <span class="toast-text">{toast}</span>
      </div>
    {/if}

    <div class="controls hud">
      <span><kbd>WASD</kbd> / arrows to roll</span>
      <span><kbd>I</kbd> science</span>
      <span><kbd>G</kbd> field guide</span>
      <span><kbd>ESC</kbd> menu</span>
    </div>

    {#if joystickVisual.active}
      <div class="joy" aria-hidden="true">
        <i
          class="joy-ring"
          style={`left: ${joystickVisual.originX}px; top: ${joystickVisual.originY}px`}
        ></i>
        <i
          class="joy-thumb"
          style={`left: ${joyThumb.x}px; top: ${joyThumb.y}px`}
        ></i>
      </div>
    {/if}

    {#if !started}
      <section class="welcome modal">
        <div class="eyebrow">BEGIN WHERE THE MAP RUNS OUT</div>
        <h1>
          You are not a ball.
          <br />
          <em>Not yet.</em>
        </h1>
        <p class="welcome-lead">
          Roll up a playful universe from the mystery below known physics to
          the fiction beyond everything we can see. Choose your pace and start
          becoming.
        </p>
        <div class="mode-cards" role="group" aria-label="Choose how to play">
          <section
            class="mode-card mode-card-long"
            aria-labelledby="long-game-title"
          >
            <span class="mode-card-mark" aria-hidden="true">∞</span>
            <div class="mode-card-copy">
              <span class="mode-card-kicker">THE FULL JOURNEY</span>
              <h2 id="long-game-title">Long game</h2>
              <p>A calm, dense 40× collecting journey through every scale.</p>
            </div>
            <button
              class="mode-play"
              type="button"
              aria-label="Play Long Game"
              onclick={() => startMode("journey")}
            >
              <span class="mode-button-copy">
                <span>Play</span><span class="mode-button-detail">long game</span>
              </span>
              <b aria-hidden="true">→</b>
            </button>
          </section>
          <section
            class="mode-card mode-card-tour"
            aria-labelledby="learning-tour-title"
          >
            <span class="mode-card-mark" aria-hidden="true">⌁</span>
            <div class="mode-card-copy">
              <span class="mode-card-kicker">THE QUICK TOUR</span>
              <h2 id="learning-tour-title">Learning tour</h2>
              <p>Meet every layer quickly and watch the scale shifts unfold.</p>
            </div>
            <button
              class="mode-play"
              type="button"
              aria-label="Play Learning Tour"
              onclick={() => startMode("learning")}
            >
              <span class="mode-button-copy">
                <span>Play</span><span class="mode-button-detail">learning tour</span>
              </span>
              <b aria-hidden="true">→</b>
            </button>
          </section>
        </div>
        <div class="welcome-foot">
          <span>{collectibleCount} GUIDE SPECIMENS</span><span>•</span>
          <span>{ERAS.length} SCALE LAYERS</span><span>•</span>
          <span>{scienceSourceCount} SOURCES IN THE SCIENCE ATLAS</span>
        </div>
      </section>
    {/if}

    <GameMenu
      open={showMenu}
      {started}
      {sound}
      {appVersion}
      {buildLabel}
      {updateReady}
      installAvailable={!installedDisplayMode && installKind !== null}
      installNative={installKind === "native"}
      {performanceProfile}
      onClose={closeMenu}
      onOpenGuide={openGuideFromMenu}
      onOpenAtlas={openAtlasFromMenu}
      onToggleSound={toggleSound}
      onToggleBatteryOptimized={toggleBatteryOptimized}
      onReset={resetProgress}
      onApplyUpdate={applyUpdate}
      onInstall={installFromMenu}
    />

    {#if showAtlas}
      <dialog
        bind:this={atlasDialog}
        class="atlas-bg modal"
        aria-label="Scale and science atlas"
        oncancel={(event) => {
          event.preventDefault();
          closeAtlas();
        }}
      >
        <div class="atlas">
          <header>
            <div>
              <div class="eyebrow">THE RIDICULOUSLY LONG, HONEST VIEW</div>
              <h2>Scale & science</h2>
              <p>
                Preview any era without changing your save. Confidence labels
                separate observations from models, unknowns, and deliberate fiction.
              </p>
              <div class="atlas-mode" role="group" aria-label="Game pace">
                <span>GAME PACE</span>
                <button
                  type="button"
                  aria-pressed={gameMode === "journey"}
                  onclick={() => chooseMode("journey")}
                >
                  Long game · 40×
                </button>
                <button
                  type="button"
                  aria-pressed={gameMode === "learning"}
                  onclick={() => chooseMode("learning")}
                >
                  Learning tour
                </button>
              </div>
            </div>
            <button
              class="atlas-close"
              onclick={closeAtlas}
              aria-label="Close atlas"
            >
              ×
            </button>
          </header>
          <div class="era-list">
            <div class="scale-scrubber">
              <div>
                <span>UNKNOWN BELOW</span>
                <b>drag across all {ERAS.length} layers</b>
                <span>FICTION BEYOND</span>
              </div>
              <input
                type="range"
                min="0"
                max={ERAS.length - 1}
                step="1"
                bind:value={atlasEra}
                aria-label="Choose a scale layer"
              />
              <div class="scrubber-meta">
                <span>Layer {atlasEra + 1} of {ERAS.length}</span>
                <span>{atlasEra <= journeyIndex ? "REACHED" : "AHEAD"}</span>
              </div>
            </div>
            <article class="era-feature current">
              <div
                class="era-dot"
                style={`background: ${atlasItem.palette[2]}`}
              >
                {atlasEra + 1}
              </div>
              <div class="era-copy">
                <span>
                  {atlasEra === 0 ? "THEORY PLAYGROUND" : "SCALE LAYER"}
                </span>
                <h3>{atlasItem.name}</h3>
                <p>{atlasItem.lesson}</p>
                <div class={`confidence ${confidenceClass(atlasItem.confidence)}`}>
                  {atlasItem.confidence}
                </div>
              </div>
              <div class="era-actions">
                <code>{formatEraScale(atlasEra, 0)}</code>
                <a
                  href={atlasItem.sources[0].url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {atlasItem.sources[0].organization} reference ↗
                </a>
                <button onclick={() => previewEra(atlasEra)}>
                  {labEra === atlasEra ? "Viewing" : "Preview in 3D"}
                </button>
              </div>
            </article>
            <article class="sources">
              <div>
                <span>AUTHORITATIVE REFERENCES</span>
                <h3>Built to teach without pretending certainty</h3>
                <p>
                  The progression compresses scale and uses magical adhesion. Each
                  collectible links to an authoritative scale or topic reference;
                  that link is context, not a citation for every playful sentence.
                  Confidence labels keep observation, models, unknowns, and fiction
                  visibly separate.
                </p>
              </div>
              <div class="source-links">
                <a
                  href="https://physics.nist.gov/cgi-bin/cuu/Value?plkl"
                  target="_blank"
                  rel="noreferrer"
                >NIST · Planck length ↗</a>
                <a
                  href="https://home.cern/partons-hadrons/"
                  target="_blank"
                  rel="noreferrer"
                >CERN · Quark confinement ↗</a>
                <a
                  href="https://home.cern/science/experiments/alice/"
                  target="_blank"
                  rel="noreferrer"
                >CERN ALICE · Matter ↗</a>
                <a
                  href="https://home.cern/science/physics/standard-model"
                  target="_blank"
                  rel="noreferrer"
                >CERN · Standard Model ↗</a>
              </div>
            </article>
          </div>
        </div>
      </dialog>
    {/if}

    <FieldGuide
      open={showGuide}
      entries={collection}
      cycles={hud.cycles}
      {legacyUnitemizedCount}
      onClose={closeGuide}
    />
  </div>
</main>
