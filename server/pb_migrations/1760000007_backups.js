/// <reference path="../pb_data/types.d.ts" />
// A nightly backup of the whole database (a zip in pb_data/backups), keeping the last 14. They sit on the same disk, so copy them off the
// machine now and then (the admin dashboard, Settings > Backups, can download them).
migrate(
  (app) => {
    const settings = app.settings();
    settings.backups.cron = '30 3 * * *';
    settings.backups.cronMaxKeep = 14;
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.backups.cron = '';
    app.save(settings);
  },
);
