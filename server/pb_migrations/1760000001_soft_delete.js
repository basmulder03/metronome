/// <reference path="../pb_data/types.d.ts" />
// Deletions are synced as a flag (not a real delete) so other devices learn about them instead of re-uploading the item.
migrate(
  (app) => {
    for (const name of ['pieces', 'playlists']) {
      const c = app.findCollectionByNameOrId(name);
      c.fields.add(new BoolField({ name: 'deleted' }));
      app.save(c);
    }
  },
  (app) => {
    for (const name of ['pieces', 'playlists']) {
      const c = app.findCollectionByNameOrId(name);
      c.fields.removeByName('deleted');
      app.save(c);
    }
  },
);
