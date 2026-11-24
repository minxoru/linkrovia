<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import type { Locale } from '$lib/i18n/locale';
  import { linkExtra, linkMessages } from '$lib/i18n/links';
  import { interpretLocalDateTime } from '$lib/timezone/timezone';

  type Domain = {
    id: string;
    hostname: string;
    isActive: boolean;
    connectionStatus: string;
  };
  type Link = {
    domainId: string;
    slug: string;
    destinationUrl: string;
    title: string | null;
    isActive: boolean;
    redirectType: number;
    startsAt: number | null;
    expiresAt: number | null;
    tags: string[];
    updatedAt: number;
  };
  let {
    locale,
    csrfToken,
    domains,
    link,
    timeZone,
    error,
    values,
    formAction,
  }: {
    locale: Locale;
    csrfToken: string;
    domains: Domain[];
    link: Link | null;
    timeZone: string;
    error?: string;
    formAction?: string;
    values?: {
      domainId: string;
      slug: string;
      destinationUrl: string;
      title: string;
      status: string;
      active: boolean;
      startsAt: string;
      expiresAt: string;
      tags: string;
      startFold: string;
      expiryFold: string;
      updatedAt: string;
    };
  } = $props();
  let m = $derived(linkMessages(locale));
  let x = $derived(linkExtra(locale));
  let redirectStatus = $derived(
    Number(values?.status ?? link?.redirectType ?? 302),
  );
  let permanent = $derived(redirectStatus === 301 || redirectStatus === 308);
  let startsAt = $derived(
    values?.startsAt ?? localTime(link?.startsAt ?? null),
  );
  let expiresAt = $derived(
    values?.expiresAt ?? localTime(link?.expiresAt ?? null),
  );
  let startFold = $derived(values?.startFold ?? savedFold(link?.startsAt));
  let expiryFold = $derived(values?.expiryFold ?? savedFold(link?.expiresAt));
  let startTime = $derived(interpretLocalDateTime(startsAt, timeZone));
  let expiryTime = $derived(interpretLocalDateTime(expiresAt, timeZone));
  let startUtc = $derived(previewUtc(startTime, startFold));
  let expiryUtc = $derived(previewUtc(expiryTime, expiryFold));
  let utcFormat = $derived(
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'UTC',
      hourCycle: 'h23',
    }),
  );

  function localTime(value: number | null): string {
    if (value === null) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(value * 1000));
    const part = (name: string) =>
      parts.find((p) => p.type === name)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
  }

  function savedFold(value: number | null | undefined): string {
    if (value == null) return '';
    const time = interpretLocalDateTime(localTime(value), timeZone);
    if (time.kind !== 'overlap') return '';
    return time.earlier === value ? 'earlier' : 'later';
  }

  function previewUtc(
    time: ReturnType<typeof interpretLocalDateTime>,
    fold: string,
  ): number | null {
    if (time.kind === 'exact') return time.epochSeconds;
    if (time.kind === 'overlap' && (fold === 'earlier' || fold === 'later')) {
      return time[fold];
    }
    return null;
  }
</script>

