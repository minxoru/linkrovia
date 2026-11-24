<script lang="ts">
  import { brand } from '$lib/brand';
  import { adminInviteMessages } from '$lib/i18n/admin-invites';
  import { messagesFor } from '$lib/i18n/locale';
  import '../../admin-context.css';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let m = $derived(adminInviteMessages[data.locale]);
  let messages = $derived(messagesFor(data.locale));
  let format = $derived(
    new Intl.DateTimeFormat(data.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: data.timeZone,
    }),
  );
  let copied = $state(false);

  async function copyInvite(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      document.getElementById('invite-url')?.focus();
    }
  }
</script>

<svelte:head><title>{m.title} · {brand.name}</title></svelte:head>
<div class="admin-page">
  <header class="context-header">
    <h1>{m.title}</h1>
    <p>{m.intro}</p>
    {#if data.available}
      <a href="#invite-admin" class="admin-button admin-button-primary">
        {m.invite}
      </a>
    {/if}
  </header>

  <div class="admin-section-stack">
    {#if form?.inviteUrl}
      {@const url = form.inviteUrl}
      <section class="context-panel space-y-3">
        <label for="invite-url" class="block font-medium">{m.link}</label>
        <p id="invite-help" class="text-sm text-muted">{m.share}</p>
        <input
          id="invite-url"
          type="text"
          class="admin-control w-full"
          value={url}
          readonly
          aria-describedby="invite-help"
          onfocus={(event) => event.currentTarget.select()}
        />
        <button
          type="button"
          class="admin-button"
          onclick={() => copyInvite(url)}
        >
          {m.copy}
        </button>
        <span role="status">{copied ? m.copied : ''}</span>
      </section>
    {/if}

    {#if data.available}
      <form
        id="invite-admin"
        method="POST"
        action="?/invite"
        aria-labelledby="invite-admin-heading"
        class="context-panel scroll-mt-24 space-y-3"
      >
        <input type="hidden" name="csrfToken" value={data.csrfToken} />
        <div class="admin-section-header">
          <h2 id="invite-admin-heading">{m.invite}</h2>
        </div>
        <label for="email" class="block font-medium">
          {messages['auth.email']}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autocomplete="off"
          maxlength="254"
          class="admin-control w-full"
        />
        <div class="admin-form-footer">
          {#if form?.code}
            <p role="alert" class="text-negative">
              {form.code === 'duplicate'
                ? m.duplicate
                : messages['error.invalid_input']}
            </p>
          {/if}
          <button type="submit" class="admin-button admin-button-primary">
            {m.invite}
          </button>
        </div>
      </form>
    {:else}
      <p role="alert">{messages['passkey.unavailable']}</p>
    {/if}

    <section class="context-panel space-y-3" aria-labelledby="admin-members">
      <div class="admin-section-header">
        <h2 id="admin-members">{m.admins}</h2>
      </div>
      {#if data.admins.length}
        <ul class="divide-y divide-line rounded-lg border border-line">
          {#each data.admins as admin (admin.id)}
            <li class="flex flex-wrap items-center justify-between gap-3 p-4">
              <p class="min-w-0 break-all">{admin.email}</p>
              {#if admin.disabled_at !== null}
                <span class="text-muted">{m.disabled}</span>
              {:else}
                <form
                  method="POST"
                  action="?/disable"
                  onsubmit={(event) => {
                    if (!window.confirm(m.confirmDisable + '\n' + admin.email))
                      event.preventDefault();
                  }}
                >
                  <input
                    type="hidden"
                    name="csrfToken"
                    value={data.csrfToken}
                  />
                  <input type="hidden" name="id" value={admin.id} />
                  <button
                    type="submit"
                    class="admin-button admin-button-danger"
                    aria-label={m.disable + ' · ' + admin.email}
                  >
                    {m.disable}
                  </button>
                </form>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-muted">{m.noAdmins}</p>
      {/if}
    </section>
    <section class="context-panel space-y-3" aria-labelledby="admin-pending">
      <div class="admin-section-header">
        <h2 id="admin-pending">{m.pending}</h2>
      </div>
      {#if data.invitations.length}
        <ul class="divide-y divide-line rounded-lg border border-line">
          {#each data.invitations as invitation (invitation.id)}
            <li class="flex flex-wrap items-center justify-between gap-3 p-4">
              <div class="min-w-0 break-all">
                <p>{invitation.email}</p>
                <p class="text-sm text-muted">
                  {m.expires}
                  <time
                    datetime={new Date(
                      invitation.expires_at * 1000,
                    ).toISOString()}
                  >
                    {format.format(invitation.expires_at * 1000)}
                  </time>
                </p>
              </div>
              <form method="POST" action="?/revoke">
                <input type="hidden" name="csrfToken" value={data.csrfToken} />
                <input type="hidden" name="id" value={invitation.id} />
                <button
                  type="submit"
                  class="admin-button"
                  aria-label={m.revoke + ' · ' + invitation.email}
                >
                  {m.revoke}
                </button>
              </form>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-muted">{m.noInvites}</p>
      {/if}
    </section>
  </div>
</div>
