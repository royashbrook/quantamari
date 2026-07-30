<script lang="ts">
  import { base } from "$app/paths";
  import { tick } from "svelte";
  import type { PerformanceProfile } from "$lib/performance-profile";
  import styles from "./game-menu.module.css";

  type MenuView = "main" | "about" | "reset";

  type GameMenuProps = {
    open: boolean;
    started: boolean;
    sound: boolean;
    performanceProfile: PerformanceProfile;
    appVersion: string;
    buildLabel: string;
    updateReady: boolean;
    onClose: () => void;
    onOpenGuide: () => void;
    onOpenAtlas: () => void;
    onToggleSound: () => void;
    onToggleBatteryOptimized: () => void;
    onReset: () => boolean;
    onApplyUpdate: () => void;
  };

  let {
    open,
    started,
    sound,
    performanceProfile,
    appVersion,
    buildLabel,
    updateReady,
    onClose,
    onOpenGuide,
    onOpenAtlas,
    onToggleSound,
    onToggleBatteryOptimized,
    onReset,
    onApplyUpdate,
  }: GameMenuProps = $props();

  const componentId = $props.id();
  const titleId = `${componentId}-title`;
  const descriptionId = `${componentId}-description`;

  let dialog = $state<HTMLDialogElement>();
  let view = $state<MenuView>("main");
  let resetFailed = $state(false);

  function returnToMenu() {
    view = "main";
    resetFailed = false;
  }

  function closeMenu() {
    returnToMenu();
    onClose();
  }

  function handleCancel(event: Event) {
    event.preventDefault();
    if (view === "main") closeMenu();
    else returnToMenu();
  }

  function handleDialogClick(event: MouseEvent) {
    if (event.target === event.currentTarget) closeMenu();
  }

  function resetProgress() {
    resetFailed = !onReset();
  }

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      view = "main";
      resetFailed = false;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  $effect(() => {
    const currentView = view;
    if (!open || !dialog?.open) return;
    void tick().then(() => {
      dialog
        ?.querySelector<HTMLButtonElement>(`[data-focus="${currentView}"]`)
        ?.focus();
    });
  });
</script>

<dialog
  bind:this={dialog}
  class={styles.dialog}
  aria-labelledby={titleId}
  aria-describedby={descriptionId}
  oncancel={handleCancel}
  onclick={handleDialogClick}
