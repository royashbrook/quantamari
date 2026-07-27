<script lang="ts">
  import { tick } from "svelte";
  import styles from "./game-menu.module.css";

  type MenuView = "main" | "about" | "reset";

  type GameMenuProps = {
    open: boolean;
    started: boolean;
    sound: boolean;
    appVersion: string;
    buildLabel: string;
    onClose: () => void;
    onOpenGuide: () => void;
    onOpenAtlas: () => void;
    onToggleSound: () => void;
    onReset: () => boolean;
  };

  let {
    open,
    started,
    sound,
    appVersion,
    buildLabel,
    onClose,
    onOpenGuide,
    onOpenAtlas,
    onToggleSound,
    onReset,
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
          <button type="button" onclick={onToggleSound}>
            <span class={styles.icon} aria-hidden="true">{sound ? "♪" : "×"}</span>
            <span>
              <b>{sound ? "Mute sound" : "Turn on sound"}</b>
              <small>{sound ? "Quiet the tiny universe" : "Bring back the pings"}</small>
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
          <button type="button" onclick={() => (view = "about")}>
            <span class={styles.icon} aria-hidden="true">?</span>
            <span>
              <b>About Quarkatamari</b>
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
            <h3>About Quarkatamari</h3>
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
                  href="https://github.com/royashbrook/quarkatamari"
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
            Your collected things, scale layers, position, and settings will be
            removed from this browser. The game itself stays installed.
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
      <span>Made with <b>♥</b> by Roy + AI</span>
      <span aria-hidden="true">·</span>
      <span>v{appVersion}</span>
    </footer>
  </section>
</dialog>
