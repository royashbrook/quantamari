<script lang="ts">
  import { base } from "$app/paths";
  import type { InstallPromptKind } from "$lib/pwa-install";
  import styles from "./install-coach.module.css";

  type InstallCoachProps = {
    visible: boolean;
    kind: InstallPromptKind | null;
    appleTablet: boolean;
    applying: boolean;
    onPrimary: () => void;
    onDismiss: () => void;
  };

  let {
    visible,
    kind,
    appleTablet,
    applying,
    onPrimary,
    onDismiss,
  }: InstallCoachProps = $props();

  const componentId = $props.id();
  const titleId = `${componentId}-title`;
  const descriptionId = `${componentId}-description`;
  let description = $derived(
    kind === "apple"
      ? appleTablet
        ? "Share → More → Add to Home Screen → Open as Web App, if shown → Add."
        : "Open Share, via More if needed → Add to Home Screen → Open as Web App, if shown → Add."
      : kind === "manual"
        ? "Browser menu → Install app or Add to Home Screen."
        : "Full-screen, offline, and one tap from your Home Screen.",
  );
</script>

<span
  class={styles.announcement}
  data-testid="install-announcement"
  role="status"
  aria-live="polite"
  aria-atomic="true"
>
  {visible && kind ? `Install Quantamari. ${description}` : ""}
</span>

{#if visible && kind}
  <aside
    class={styles.coach}
    data-testid="install-coach"
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
  >
    <img src={`${base}/icon-192.png`} alt="" width="48" height="48" />
    <span class={styles.copy}>
      <b id={titleId}>Install Quantamari</b>
      <small id={descriptionId}>
        {description}
      </small>
    </span>
    <button
      class={styles.primary}
      type="button"
      onclick={onPrimary}
      disabled={applying}
      aria-label={kind === "native"
        ? "Install Quantamari"
        : "Got it, dismiss installation instructions"}
    >
      {kind === "native" ? (applying ? "Opening…" : "Install") : "Got it"}
    </button>
    <button
      class={styles.dismiss}
      type="button"
      onclick={onDismiss}
      aria-label="Dismiss install suggestion"
    >
      ×
    </button>
  </aside>
{/if}
