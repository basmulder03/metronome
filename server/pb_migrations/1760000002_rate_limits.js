/// <reference path="../pb_data/types.d.ts" />
// Slow down password guessing and account spam; general API traffic gets a generous ceiling.
migrate(
  (app) => {
    const settings = app.settings();
    settings.rateLimits.enabled = true;
    settings.rateLimits.rules = [
      { label: '*:auth', maxRequests: 10, duration: 60 }, // login/refresh per IP per minute
      { label: 'users:create', maxRequests: 5, duration: 60 }, // registrations
      { label: '/api/', maxRequests: 600, duration: 60 },
    ];
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.rateLimits.enabled = false;
    app.save(settings);
  },
);
