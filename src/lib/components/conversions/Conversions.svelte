<script lang="ts">
  import { analyticsMessages } from '$lib/components/analytics/messages';
  import type { Locale } from '$lib/i18n/locale';
  import type { loadConversions } from '$lib/server/conversions/admin';
  import {
    conversionMessages,
    manageHelp,
    goalHelp,
    ratePending,
    archivedDates,
    incompleteLinkHistory,
  } from './messages';
  type Props = {
    data: Awaited<ReturnType<typeof loadConversions>> & {
      csrfToken: string;
      locale: Locale;
    };
    form?: { code: string } | null;
  };

  let { data, form }: Props = $props();
  let m = $derived(conversionMessages(data.locale));
  let dateLabels = $derived(analyticsMessages(data.locale));
</script>

{#if data.saved}<p class="notice" role="status">{m.saved}</p>{/if}
{#if form?.code}<p class="notice" role="alert">{m.error}</p>{/if}
{#if !data.isOwner}<p class="notice">{m.readOnly}</p>{/if}
<div class="admin-page">
  <section class="context-panel" aria-labelledby="report">
    <h2 id="report">{m.report}</h2>
    <form method="GET" class="inline">
      <label>
        {dateLabels.from}<input
          class="admin-control"
          type="date"
          name="from"
          value={data.from}
          required
        />
      </label>
      <label>
        {dateLabels.to}<input
          class="admin-control"
          type="date"
          name="to"
          value={data.to}
          required
        />
      </label>
      <button type="submit" class="admin-button admin-button-primary">
        {dateLabels.apply}
      </button>
    </form>
    <p class="muted">{data.from} – {data.to} · {data.reportTimeZone}</p>
    {#if data.filterError}<p role="alert">
        {archivedDates[data.locale][0]}
      </p>{/if}
    {#if data.summary.some((goal) => goal.partialUtcDays)}<p class="muted">
        {archivedDates[data.locale][1]}
      </p>{/if}
    {#if data.summary.some((goal) => goal.incompleteLinkHistory)}<p
        class="muted"
      >
        {incompleteLinkHistory[data.locale]}
      </p>{/if}
    <p class="muted">{m.rateHelp} {ratePending[data.locale]}</p>
    {#if data.summary.length === 0}<p>{m.none}</p>{:else}<div
        class="table-wrap"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">{m.goal}</th><th scope="col">{m.total}</th><th
                scope="col"
              >
                {m.attributed}
              </th><th scope="col">{m.unattributed}</th><th scope="col">
                {m.eligible}
              </th><th scope="col">{m.rate}</th>
            </tr>
          </thead><tbody>
            {#each data.summary as summary (summary.goalId)}<tr>
                <th scope="row">
                  {summary.goalName}{#if summary.archived}
                    · {m.archive}{/if}
                </th><td>
                  {summary?.total.toLocaleString(data.locale) ?? '0'}
                </td><td>
                  {summary?.attributed.toLocaleString(data.locale) ?? '0'}
                </td><td>
                  {summary?.unattributed.toLocaleString(data.locale) ?? '0'}
                </td><td>
                  {summary.incompleteLinkHistory
                    ? '—'
                    : summary.eligibleClicks.toLocaleString(data.locale)}
                </td><td>
                  {summary?.rate == null
                    ? '—'
                    : new Intl.NumberFormat(data.locale, {
                        style: 'percent',
                        maximumFractionDigits: 1,
                      }).format(summary.rate)}
                </td>
              </tr>{/each}
          </tbody>
        </table>
      </div>{/if}
  </section>
  {#if data.isOwner}<section
      class="context-panel"
      aria-labelledby="create-goal"
    >
      <h2 id="create-goal">{m.create}</h2>
      <form method="POST" action="?/create" class="card fields">
        <input type="hidden" name="csrfToken" value={data.csrfToken} /><label>
          {m.name}<input
            class="admin-control"
            name="name"
            required
            maxlength="120"
          />
        </label><label>
          {m.event}<input
            class="admin-control"
            name="eventName"
            required
            maxlength="120"
          />
        </label>{#if !data.linkId}<label>
            {m.link}<select class="admin-control" name="linkId">
              <option value="">
                {m.allLinks}
              </option>{#each data.links as link (link.id)}<option
                  value={link.id}
                >
                  {link.title || `${link.hostname}/${link.slug}`}
                </option>{/each}
            </select>
          </label>{/if}<label>
          {m.window} ({m.hours})<input
            class="admin-control"
            type="number"
            name="window"
            min="1"
            max="720"
            value="24"
            required
          />
        </label><label class="check">
          <input type="checkbox" name="active" value="1" checked />{m.active}
        </label><button type="submit" class="admin-button admin-button-primary">
          {m.create}
        </button>
      </form>
    </section>{/if}
  {#if data.goals.length}<section class="context-panel" aria-labelledby="goals">
      <h2 id="goals">{m.goal}</h2>
      <p class="muted">{goalHelp[data.locale]}</p>
      <div class="goal-list">
        {#each data.goals as goal (goal.id)}<div class="card">
            <h3>{goal.name}</h3>
            {#if data.isOwner && (!data.linkId || goal.linkId !== null)}<form
                method="POST"
                action="?/update"
                class="fields"
              >
                <input
                  type="hidden"
                  name="csrfToken"
                  value={data.csrfToken}
                /><input type="hidden" name="goalId" value={goal.id} /><label>
                  {m.name}<input
                    class="admin-control"
                    name="name"
                    value={goal.name}
                    required
                    maxlength="120"
                  />
                </label><label>
                  {m.event}<input
                    class="admin-control"
                    name="eventName"
                    value={goal.eventName}
                    readonly
                  />
                </label>{#if !data.linkId}<label>
                    {m.link}<input
                      class="admin-control"
                      value={goal.linkId
                        ? data.links.find((link) => link.id === goal.linkId)
                            ?.title ||
                          data.links.find((link) => link.id === goal.linkId)
                            ?.slug ||
                          goal.linkId
                        : m.allLinks}
                      readonly
                    />
                    <input
                      type="hidden"
                      name="linkId"
                      value={goal.linkId ?? ''}
                    />
                  </label>{/if}<label>
                  {m.window} ({m.hours})<input
                    class="admin-control"
                    type="number"
                    name="window"
                    min="1"
                    max="720"
                    value={goal.attributionWindowHours}
                    required
                  />
                </label><label class="check">
                  <input
                    type="checkbox"
                    name="active"
                    value="1"
                    checked={goal.isActive}
                  />{m.active}
                </label><button
                  type="submit"
                  class="admin-button admin-button-primary"
                >
                  {m.save}
                </button>
              </form>
              <form method="POST" action="?/archive">
                <input
                  type="hidden"
                  name="csrfToken"
                  value={data.csrfToken}
                /><input type="hidden" name="goalId" value={goal.id} /><button
                  type="submit"
                  class="admin-button admin-button-danger secondary"
                >
                  {m.archive}
                </button>
              </form>{:else}<p>
                <code>{goal.eventName}</code> · {goal.attributionWindowHours}
                {m.hours} · {goal.isActive ? m.activeLabel : m.inactive}
                {#if data.linkId && goal.linkId === null}
                  · {#if data.isOwner}<a href="/admin/analytics/conversions">
                      {m.allLinks}
                    </a>{:else}{m.allLinks}{/if}
                {/if}
              </p>{/if}
          </div>{/each}
      </div>
    </section>{/if}
  <section class="context-panel" aria-labelledby="tracking">
    <h2 id="tracking">{m.tracking}</h2>
    <p>{m.trackingHelp}</p>
    {#if !data.linkId && data.links.length}<form method="GET" class="inline">
        <label>
          {m.link}<select class="admin-control" name="linkId">
            <option value="">
              {m.select}
            </option>{#each data.links as link (link.id)}<option
                value={link.id}
              >
                {link.title || `${link.hostname}/${link.slug}`}
              </option>{/each}
          </select>
        </label><button type="submit" class="admin-button admin-button-primary">
          {m.select}
        </button>
      </form>{:else if !data.linkId}<p>{m.noLinks}</p>{/if}{#if data.tracking}<p
        class="muted"
      >
        {data.tracking.hostname}/{data.tracking.slug} · {data.tracking.enabled
          ? m.activeLabel
          : m.inactive}
      </p>
      {#if data.isOwner && data.tracking.eligible}<form
          method="POST"
          action="?/tracking"
          class="card"
        >
          <input type="hidden" name="csrfToken" value={data.csrfToken} />
          <label class="check">
            <input
              type="checkbox"
              name="enabled"
              value="1"
              checked={data.tracking.enabled}
            />{m.trackingConsent}
          </label><button
            type="submit"
            class="admin-button admin-button-primary"
          >
            {m.trackingSave}
          </button>
        </form>{/if}{/if}
  </section>
  <section class="context-panel" aria-labelledby="integration">
    <h2 id="integration">{m.integration}</h2>
    <p>{m.integrationHelp}</p>
    <p>{manageHelp[data.locale]}</p>
  </section>
</div>

<style>
  h2 {
    font-size: 1.15rem;
    letter-spacing: -0.025em;
    font-weight: 650;
    margin-bottom: 0.75rem;
  }
  h3 {
    font-weight: 650;
    margin-bottom: 0.75rem;
  }
  p {
    margin: 0.5rem 0;
  }
  .muted {
    color: var(--ui-text-muted);
    font-size: 0.9rem;
  }
  .notice,
  .card {
    padding: 1rem;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-sm);
    background: var(--ui-background);
  }
  .notice {
    margin: 1rem 0;
  }
  .goal-list {
    display: grid;
    gap: 1rem;
  }
  .fields {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.8rem;
  }
  label {
    display: grid;
    gap: 0.3rem;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .check {
    display: flex;
    align-items: start;
    gap: 0.5rem;
    margin: 0.5rem 0;
  }
  .secondary {
    margin-top: 0.75rem;
  }
  .inline {
    display: flex;
    align-items: end;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin: 1rem 0;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    background: var(--ui-surface);
  }
  th,
  td {
    border-bottom: 1px solid var(--ui-border);
    text-align: left;
    padding: 0.7rem;
  }
  th {
    font-weight: 600;
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 3px solid var(--brand-signal);
    outline-offset: 2px;
  }
  @media (max-width: 600px) {
    .fields label:not(.check) {
      flex: 1 1 140px;
    }
    .fields button {
      width: 100%;
    }
  }
</style>
