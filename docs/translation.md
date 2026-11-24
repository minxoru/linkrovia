# Translation maintenance

The admin interface currently ships in English (`en`), Japanese (`ja`), Simplified Chinese (`zh-CN`), Traditional Chinese (`zh-TW`), Spanish (`es`), Italian (`it`), and French (`fr`). English is the fallback catalog. Keep all seven locales aligned when changing user-visible text.

## Add or change a message

1. Find the owning feature's message source. The shared catalog is in `messages/{locale}.json`; feature-specific typed dictionaries live near their component, for example in `src/routes/admin/links/messages.ts` or `src/lib/components/analytics/messages.ts`.
2. Write the English source string and update the matching entry for every locale. Preserve the meaning and intent instead of translating word for word. Keep product and provider names as proper names.
3. Preserve interpolation tokens, HTML entities, and keyboard or screen-reader context. Do not translate API fields, URL paths, scopes, status codes, database values, or identifiers that users must copy exactly.
4. Use the existing `Locale` type and `satisfies Record<Locale, ...>` pattern for typed feature dictionaries. Do not add a locale-specific fallback that hides a missing translation.
5. Format and run the repository checks before submitting the change.

`messagesFor` resolves missing catalog entries to English at runtime. This is a safety fallback, not a reason to leave a locale incomplete. Locale selection resolves a user's saved preference first, then the language cookie, browser language, and English. Regional browser tags such as `fr-CA` resolve to the supported base language `fr`; Simplified and Traditional Chinese remain separate catalogs.

## Writing accessible UI text

- Give buttons and controls labels that describe their action. Icon-only controls need an accessible name.
- Keep validation and recovery messages specific enough to explain what the user can try next. Use the existing localized error messages instead of rendering raw exception text.
- Keep units and dates localizable. Use `Intl` formatting with the effective locale and time zone; do not build localized dates by concatenating translated fragments.
- Include visible labels or screen-reader-only labels for form controls. Do not rely on color or an icon alone to communicate status.
- Keep text concise enough for narrow screens and allow translated labels to wrap.

## Verify catalog changes

Use the pinned Node.js and npm versions from `.node-version` and `package.json`. Run the same checks used by CI:

```sh
npm run check
npm run lint
npm test
npm run build
npm run test:e2e
```

When a change affects the language picker or locale resolution, also verify saved preferences and representative browser language tags. For timezone-aware dates, verify the formatted output in at least one locale with a non-UTC time zone. Cloudflare provider behavior requires a separate deployment check; local translation tests do not verify it.