{#snippet utcPreview(id: string, value: number | null)}
  <p {id} aria-live="polite" class="text-sm text-muted">
    {#if value !== null}
      {x.utcPreview} ·
      <time datetime={new Date(value * 1000).toISOString()}>
        {utcFormat.format(value * 1000)} UTC
      </time>
    {/if}
  </p>
{/snippet}

<form method="POST" action={formAction} class="context-panel link-form">
  <input type="hidden" name="csrfToken" value={csrfToken} />
  {#if link}<input
      type="hidden"
      name="updatedAt"
      value={values?.updatedAt ?? link.updatedAt}
    />{/if}
  {#if error}<p
      role="alert"
      class="rounded-md border border-negative p-3 text-negative"
    >
      {error === 'conflict'
        ? m.conflict
        : error === 'time_gap'
          ? x.gap
          : error === 'time_overlap'
            ? x.overlap
            : error === 'slug_conflict'
              ? x.slugConflict
              : m.error}
    </p>{/if}
  <div class="space-y-2">
    <label for="destinationUrl" class="block font-medium">
      {m.destination}
    </label><input
      id="destinationUrl"
      name="destinationUrl"
      type="url"
      required
      value={values?.destinationUrl ?? link?.destinationUrl ?? ''}
      class="admin-control w-full"
    />
  </div>
  <div class="address-fields">
    <div class="space-y-2">
      <label for="title" class="block font-medium">{m.title}</label><input
        id="title"
        name="title"
        value={values?.title ?? link?.title ?? ''}
        class="admin-control w-full"
      />
    </div>
    <div class="space-y-2">
      <label for="domainId" class="block font-medium">{m.domain}</label><select
        id="domainId"
        name="domainId"
        required
        class="admin-control w-full"
      >
        {#each domains as domain (domain.id)}<option
            value={domain.id}
            selected={domain.id ===
              (values?.domainId ?? link?.domainId ?? domains[0]?.id)}
          >
            {domain.hostname}{#if !domain.isActive}
              ({m.draft}){/if}
          </option>{/each}
      </select>
    </div>
    <div class="space-y-2">
      <label for="slug" class="block font-medium">{m.slug}</label><input
        id="slug"
        name="slug"
        value={values?.slug ?? link?.slug ?? ''}
        aria-describedby="slug-help"
        class="admin-control w-full"
      />
      <p id="slug-help" class="text-sm text-muted">
        {m.slugHelp}
      </p>
    </div>
  </div>
  <label class="flex items-center gap-2">
    <input
      type="checkbox"
      name="active"
      autocomplete="off"
      checked={values?.active ?? link?.isActive ?? true}
    />{m.enabled}
  </label>
  {#snippet optionalFields()}
    <summary>
      {x.options}
      <ChevronDown size={17} aria-hidden="true" />
    </summary>
    <div class="option-fields">
      <div class="space-y-2">
        <label for="status" class="block font-medium">
          {m.redirect}
        </label><select
          id="status"
          name="status"
          bind:value={redirectStatus}
          aria-describedby={permanent ? 'redirect-cache-warning' : undefined}
          class="admin-control"
        >
          {#each [301, 302, 307, 308] as status (status)}<option value={status}>
              {status}
            </option>{/each}
        </select>
        {#if permanent}<p
            id="redirect-cache-warning"
            role="status"
            class="text-sm text-muted"
          >
            {x.permanentCache}
          </p>{/if}
      </div>
      <fieldset class="schedule-fields">
        <legend class="px-1 font-medium">{m.timezone} {timeZone}</legend>
        <div class="space-y-2">
          <label for="startsAt" class="block font-medium">
            {m.startsAt}
          </label><input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            step="1"
            bind:value={startsAt}
            oninput={() => (startFold = '')}
            aria-describedby="startsAt-utc"
            class="admin-control w-full"
          />
          {#if startTime.kind === 'overlap'}
            <label for="startFold" class="block text-sm">
              {m.startsAt} · {x.fold}
            </label>
            <select
              id="startFold"
              name="startFold"
              bind:value={startFold}
              required
              class="admin-control w-full"
            >
              <option value="">{x.choose}</option>
              <option value="earlier">
                {x.earlier} ({utcFormat.format(startTime.earlier * 1000)} UTC)
              </option>
              <option value="later">
                {x.later} ({utcFormat.format(startTime.later * 1000)} UTC)
              </option>
            </select>
          {/if}
          {@render utcPreview('startsAt-utc', startUtc)}
        </div>
        <div class="space-y-2">
          <label for="expiresAt" class="block font-medium">
            {m.expiresAt}
          </label><input
            id="expiresAt"
            name="expiresAt"
            type="datetime-local"
            step="1"
            bind:value={expiresAt}
            oninput={() => (expiryFold = '')}
            aria-describedby="expiresAt-utc"
            class="admin-control w-full"
          />
          {#if expiryTime.kind === 'overlap'}
            <label for="expiryFold" class="block text-sm">
              {m.expiresAt} · {x.fold}
            </label>
            <select
              id="expiryFold"
              name="expiryFold"
              bind:value={expiryFold}
              required
              class="admin-control w-full"
            >
              <option value="">{x.choose}</option>
              <option value="earlier">
                {x.earlier} ({utcFormat.format(expiryTime.earlier * 1000)} UTC)
              </option>
              <option value="later">
                {x.later} ({utcFormat.format(expiryTime.later * 1000)} UTC)
              </option>
            </select>
          {/if}
          {@render utcPreview('expiresAt-utc', expiryUtc)}
        </div>
      </fieldset>
      <div class="space-y-2">
        <label for="tags" class="block font-medium">{m.tags}</label><input
          id="tags"
          name="tags"
          value={values?.tags ?? link?.tags.join(', ') ?? ''}
          aria-describedby="tags-help"
          class="admin-control w-full"
        />
        <p id="tags-help" class="text-sm text-muted">
          {m.tagsHelp}
        </p>
      </div>
    </div>
  {/snippet}
  {#if error}
    <details class="link-options" open>
      {@render optionalFields()}
    </details>
  {:else}
    <details class="link-options">
      {@render optionalFields()}
    </details>
  {/if}
  <footer class="admin-form-footer">
    <button type="submit" class="admin-button admin-button-primary">
      {m.save}
    </button>
  </footer>
</form>

<style>
  .link-form {
    display: grid;
    gap: clamp(1.15rem, 2.5vw, 1.6rem);
  }
  .address-fields,
  .schedule-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    min-width: 0;
  }
  .address-fields > :first-child {
    grid-column: 1 / -1;
  }
  .link-options {
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-md);
    background: var(--ui-background);
  }
  .link-options summary {
    display: flex;
    min-height: 2.9rem;
    align-items: center;
    justify-content: space-between;
    gap: 0.55rem;
    padding: 0.55rem 0.85rem;
    list-style: none;
    font-weight: 680;
    cursor: pointer;
    color: var(--ui-link);
  }
  .link-options summary::-webkit-details-marker {
    display: none;
  }
  .option-fields {
    display: grid;
    gap: 1rem;
    padding: 1rem 0.85rem;
    border-top: 1px solid var(--ui-border);
  }
  .schedule-fields {
    border: 0;
    padding: 0;
  }
  .schedule-fields legend {
    margin-bottom: 0.55rem;
    padding: 0;
    color: var(--ui-text-muted);
    overflow-wrap: anywhere;
  }
  @media (max-width: 700px) {
    .address-fields,
    .schedule-fields {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