>
  <section class={styles.panel}>
    <header class={styles.header}>
      <div class={styles.mark} aria-hidden="true">✦</div>
      <div class={styles.heading}>
        <span>{started ? "EVERYTHING CAN WAIT" : "BEFORE THE ROLLING"}</span>
        <h2 id={titleId}>Game menu</h2>
        <p id={descriptionId}>
          {started
            ? "Paused. The whole scale of everything will stay exactly where you left it."
            : "Take a look around before becoming something that can roll."}
        </p>
      </div>
      <button
        class={styles.close}
        type="button"
        onclick={closeMenu}
        aria-label={started ? "Resume game" : "Close game menu"}
      >
        ×
      </button>
    </header>

    <div class={styles.body}>
      {#if view === "main"}
        <button
          class={styles.resume}
          type="button"
          data-focus="main"
          onclick={closeMenu}
        >
          <span>{started ? "Resume rolling" : "Back to the beginning"}</span>
          <b aria-hidden="true">→</b>
        </button>

        <div class={styles.choices}>
          {#if updateReady}
            <button
              class={styles.updateChoice}
              type="button"
              onclick={onApplyUpdate}
            >
              <span class={styles.icon} aria-hidden="true">↻</span>
              <span>
                <b>Update ready</b>
                <small>Save this universe and load the new build</small>
              </span>
            </button>
          {/if}
          <button type="button" onclick={onToggleSound}>
            <span class={styles.icon} aria-hidden="true">{sound ? "♪" : "×"}</span>
            <span>
              <b>{sound ? "Mute sound" : "Turn on sound"}</b>
              <small>{sound ? "Quiet the tiny universe" : "Bring back the pings"}</small>
            </span>
          </button>
          <button
            class={styles.performanceChoice}
            type="button"
            role="switch"
            aria-checked={performanceProfile === "battery"}
            onclick={onToggleBatteryOptimized}
          >
            <span class={styles.icon} aria-hidden="true">
              {performanceProfile === "battery" ? "◐" : "✦"}
            </span>
            <span>
              <b>Battery Optimized</b>
              <small>
                {performanceProfile === "battery"
                  ? "On · cooler rendering, same universe"
                  : "Off · stable Standard graphics"}
              </small>
            </span>
          </button>
          <button type="button" onclick={onOpenGuide}>
            <span class={styles.icon} aria-hidden="true">✦</span>
            <span>
              <b>Field guide</b>
              <small>See everything riding along</small>
            </span>
          </button>
          <button type="button" onclick={onOpenAtlas}>
            <span class={styles.icon} aria-hidden="true">⌁</span>
            <span>
              <b>Scale & science</b>
              <small>Visit every known and unknown layer</small>
            </span>
          </button>
          <a href={`${base}/rescue`} rel="external">
            <span class={styles.icon} aria-hidden="true">+</span>
            <span>
              <b>Save rescue</b>
              <small>Export a journey or repair installed files</small>
            </span>
          </a>
          <button type="button" onclick={() => (view = "about")}>
            <span class={styles.icon} aria-hidden="true">?</span>
            <span>
              <b>About Quantamari</b>
              <small>Credits, code, and this exact build</small>
            </span>
          </button>
          <button
            class={styles.resetChoice}
            type="button"
            onclick={() => (view = "reset")}
          >
            <span class={styles.icon} aria-hidden="true">↺</span>
            <span>
              <b>Reset all progress</b>
              <small>Return this browser to the theory playground</small>
            </span>
          </button>
        </div>
      {:else if view === "about"}
        <div class={styles.subview}>
          <button
            class={styles.back}
            type="button"
            data-focus="about"
            onclick={returnToMenu}
          >
            ← Menu
          </button>
          <div class={styles.aboutHero}>
            <div aria-hidden="true">✦</div>
            <span>THE SCALE OF EVERYTHING</span>
            <h3>About Quantamari</h3>
            <p>
              A browser-only rolling game about how strange reality gets when
              you zoom all the way in—or all the way out.
            </p>
          </div>
          <dl class={styles.buildDetails}>
            <div>
              <dt>Version</dt>
              <dd data-testid="about-build">v{appVersion} · {buildLabel}</dd>
            </div>
            <div>
              <dt>Runtime</dt>
              <dd>SvelteKit + Three.js · no server</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                <a
                  href="https://github.com/royashbrook/quantamari"
                  target="_blank"
                  rel="noreferrer"
                >GitHub ↗</a>
              </dd>
            </div>
          </dl>
        </div>
      {:else}
        <div class={`${styles.subview} ${styles.resetView}`}>
          <button
            class={styles.back}
            type="button"
            data-focus="reset"
            onclick={returnToMenu}
          >
            ← Keep my universe
          </button>
          <div class={styles.warning} aria-hidden="true">!</div>
          <span class={styles.dangerKicker}>THIS CANNOT BE UNDONE</span>
          <h3>Reset all progress?</h3>
          <p>
            Your collected things, scale layers, position, and journey settings
            will be removed from this browser. This device’s graphics choice and
            the game itself stay installed.
          </p>
          {#if resetFailed}
            <p class={styles.error} role="alert">
              This browser blocked the reset. Reloading was stopped, so your
              current game stays open.
            </p>
          {/if}
          <div class={styles.resetActions}>
            <button type="button" onclick={returnToMenu}>Cancel</button>
            <button
              class={styles.danger}
              type="button"
              onclick={resetProgress}
            >
              Reset everything
            </button>
          </div>
        </div>
      {/if}
    </div>

    <footer class={styles.credit}>
      <span>
        made with
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          class={styles.heart}
        >
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          />
        </svg>
        <span class={styles.srOnly}>love</span>
        by
        <a href="https://royashbrook.com" target="_blank" rel="noreferrer">
          roy
        </a>
        +
        <a
          href="https://royashbrook.com/agents"
          target="_blank"
          rel="noreferrer"
        >
          ai
        </a>
        <span aria-hidden="true">·</span>
        <a
          href="https://github.com/sponsors/royashbrook"
          target="_blank"
          rel="noreferrer"
          class={styles.sponsor}
        >
          sponsor me
        </a>
      </span>
      {#if view !== "about"}
        <span aria-hidden="true">·</span>
        <span>v{appVersion}</span>
      {/if}
    </footer>
  </section>
</dialog>
