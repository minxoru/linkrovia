export const localeAndTimezoneExamples = [
  { locale: 'en', timezone: 'UTC' },
  { locale: 'ja', timezone: 'Asia/Tokyo' },
  { locale: 'it', timezone: 'Europe/Rome' },
  { locale: 'fr', timezone: 'Europe/Paris' },
  { locale: 'es', timezone: 'America/New_York' },
  { locale: 'zh-CN', timezone: 'Asia/Kolkata' },
  { locale: 'zh-TW', timezone: 'Asia/Kathmandu' },
] as const;

export const daylightSavingExamples = {
  gap: { timezone: 'America/New_York', local: '2026-03-08T02:30' },
  overlap: {
    timezone: 'America/New_York',
    local: '2026-11-01T01:30',
    earlier: '2026-11-01T05:30:00Z',
    later: '2026-11-01T06:30:00Z',
  },
} as const;
