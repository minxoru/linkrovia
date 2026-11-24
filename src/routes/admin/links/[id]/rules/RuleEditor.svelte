<script lang="ts">
  import { GripVertical } from '@lucide/svelte';
  import { onMount, tick, untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import type { PageProps, SubmitFunction } from './$types';
  import { ruleMessages } from './messages';

  let { data, form }: Pick<PageProps, 'data' | 'form'> = $props();
  let m = $derived(ruleMessages(data.locale));

  const types = ['os', 'device', 'country', 'region', 'language'] as const;
  type ConditionType = (typeof types)[number];
  type Condition = {
    key: number;
    type: ConditionType;
    value: string;
    operator: 'eq' | 'base_language';
  };
  type Rule = {
    key: number;
    id: string | null;
    priority: number;
    destinationUrl: string;
    active: boolean;
    conditions: Condition[];
  };

  let nextKey = 0;
  function newCondition(type: ConditionType): Condition {
    const value =
      type === 'os' || type === 'device' ? data.options[type][0] : '';
    return { key: ++nextKey, type, operator: 'eq', value };
  }

  let rules = $state<Rule[]>(
    untrack(() =>
      data.rules.map((rule) => ({
        ...rule,
        key: ++nextKey,
        conditions: rule.conditions.map((condition) => ({
          ...condition,
          key: ++nextKey,
        })),
      })),
    ),
  );
  let payload = $derived(
    JSON.stringify(
      rules.map((rule) => ({
        id: rule.id,
        priority: rule.priority,
        destinationUrl: rule.destinationUrl.trim(),
        isActive: rule.active,
        conditions: rule.conditions.map(({ type, operator, value }) => ({
          type,
          operator,
          value: value.trim(),
        })),
      })),
    ),
  );
  const initialPayload = untrack(() => payload);
  let interactive = $state(false);
  let pending = $state(false);
  let dragged = $state<number | null>(null);
  let over = $state<number | null>(null);
  let movedPosition = $state(0);
  let expandedKey = $state<number | null>(null);
  let failure = $derived(form?.code);
  let invalidIndex = $derived(form?.index ?? -1);

  onMount(() => {
    interactive = true;
  });

  const fieldClass = 'admin-control w-full';
  const buttonClass =
    'admin-button disabled:opacity-50 aria-disabled:opacity-50';
  const platforms: Record<string, string> = {
    ios: 'iOS',
    ipados: 'iPadOS',
    android: 'Android',
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
  };
  const hints = { country: 'JP', region: 'JP-13', language: 'ja, en-US' };

  function label(position: number) {
    return m.rule.replace('{position}', String(position));
  }

  async function focus(id: string) {
    await tick();
    document.getElementById(id)?.focus();
  }

  function addRule() {
    const key = ++nextKey;
    const priority = rules.at(-1)?.priority ?? -1;
    if (priority >= Number.MAX_SAFE_INTEGER) {
      rules.forEach((rule, index) => (rule.priority = index));
    }
    rules.push({
      key,
      id: null,
      priority: (rules.at(-1)?.priority ?? -1) + 1,
      destinationUrl: '',
      active: true,
      conditions: [newCondition('os')],
    });
    expandedKey = key;
    void focus(`rule-${key}-url`);
  }

  function removeRule(index: number) {
    rules.splice(index, 1);
    const next = rules[index] ?? rules[index - 1];
    expandedKey = null;
    void focus(next ? `rule-${next.key}-edit` : 'add-rule');
  }

  function addCondition(rule: Rule) {
    const next = types.find(
      (type) => !rule.conditions.some((item) => item.type === type),
    );
    const condition = newCondition(next ?? 'os');
    rule.conditions.push(condition);
    void focus(`condition-${condition.key}-type`);
  }

  function removeCondition(rule: Rule, index: number) {
    rule.conditions.splice(index, 1);
    const next = rule.conditions[index] ?? rule.conditions[index - 1];
    void focus(
      next ? `condition-${next.key}-type` : `rule-${rule.key}-add-condition`,
    );
  }

  function changeType(condition: Condition, type: ConditionType) {
    if (type === condition.type) return;
    const next = newCondition(type);
    condition.type = next.type;
    condition.operator = next.operator;
    condition.value = next.value;
  }

  function moveRule(from: number, to: number, buttonId?: string) {
    if (from === to || from < 0 || to < 0 || to >= rules.length) return;
    const [rule] = rules.splice(from, 1);
    rules.splice(to, 0, rule);
    rules.forEach((item, index) => (item.priority = index));
    movedPosition = to + 1;
    if (buttonId) void focus(buttonId);
  }

  function startDrag(event: DragEvent, key: number) {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', String(key));
    event.dataTransfer.effectAllowed = 'move';
    dragged = key;
  }

  function endDrag() {
    dragged = null;
    over = null;
  }

  function allowDrop(event: DragEvent, key: number) {
    if (dragged === null || dragged === key) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    over = key;
  }

  function dropRule(event: DragEvent, index: number) {
    if (dragged === null) return;
    event.preventDefault();
    moveRule(
      rules.findIndex((rule) => rule.key === dragged),
      index,
    );
    endDrag();
  }

  const submit: SubmitFunction = () => {
    pending = true;
    return async ({ result, update }) => {
      await update({ reset: false });
      pending = false;
      if (result.type === 'failure') {
        if (
          result.data?.code === 'invalid_rule' &&
          typeof result.data.index === 'number'
        ) {
          expandedKey = rules[result.data.index]?.key ?? null;
        }
        void focus('rules-error');
      }
    };
  };
</script>

<form method="POST" use:enhance={submit} class="space-y-4">
  <input type="hidden" name="csrfToken" value={data.csrfToken} />
  <input type="hidden" name="updatedAt" value={data.updatedAt} />
  <input type="hidden" name="rules" value={payload} />

  {#if failure}
    <p
      id="rules-error"
      tabindex="-1"
      role="alert"
      class="text-sm text-negative"
    >
      {failure === 'invalid_rule'
        ? m.invalid_rule.replace('{rule}', label(invalidIndex + 1))
        : m[failure]}
    </p>
    {#if failure === 'stale_link'}
      <a
        href={page.url.pathname}
        data-sveltekit-reload
        class="text-sm underline"
      >
        {m.reload}
      </a>
    {/if}
  {/if}
  <p class="sr-only" aria-live="polite">
    {movedPosition ? m.moved.replace('{position}', String(movedPosition)) : ''}
  </p>

  <fieldset
    class="min-w-0 space-y-4"
    disabled={!interactive || pending || failure === 'stale_link'}
  >
    <div class="flex flex-wrap gap-3">
      <button
        id="add-rule"
        type="button"
        class={buttonClass}
        onclick={addRule}
        disabled={rules.length >= data.limits.maxRules}
      >
        {m.addRule}
      </button>
      <button
        type="submit"
        disabled={payload === initialPayload}
        class="admin-button admin-button-primary disabled:opacity-50"
      >
        {pending ? m.saving : m.save}
      </button>
    </div>

    <dl class="rounded-xl border border-line bg-surface p-4 text-sm">
      <dt class="font-semibold">{m.defaultDestination}</dt>
      <dd class="mt-2 break-all text-muted">
        <code>{data.destinationUrl}</code>
      </dd>
    </dl>

    {#if !rules.length}
      <p class="text-sm text-muted">{m.empty}</p>
    {/if}
    {#each rules as rule, index (rule.key)}
      <fieldset
        class={[
          'min-w-0 space-y-4 rounded-xl border bg-surface p-4',
          over === rule.key ? 'border-primary' : 'border-line',
        ]}
        ondragover={(event) => allowDrop(event, rule.key)}
        ondrop={(event) => dropRule(event, index)}
      >
        <legend class="sr-only">{label(index + 1)}</legend>
        <div class="flex flex-wrap items-start gap-3">
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-page text-sm font-semibold"
          >
            {index + 1}
          </span>
          <div class="min-w-0 flex-1 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold">{label(index + 1)}</span>
              <span class="rounded-full border border-line px-2 py-0.5 text-xs">
                {rule.active ? m.enabled : m.disabled}
              </span>
            </div>
            <div class="flex flex-wrap gap-1.5 text-xs text-muted">
              {#each rule.conditions as condition (condition.key)}
                <span class="rounded-md bg-page px-2 py-1">
                  {m[condition.type]}: {platforms[condition.value] ??
                    (condition.value === 'mobile' ||
                    condition.value === 'tablet' ||
                    condition.value === 'desktop' ||
                    condition.value === 'other'
                      ? m[condition.value]
                      : condition.value || m.noValue)}{condition.type ===
                    'language' && condition.operator === 'base_language'
                    ? ` (${m.base})`
                    : ''}
                </span>
              {/each}
            </div>
            <p class="wrap-anywhere text-sm text-muted">
              {rule.destinationUrl || m.noDestination}
            </p>
          </div>
          <button
            id="rule-{rule.key}-edit"
            type="button"
            class={buttonClass}
            aria-expanded={expandedKey === rule.key}
            aria-controls="rule-{rule.key}-editor"
            onclick={() =>
              (expandedKey = expandedKey === rule.key ? null : rule.key)}
          >
            {expandedKey === rule.key ? m.collapse : m.edit}<span
              class="sr-only"
            >
              {label(index + 1)}
            </span>
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="cursor-grab rounded-md border border-line p-2 text-muted active:cursor-grabbing"
            draggable="true"
            title={m.drag}
            aria-hidden="true"
            ondragstart={(event) => startDrag(event, rule.key)}
            ondragend={endDrag}
          >
            <GripVertical size={18} />
          </span>
          <button
            type="button"
            class={buttonClass}
            id="rule-{rule.key}-up"
            aria-disabled={index === 0}
            onclick={(event) =>
              moveRule(index, index - 1, event.currentTarget.id)}
          >
            {m.moveUp}
          </button>
          <button
            type="button"
            class={buttonClass}
            id="rule-{rule.key}-down"
            aria-disabled={index === rules.length - 1}
            onclick={(event) =>
              moveRule(index, index + 1, event.currentTarget.id)}
          >
            {m.moveDown}
          </button>
        </div>
        {#if expandedKey === rule.key}
          <div
            id="rule-{rule.key}-editor"
            class="space-y-4 border-t border-line pt-4"
          >
            <label class="block space-y-1.5 text-sm font-medium">
              <span>{m.destination}</span>
              <input
                id="rule-{rule.key}-url"
                class={fieldClass}
                type="url"
                bind:value={rule.destinationUrl}
                placeholder="https://example.org/"
                maxlength="8192"
                spellcheck="false"
                required
                aria-describedby={failure === 'invalid_rule' &&
                index === invalidIndex
                  ? 'rules-error'
                  : undefined}
              />
            </label>
            <label class="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" bind:checked={rule.active} />
              {m.enabled}
            </label>
            <div class="space-y-3">
              {#each rule.conditions as condition, conditionIndex (condition.key)}
                <div
                  class="grid items-end gap-2 rounded-lg border border-line p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"
                >
                  <label class="block space-y-1.5 text-sm">
                    <span class="font-medium">{m.type}</span>
                    <select
                      id="condition-{condition.key}-type"
                      class={fieldClass}
                      value={condition.type}
                      onchange={(event) =>
                        changeType(
                          condition,
                          event.currentTarget.value as ConditionType,
                        )}
                    >
                      {#each types as type (type)}
                        <option value={type}>{m[type]}</option>
                      {/each}
                    </select>
                  </label>
                  {#if condition.type === 'language'}
                    <label class="block space-y-1.5 text-sm">
                      <span class="font-medium">{m.languageMatch}</span>
                      <select
                        class={fieldClass}
                        bind:value={condition.operator}
                      >
                        <option value="eq">{m.exact}</option>
                        <option value="base_language">{m.base}</option>
                      </select>
                    </label>
                  {/if}
                  <label class="block space-y-1.5 text-sm">
                    <span class="font-medium">{m.value}</span>
                    {#if condition.type === 'os' || condition.type === 'device'}
                      <select class={fieldClass} bind:value={condition.value}>
                        {#each data.options[condition.type] as option (option)}
                          <option value={option}>
                            {platforms[option] ??
                              m[
                                option as
                                  'mobile' | 'tablet' | 'desktop' | 'other'
                              ]}
                          </option>
                        {/each}
                      </select>
                    {:else}
                      <input
                        class={fieldClass}
                        type="text"
                        bind:value={condition.value}
                        placeholder={hints[condition.type]}
                        maxlength={condition.type === 'country'
                          ? 2
                          : condition.type === 'region'
                            ? 6
                            : 64}
                        spellcheck="false"
                        required
                      />
                    {/if}
                  </label>
                  <button
                    type="button"
                    class={buttonClass}
                    onclick={() => removeCondition(rule, conditionIndex)}
                    disabled={rule.conditions.length === 1}
                  >
                    {m.removeCondition}
                  </button>
                </div>
              {/each}
              <button
                id="rule-{rule.key}-add-condition"
                type="button"
                class={buttonClass}
                onclick={() => addCondition(rule)}
                disabled={rule.conditions.length >= data.limits.maxConditions}
              >
                {m.addCondition}
              </button>
            </div>
            <button
              type="button"
              class={buttonClass}
              onclick={() => removeRule(index)}
            >
              {m.removeRule}
            </button>
          </div>
        {/if}
      </fieldset>
    {/each}
  </fieldset>
</form>
<noscript><p class="text-sm text-muted">{m.javascript}</p></noscript>
