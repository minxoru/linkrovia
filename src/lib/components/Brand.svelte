<script lang="ts">
  import { asset } from '$app/paths';
  import { brand } from '$lib/brand';

  let {
    href = '/',
    iconOnly = false,
    tone = 'auto',
    class: className = '',
  }: {
    href?: string;
    iconOnly?: boolean;
    tone?: 'auto' | 'dark';
    class?: string;
  } = $props();
</script>

<a
  {href}
  class={`brand-lockup ${className}`}
  class:on-ink={tone === 'dark'}
  aria-label={iconOnly ? brand.name : undefined}
>
  <img src={asset(brand.mark)} width="40" height="40" alt="" />
  {#if !iconOnly}<span>{brand.name}</span>{/if}
</a>

<style>
  .brand-lockup {
    display: inline-flex;
    max-width: 100%;
    align-items: center;
    gap: 0.625rem;
    border-radius: var(--ui-radius-sm);
    color: var(--ui-text);
    font-size: 1.2rem;
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.25;
    text-decoration: none;
  }

  .on-ink {
    color: var(--brand-on-ink);
  }

  .on-ink:focus-visible {
    outline-color: var(--brand-focus-on-ink);
  }

  img {
    flex: none;
    object-fit: contain;
  }
</style>
