/// <reference path="../pb_data/types.d.ts" />
// The register route replaces direct account creation, so it needs its own limit; invitation lookups are limited too.
migrate(
  (app) => {
    const settings = app.settings();
    const keep = settings.rateLimits.rules.filter((r) => r.label !== 'users:create');
    settings.rateLimits.rules = [
      { label: 'POST /api/metronome/register', maxRequests: 5, duration: 60 },
      { label: 'GET /api/metronome/invite', maxRequests: 30, duration: 60 },
      ...keep,
    ];
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.rateLimits.rules = settings.rateLimits.rules.filter((r) => !r.label.includes('/api/metronome/'));
    app.save(settings);
  },
);
