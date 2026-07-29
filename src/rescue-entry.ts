import {
  SAVE_KEYS,
  loadSaveCandidates,
  serializeSaveData,
  type RawSaveCandidates,
} from "$lib/save-data";
import { ERAS } from "$lib/scale-data";

const BACKUP_KEY = "everything-roll-rescue-backup-v1";
const CACHE_PREFIX = "quarkatamari-";

function element<T extends HTMLElement>(id: string) {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing rescue element: ${id}`);
  return value as T;
}

function readCandidates(): RawSaveCandidates {
  return {
    v4: localStorage.getItem(SAVE_KEYS.v4),
    v3: localStorage.getItem(SAVE_KEYS.v3),
    v2: localStorage.getItem(SAVE_KEYS.v2),
  };
}

function availableCandidate(candidates: RawSaveCandidates) {
  return candidates.v4 ?? candidates.v3 ?? candidates.v2 ?? "";
}

function candidateFor(raw: string): RawSaveCandidates {
  const value = JSON.parse(raw) as { version?: unknown };
  if (value?.version === 4) return { v4: raw };
  if (value?.version === 3) return { v3: raw };
  return { v2: raw };
}

function summary(raw: string) {
  const loaded = loadSaveCandidates(candidateFor(raw), ERAS);
  if (!loaded) return null;
  const layer = ERAS.find((era) => era.id === loaded.save.eraId);
  return {
    loaded,
    text: [
      layer?.name ?? loaded.save.eraId,
      loaded.save.mode === "journey" ? "Long Game" : "Learning Tour",
      `${loaded.save.picked.toLocaleString()} rolled up`,
      `${loaded.save.collection.length.toLocaleString()} known specimens`,
    ].join(" · "),
  };
}

function describeContext() {
  let standalone = false;
  try {
    standalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    // Older browsers can still use every rescue action.
  }
  element("where").textContent = standalone
    ? "This is the installed app. On iPhone, its save can be separate from Safari."
    : "This is a browser tab. An installed copy may have separate storage on iPhone.";
}

function showCurrentSave() {
  const status = element("status");
  const details = element("summary");
  const box = element<HTMLTextAreaElement>("saveBox");
  try {
    const raw = availableCandidate(readCandidates());
    if (!raw) {
      status.textContent = "No Quantamari save was found here.";
      status.className = "message bad";
      details.textContent =
        "Try opening this page from the installed app if that is where you played.";
      box.value = "";
      return;
    }
    const parsed = summary(raw);
    status.textContent = parsed
      ? "Your journey is here and readable."
      : "Save text was found, but it does not match a supported save.";
    status.className = parsed ? "message good" : "message bad";
    details.textContent = parsed?.text ?? "Copy or download it before trying repairs.";
    box.value = raw;
  } catch (error) {
    status.textContent = "This browser would not allow access to local storage.";
    status.className = "message bad";
    details.textContent = error instanceof Error ? error.message : String(error);
  }
}

function copySave() {
  const box = element<HTMLTextAreaElement>("saveBox");
  const message = element("exportMessage");
  box.select();
  box.setSelectionRange(0, box.value.length);
  const fallback = () => {
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  };
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(box.value).then(
      () => {
        message.textContent = "Copied. Put it somewhere safe.";
        message.className = "message good";
      },
      () => {
        const copied = fallback();
        message.textContent = copied
          ? "Copied. Put it somewhere safe."
          : "Copy failed. Select the text and copy it manually.";
        message.className = copied ? "message good" : "message bad";
      },
    );
    return;
  }
  const copied = fallback();
  message.textContent = copied
    ? "Copied. Put it somewhere safe."
    : "Copy failed. Select the text and copy it manually.";
  message.className = copied ? "message good" : "message bad";
}

function downloadSave() {
  const raw = element<HTMLTextAreaElement>("saveBox").value;
  const message = element("exportMessage");
  if (!raw) {
    message.textContent = "There is no save here to download.";
    message.className = "message bad";
    return;
  }
  const url = URL.createObjectURL(
    new Blob([raw], { type: "application/json;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "quantamari-save.json";
  link.click();
  URL.revokeObjectURL(url);
  message.textContent = "Downloaded quantamari-save.json.";
  message.className = "message good";
}

function restoreSave() {
  const raw = element<HTMLTextAreaElement>("restoreBox").value.trim();
  const message = element("restoreMessage");
  let parsed: ReturnType<typeof summary>;
  try {
    parsed = summary(raw);
  } catch {
    parsed = null;
  }
  if (!parsed) {
    message.textContent =
      "That is JSON, but not a supported Quantamari v2, v3, or v4 save.";
    message.className = "message bad";
    return;
  }
  if (
    availableCandidate(readCandidates()) &&
    !window.confirm(
      "Replace the save in this copy of Quantamari? A rescue backup will be kept.",
    )
  ) {
    return;
  }
  try {
    localStorage.setItem(
      BACKUP_KEY,
      JSON.stringify({ savedAt: new Date().toISOString(), saves: readCandidates() }),
    );
    localStorage.setItem(
      SAVE_KEYS.v4,
      serializeSaveData(parsed.loaded.save),
    );
    message.textContent = `Restored: ${parsed.text}`;
    message.className = "message good";
    showCurrentSave();
  } catch (error) {
    message.textContent =
      error instanceof Error ? error.message : "This browser blocked the restore.";
    message.className = "message bad";
  }
}

function loadRescueBackup() {
  const message = element("restoreMessage");
  try {
    const backup = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "null") as {
      saves?: RawSaveCandidates;
    } | null;
    const raw = backup?.saves ? availableCandidate(backup.saves) : "";
    if (!raw) throw new Error("No previous rescue backup was found.");
    element<HTMLTextAreaElement>("restoreBox").value = raw;
    message.textContent =
      "Previous save loaded below. Validate and restore when you are ready.";
    message.className = "message good";
  } catch (error) {
    message.textContent =
      error instanceof Error ? error.message : "The rescue backup could not be read.";
    message.className = "message bad";
  }
}

async function repairAppFiles() {
  const message = element("repairMessage");
  message.textContent = "Cleaning only Quantamari app files…";
  message.className = "message";
  try {
    if ("caches" in window) {
      for (const key of await caches.keys()) {
        if (key.startsWith(CACHE_PREFIX)) await caches.delete(key);
      }
    }
    if ("serviceWorker" in navigator) {
      const appPath = new URL("./", location.href).pathname;
      for (const registration of await navigator.serviceWorker.getRegistrations()) {
        const scope = new URL(registration.scope);
        if (
          scope.origin === location.origin &&
          scope.pathname.startsWith(appPath)
        ) {
          await registration.unregister();
        }
      }
    }
    const saveStillExists = Boolean(availableCandidate(readCandidates()));
    message.textContent = saveStillExists
      ? "App files cleared. Your save is still here. Reopen the game for a clean copy."
      : "App files cleared. There was no save in this copy before or after the repair.";
    message.className = "message good";
  } catch (error) {
    message.textContent =
      error instanceof Error ? error.message : "The repair could not finish.";
    message.className = "message bad";
  }
}

function wire() {
  describeContext();
  showCurrentSave();
  element("copy").addEventListener("click", copySave);
  element("download").addEventListener("click", downloadSave);
  element("restore").addEventListener("click", restoreSave);
  element("loadBackup").addEventListener("click", loadRescueBackup);
  element("repair").addEventListener("click", () => void repairAppFiles());
}

wire();
