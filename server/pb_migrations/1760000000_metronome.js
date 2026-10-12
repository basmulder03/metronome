/// <reference path="../pb_data/types.d.ts" />
// Per-user storage for the library and playlists. Markup only: there is deliberately no file field,
// so scores (PDFs) can never be uploaded or shared through the server.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const own = 'owner = @request.auth.id';

    const pieces = new Collection({
      type: 'base',
      name: 'pieces',
      listRule: own,
      viewRule: own,
      createRule: "@request.auth.id != '' && @request.body.owner = @request.auth.id",
      updateRule: own + ' && @request.body.owner:isset = false',
      deleteRule: own,
      fields: [
        { type: 'relation', name: 'owner', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: 'text', name: 'clientId', required: true, max: 64 },
        { type: 'text', name: 'title', max: 200 },
        { type: 'json', name: 'markup', maxSize: 1000000 },
        { type: 'number', name: 'updatedAt' },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_pieces_owner_client ON pieces (owner, clientId)'],
    });
    app.save(pieces);

    const playlists = new Collection({
      type: 'base',
      name: 'playlists',
      listRule: own,
      viewRule: own,
      createRule: "@request.auth.id != '' && @request.body.owner = @request.auth.id",
      updateRule: own + ' && @request.body.owner:isset = false',
      deleteRule: own,
      fields: [
        { type: 'relation', name: 'owner', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: 'text', name: 'clientId', required: true, max: 64 },
        { type: 'text', name: 'name', max: 200 },
        { type: 'number', name: 'gap' },
        { type: 'json', name: 'items', maxSize: 100000 },
        { type: 'number', name: 'updatedAt' },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_playlists_owner_client ON playlists (owner, clientId)'],
    });
    app.save(playlists);
  },
  (app) => {
    for (const name of ['playlists', 'pieces']) app.delete(app.findCollectionByNameOrId(name));
  },
);
