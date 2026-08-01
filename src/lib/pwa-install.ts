export const INSTALL_COACH_STORAGE_KEY = "quantamari-install-coach-v1";
export const INSTALL_COACH_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
export const INSTALL_COACH_INSTALLED_VALUE = "installed";

export type InstallPromptKind = "apple" | "manual" | "native";

export type InstallPromptChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice: Promise<InstallPromptChoice>;
  prompt(): Promise<void>;
}

export type InstallSignals = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  userAgentMobile: boolean;
  coarsePointer: boolean;
  viewportWidth: number;
  viewportHeight: number;
  navigatorStandalone: boolean;
  displayModeStandalone: boolean;
};

export function isAppleTouchDevice(signals: InstallSignals) {
  return (
    /iPad|iPhone|iPod/i.test(signals.userAgent) ||
    (signals.platform === "MacIntel" && signals.maxTouchPoints > 1)
  );
}

export function isAppleTablet(signals: InstallSignals) {
  return (
    /iPad/i.test(signals.userAgent) ||
    (signals.platform === "MacIntel" && signals.maxTouchPoints > 1)
  );
}

export function isPhoneOrTablet(signals: InstallSignals) {
  if (isAppleTouchDevice(signals) || signals.userAgentMobile) return true;
  if (/Android|Mobile|Tablet|Silk|Kindle/i.test(signals.userAgent)) return true;

  const shortSide = Math.min(signals.viewportWidth, signals.viewportHeight);
  const longSide = Math.max(signals.viewportWidth, signals.viewportHeight);
  return signals.coarsePointer && shortSide <= 1_024 && longSide <= 1_366;
}

export function isStandaloneApp(signals: InstallSignals) {
  return signals.navigatorStandalone || signals.displayModeStandalone;
}

export function installCoachSuppressed(
  storedValue: string | null | undefined,
  now = Date.now(),
) {
  if (storedValue === INSTALL_COACH_INSTALLED_VALUE) return true;
  if (!storedValue) return false;
  const suppressedUntil = Number(storedValue);
  return Number.isFinite(suppressedUntil) && suppressedUntil > now;
}

export function installCoachSnoozeValue(now = Date.now()) {
  return String(now + INSTALL_COACH_SNOOZE_MS);
}
