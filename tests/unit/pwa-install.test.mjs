import assert from "node:assert/strict";
import test from "node:test";

import {
  INSTALL_COACH_INSTALLED_VALUE,
  INSTALL_COACH_SNOOZE_MS,
  INSTALL_COACH_STORAGE_KEY,
  installCoachSnoozeValue,
  installCoachSuppressed,
  isAppleTablet,
  isAppleTouchDevice,
  isPhoneOrTablet,
  isStandaloneApp,
} from "../../src/lib/pwa-install.ts";

function signals(overrides = {}) {
  return {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    platform: "MacIntel",
    maxTouchPoints: 0,
    userAgentMobile: false,
    coarsePointer: false,
    viewportWidth: 1_440,
    viewportHeight: 900,
    navigatorStandalone: false,
    displayModeStandalone: false,
    ...overrides,
  };
}

test("install coaching recognizes iPhone, desktop-UA iPad, and Android tablets", () => {
  const iphone = signals({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    platform: "iPhone",
    maxTouchPoints: 5,
    coarsePointer: true,
    viewportWidth: 420,
    viewportHeight: 912,
  });
  const desktopUaIpad = signals({
    maxTouchPoints: 5,
    coarsePointer: true,
    viewportWidth: 1_024,
    viewportHeight: 1_366,
  });
  const androidTablet = signals({
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    platform: "Linux armv8l",
    maxTouchPoints: 5,
    coarsePointer: true,
    viewportWidth: 800,
    viewportHeight: 1_280,
  });

  assert.equal(isAppleTouchDevice(iphone), true);
  assert.equal(isAppleTouchDevice(desktopUaIpad), true);
  assert.equal(isAppleTouchDevice(androidTablet), false);
  assert.equal(isAppleTablet(iphone), false);
  assert.equal(isAppleTablet(desktopUaIpad), true);
  assert.equal(isPhoneOrTablet(iphone), true);
  assert.equal(isPhoneOrTablet(desktopUaIpad), true);
  assert.equal(isPhoneOrTablet(androidTablet), true);
  assert.equal(isPhoneOrTablet(signals()), false);
});

test("standalone detection accepts both modern display mode and legacy iOS", () => {
  assert.equal(isStandaloneApp(signals()), false);
  assert.equal(
    isStandaloneApp(signals({ displayModeStandalone: true })),
    true,
  );
  assert.equal(
    isStandaloneApp(signals({ navigatorStandalone: true })),
    true,
  );
});

test("install coach dismissal expires while confirmed installation persists", () => {
  const now = 2_000_000;
  const snoozed = installCoachSnoozeValue(now);

  assert.equal(INSTALL_COACH_STORAGE_KEY, "quantamari-install-coach-v1");
  assert.equal(Number(snoozed), now + INSTALL_COACH_SNOOZE_MS);
  assert.equal(installCoachSuppressed(null, now), false);
  assert.equal(installCoachSuppressed(snoozed, now), true);
  assert.equal(
    installCoachSuppressed(snoozed, now + INSTALL_COACH_SNOOZE_MS),
    false,
  );
  assert.equal(
    installCoachSuppressed(INSTALL_COACH_INSTALLED_VALUE, Number.MAX_VALUE),
    true,
  );
  assert.equal(installCoachSuppressed("not-a-date", now), false);
});
