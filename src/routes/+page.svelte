<script lang="ts">
  import { asset } from '$app/paths';
  import ChartNoAxesColumnIncreasing from '@lucide/svelte/icons/chart-no-axes-column-increasing';
  import ArrowDownRight from '@lucide/svelte/icons/arrow-down-right';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import Globe2 from '@lucide/svelte/icons/globe-2';
  import Smartphone from '@lucide/svelte/icons/smartphone';
  import Link2 from '@lucide/svelte/icons/link-2';
  import Route from '@lucide/svelte/icons/route';
  import { brand } from '$lib/brand';
  import Brand from '$lib/components/Brand.svelte';
  import { locales, localeNames, messagesFor } from '$lib/i18n/locale';
  import { landingCopy } from '$lib/i18n/landing';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let messages = $derived(messagesFor(data.locale));
  let copy = $derived(landingCopy[data.locale]);
  let socialImage = $derived(
    new URL(asset(brand.socialImage), data.origin).href,
  );
  let features = $derived([
    { icon: Link2, title: copy.features[0], detail: copy.features[1] },
    { icon: Route, title: copy.features[2], detail: copy.features[3] },
    {
      icon: ChartNoAxesColumnIncreasing,
      title: copy.features[4],
      detail: copy.features[5],
    },
  ]);
</script>

<svelte:head>
  <title>{brand.name}</title>
  <meta name="description" content={messages['home.description']} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={brand.name} />
  <meta property="og:title" content={brand.name} />
  <meta property="og:description" content={messages['home.description']} />
  <meta property="og:image" content={socialImage} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={brand.name} />
</svelte:head>

