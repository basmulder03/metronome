/// <reference path="../pb_data/types.d.ts" />
// Share links can expire (epoch seconds; empty or 0 = never), and know when they were made.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId('shares');
    c.fields.add(new NumberField({ name: 'expires' }));
    c.fields.add(new AutodateField({ name: 'created', onCreate: true }));
    app.save(c);
  },
  (app) => {
    const c = app.findCollectionByNameOrId('shares');
    c.fields.removeByName('expires');
    c.fields.removeByName('created');
    app.save(c);
  },
);
