<script lang="ts">
  import { asset } from '$app/paths';
  import { brand } from '$lib/brand';
  import type { Snippet } from 'svelte';
  import Brand from '$lib/components/Brand.svelte';
  let {
    title,
    description,
    children,
  }: { title: string; description: string; children: Snippet } = $props();
</script>

<main class="auth-shell">
  <aside class="auth-brand">
    <Brand href="/" tone="dark" />
    <div class="brand-art" aria-hidden="true">
      <div class="route-line route-line-one"></div>
      <div class="route-line route-line-two"></div>
      <div class="route-node route-node-start">
        <img src={asset(brand.mark)} alt="" width="48" height="48" />
      </div>
      <div class="route-node route-node-end"></div>
      <div class="route-node route-node-bottom"></div>
    </div>
  </aside>
  <section class="auth-main" aria-labelledby="auth-title">
    <div class="auth-inner">
      <header class="auth-heading">
        <h1 id="auth-title">{title}</h1>
        <p>{description}</p>
      </header>
      <div class="auth-card">{@render children()}</div>
    </div>
  </section>
</main>

<style>
  .auth-shell {
    min-height: 100dvh;
    display: grid;
    grid-template-columns: minmax(16rem, 34%) minmax(0, 1fr);
    background: var(--ui-background);
    color: var(--ui-text);
  }
  .auth-brand {
    position: relative;
    overflow: hidden;
    min-height: 100%;
    padding: clamp(1.5rem, 4vw, 3.5rem);
    background: var(--brand-ink);
    color: var(--brand-on-ink);
  }
  .brand-art {
    position: absolute;
    inset: 25% -10% 15% 12%;
    background: radial-gradient(
      circle at center,
      rgb(45 212 191 / 13%),
      transparent 60%
    );
  }
  .route-line {
    position: absolute;
    left: 24%;
    top: 45%;
    width: 65%;
    height: 1px;
    background: var(--brand-signal);
    transform-origin: left;
    opacity: 0.6;
  }
  .route-line-one {
    transform: rotate(-25deg);
  }
  .route-line-two {
    transform: rotate(27deg);
  }
  .route-node {
    position: absolute;
    display: grid;
    place-items: center;
    border: 1px solid var(--brand-signal);
    border-radius: 50%;
    background: var(--brand-ink);
  }
  .route-node-start {
    left: 15%;
    top: 36%;
    width: 5rem;
    aspect-ratio: 1;
    box-shadow: 0 0 0 1.5rem rgb(45 212 191 / 6%);
  }
  .route-node-start img {
    width: 55%;
    height: auto;
  }
  .route-node-end,
  .route-node-bottom {
    left: 78%;
    width: 1.25rem;
    aspect-ratio: 1;
    background: var(--brand-signal);
    box-shadow: 0 0 0 0.6rem rgb(45 212 191 / 10%);
  }
  .route-node-end {
    top: 18%;
  }
  .route-node-bottom {
    top: 72%;
  }
  .auth-main {
    display: grid;
    align-items: center;
    justify-items: center;
    padding: clamp(2rem, 6vw, 5rem) clamp(1.25rem, 5vw, 4.5rem);
  }
  .auth-inner {
    width: min(100%, 34rem);
  }
  .auth-heading {
    margin-bottom: 2rem;
  }
  h1 {
    font-size: clamp(2rem, 4vw, 3rem);
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.045em;
  }
  .auth-heading p {
    max-width: 31rem;
    margin-top: 0.8rem;
    color: var(--ui-text-muted);
    line-height: 1.65;
  }
  .auth-card {
    padding: clamp(1.25rem, 3vw, 2rem);
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-lg);
    background: var(--ui-surface-raised);
    box-shadow: var(--ui-shadow-raised);
  }
  .auth-card
    :global(input:not([type='hidden'], [type='checkbox'], [type='radio'])) {
    min-height: 3.25rem;
    border: 1px solid var(--ui-control-border);
    border-radius: var(--ui-radius-sm);
    color: var(--ui-text);
    background: var(--ui-surface);
  }
  .auth-card :global(button[type='submit']) {
    min-height: 3.25rem;
    border-radius: var(--ui-radius-sm);
    background: var(--ui-primary);
    color: var(--ui-on-primary);
    padding-inline: 1.35rem;
  }
  .auth-card :global(button[type='submit']:hover:not(:disabled)) {
    background: var(--ui-primary-hover);
  }
  .auth-card :global(details) {
    border-top: 1px solid var(--ui-border);
    padding-top: 1.25rem;
  }
  .auth-card :global(summary) {
    min-height: 44px;
    color: var(--ui-link);
  }
  .auth-card :global([role='alert']) {
    line-height: 1.5;
  }
  @media (max-width: 767px) {
    .auth-shell {
      grid-template-columns: minmax(0, 1fr);
      align-content: start;
    }
    .auth-brand {
      min-height: auto;
      padding: 1.1rem 1.25rem;
    }
    .brand-art {
      display: none;
    }
    .auth-main {
      padding: clamp(2.5rem, 9vw, 4rem) 1.15rem;
    }
  }
</style>