<main class="landing">
  <header class="landing-bar landing-inner">
    <Brand />
    <a href={brand.repository} class="landing-source">
      GitHub <ArrowUpRight size={15} aria-hidden="true" />
    </a>
  </header>

  <div class="hero-wrap">
    <section class="hero landing-inner">
      <div class="hero-copy">
        <p class="hero-kicker">LINKROVIA / OPEN SOURCE</p>
        <h1>{copy.headline[0]} <span>{copy.headline[1]}</span></h1>
        <p class="description">{messages['home.description']}</p>
        {#if data.canSignIn}
          <a
            class="landing-action"
            href={data.initialized ? '/login' : '/setup'}
          >
            {data.initialized
              ? messages['login.title']
              : messages['setup.title']}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        {/if}
      </div>
      <figure class="route-preview">
        <div class="route-map" aria-hidden="true">
          <div class="route-input">
            <img src={asset(brand.mark)} alt="" width="30" height="30" />
            <span class="route-name">go.example.org<span>/launch</span></span>
          </div>
          <div class="route-targets">
            <div class="route-target">
              <Globe2 size={16} />
              <span>example.org<span>/launch</span></span>
              <ArrowUpRight size={13} />
            </div>
            <div class="route-target route-target-accent">
              <Smartphone size={16} />
              <span>example.org<span>/app</span></span>
              <ArrowUpRight size={13} />
            </div>
          </div>
        </div>
        <div class="analytics-example">
          <div class="example-bars" aria-hidden="true">
            {#each [26, 38, 31, 55, 44, 72, 91, 60, 76, 83, 70, 94] as height (height)}
              <span style:block-size={`${height}%`}></span>
            {/each}
          </div>
        </div>
        <figcaption>{copy.example}</figcaption>
      </figure>
    </section>
  </div>

  <div class="landing-content">
    <div class="landing-inner">
      <div class="features">
        {#each features as feature, index (feature.title)}
          <article>
            <span class="feature-number">0{index + 1}</span>
            <div class="feature-icon">
              <feature.icon size={20} aria-hidden="true" />
            </div>
            <h2>{feature.title}</h2>
            <p>{feature.detail}</p>
          </article>
        {/each}
      </div>
      <section class="ownership">
        <div>
          <h2>{copy.ownership[0]}</h2>
          <p>{copy.ownership[1].replaceAll('Linkrovia', () => brand.name)}</p>
        </div>
        <a
          class="guide-link"
          href={brand.repository + '/blob/main/docs/deployment.md'}
        >
          {copy.guide}
          <ArrowDownRight size={16} aria-hidden="true" />
        </a>
      </section>
    </div>
  </div>

  <div class="footer-wrap landing-inner">
    <form method="POST" class="landing-footer">
      <div>
        <label for="locale">{messages['language.label']}</label>
        <select id="locale" name="locale">
          {#each locales as locale (locale)}<option
              value={locale}
              lang={locale}
              selected={locale === data.locale}
            >
              {localeNames[locale]}
            </option>{/each}
        </select>
      </div>
      <button type="submit">{messages['language.save']}</button>
      {#if form?.invalidLocale}<p role="alert">
          {messages['language.invalid']}
        </p>{/if}
    </form>
    <footer class="site-footer">
      <p>{copy.independent}</p>
      <a href={brand.repository + '/blob/main/LICENSE'}>MIT</a>
    </footer>
  </div>
</main>

<style>
  .landing {
    min-height: 100dvh;
    background: var(--ui-background);
    color: var(--ui-text);
  }
  .landing-inner {
    width: min(100%, 82rem);
    margin-inline: auto;
    padding-inline: clamp(1rem, 5vw, 4rem);
  }
  .landing-bar {
    min-height: 76px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .landing-source,
  .guide-link {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.6rem 0;
    color: var(--ui-text);
    font-size: 0.875rem;
    font-weight: 650;
    text-decoration: none;
  }
  .landing-source:hover,
  .guide-link:hover {
    color: var(--ui-link);
  }
  .hero-kicker {
    margin-bottom: 1.5rem;
    color: var(--ui-link);
    font-family: var(--ui-mono);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
  }
  .hero-wrap {
    overflow: hidden;
    border-block: 1px solid var(--ui-border);
    background: radial-gradient(
      ellipse at 83% 31%,
      var(--ui-accent-surface),
      transparent 60%
    );
  }
  .hero {
    min-height: 39rem;
    display: grid;
    grid-template-columns: minmax(0, 1.02fr) minmax(0, 1fr);
    align-items: center;
    gap: clamp(2.25rem, 5vw, 5rem);
    padding-block: clamp(3.25rem, 8vw, 7.5rem);
  }
  h1 {
    color: var(--ui-text);
    font-size: clamp(2.8rem, 5.25vw, 5rem);
    font-weight: 710;
    letter-spacing: -0.06em;
    line-height: 1.04;
    overflow-wrap: anywhere;
  }
  h1 span {
    display: block;
    color: var(--ui-link);
  }
  .description {
    max-width: 34rem;
    margin-top: 1.45rem;
    color: var(--ui-text-muted);
    font-size: clamp(1rem, 1.15vw, 1.125rem);
    line-height: 1.7;
  }
  .landing-action {
    display: inline-flex;
    align-items: center;
    gap: 1.2rem;
    min-height: 48px;
    margin-top: 1.85rem;
    padding: 0.7rem 1.1rem;
    border-radius: var(--ui-radius-sm);
    background: var(--ui-primary);
    color: var(--ui-on-primary);
    font-weight: 680;
    text-decoration: none;
    transition: background 150ms ease;
  }
  .landing-action:hover {
    background: var(--ui-primary-hover);
  }
  .route-preview {
    position: relative;
    min-width: 0;
    isolation: isolate;
    overflow: hidden;
    border: 1px solid var(--brand-ink-border);
    border-radius: var(--ui-radius-lg);
    transform: rotate(-2deg);
    background: var(--brand-ink);
    color: var(--brand-on-ink);
    box-shadow: var(--ui-shadow);
  }
  .route-map {
    display: grid;
    position: relative;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 2.75rem;
    align-items: center;
    padding: 2.25rem 1.4rem;
    background:
      radial-gradient(
        circle at 42% 29%,
        rgb(45 212 191 / 11%),
        transparent 58%
      ),
      radial-gradient(circle, rgb(255 255 255 / 18%) 1px, transparent 1.2px) 0
        0 / 18px 18px;
  }
  .route-input,
  .route-target {
    z-index: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.48rem;
    padding: 0.65rem;
    border-radius: var(--ui-radius-sm);
    border: 1px solid var(--brand-ink-border);
    background: var(--brand-ink-panel);
  }
  .route-input {
    position: relative;
  }
  .route-input::after {
    content: '';
    position: absolute;
    inset-inline: 100% -2.8rem;
    inset-block-start: 50%;
    border-top: 1px solid var(--brand-signal);
  }
  .route-input img {
    flex: none;
    border-radius: 7px;
  }
  .route-targets {
    display: grid;
    position: relative;
    gap: 1.15rem;
  }
  .route-targets::before {
    content: '';
    position: absolute;
    inset: 20px 100% 20px auto;
    width: 1.45rem;
    border-block: 1px solid var(--brand-signal);
    border-inline-start: 1px solid var(--brand-signal);
    border-radius: 10px 0 0 10px;
  }
  .route-target {
    color: var(--brand-muted-on-ink);
  }
  .route-target-accent {
    color: var(--brand-signal);
  }
  .route-name,
  .route-target span {
    min-width: 0;
    flex: 1;
    color: var(--brand-on-ink);
    font-family: var(--ui-mono);
    font-size: clamp(0.55rem, 0.92vw, 0.74rem);
    overflow-wrap: anywhere;
  }
  .route-name span,
  .route-target span > span {
    color: var(--brand-muted-on-ink);
  }
  .analytics-example {
    padding: 0.8rem 1.4rem 0.65rem;
    border-top: 1px solid var(--brand-ink-border);
  }
  figcaption {
    padding: 0 1.4rem 0.95rem;
    font-size: 0.8rem;
    font-weight: 580;
    color: var(--brand-muted-on-ink);
  }
  .example-bars {
    display: grid;
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
    align-items: end;
    gap: 4%;
    height: 6.6rem;
    background: repeating-linear-gradient(
      to top,
      var(--brand-ink-border) 0 1px,
      transparent 1px 25%
    );
  }
  .example-bars span {
    background: linear-gradient(
      180deg,
      var(--brand-signal),
      var(--brand-route)
    );
    border-radius: 4px 4px 0 0;
  }
  .landing-content {
    background-color: var(--ui-background);
  }
  .features {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-block: clamp(2.5rem, 5.5vw, 4.7rem);
    border-block: 1px solid var(--ui-border);
  }
  .features article {
    display: grid;
    align-content: start;
    padding: 1.75rem clamp(1rem, 2vw, 2rem) 2rem;
  }
  .feature-number {
    margin-bottom: 2rem;
    color: var(--ui-text-muted);
    font-family: var(--ui-mono);
    font-size: 0.75rem;
  }
  .features article:first-child {
    padding-inline-start: 0;
  }
  .features article + article {
    border-inline-start: 1px solid var(--ui-border);
  }
  .feature-icon {
    color: var(--ui-link);
    margin-bottom: 0.8rem;
  }
  .features h2 {
    font-size: 1.08rem;
    font-weight: 680;
  }
  .features p,
  .ownership p {
    margin-top: 0.35rem;
    color: var(--ui-text-muted);
    font-size: 0.95rem;
    line-height: 1.65;
  }
  .ownership {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1.15rem;
    margin-bottom: clamp(2.5rem, 5.5vw, 4rem);
  }
  .ownership h2 {
    font-size: clamp(1.65rem, 3vw, 2.35rem);
    font-weight: 700;
    letter-spacing: -0.045em;
  }
  .ownership p {
    max-width: 40rem;
  }
  .guide-link {
    color: var(--ui-link);
    flex: none;
  }
  .footer-wrap {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 1.3rem;
    min-height: 5.2rem;
    border-top: 1px solid var(--ui-border);
    padding-block: 1rem;
  }
  .landing-footer,
  .site-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.65rem;
    color: var(--ui-text-muted);
    font-size: 0.8rem;
  }
  .landing-footer label {
    display: block;
    margin-bottom: 0.25rem;
  }
  .landing-footer select,
  .landing-footer button {
    border: 1px solid var(--ui-control-border);
    border-radius: var(--ui-radius-sm);
    background: var(--ui-surface);
    color: var(--ui-text);
    padding-inline: 0.65rem;
    min-height: 44px;
  }
  .site-footer a {
    color: var(--ui-link);
    text-decoration: underline;
  }

  @media (max-width: 800px) {
    .hero {
      grid-template-columns: minmax(0, 1fr);
      min-height: 0;
    }
    .route-preview {
      width: min(100%, 34rem);
    }
    .route-name,
    .route-target span {
      font-size: 0.7rem;
    }
  }
  @media (max-width: 540px) {
    .route-map {
      padding-inline: 0.75rem;
      gap: 1.5rem;
    }
    .route-input,
    .route-target {
      padding: 0.45rem;
    }
    .route-input::after {
      inset-inline-end: -1.55rem;
    }
    .route-targets::before {
      width: 0.75rem;
    }
    .route-name,
    .route-target span {
      font-size: 0.625rem;
    }
    .features {
      grid-template-columns: minmax(0, 1fr);
    }
    .features article {
      padding-inline: 0;
    }
    .features article + article {
      border-inline-start: 0;
      border-top: 1px solid var(--ui-border);
    }
    .ownership {
      flex-direction: column;
      align-items: start;
    }
  }
</style>
