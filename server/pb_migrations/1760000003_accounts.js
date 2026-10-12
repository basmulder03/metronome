/// <reference path="../pb_data/types.d.ts" />
// Accounts: an admin role, a block flag, registration mode, and signed single-use invites.
// Accounts can no longer be created straight through the API: the register route in pb_hooks decides who may.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.fields.add(new SelectField({ name: 'role', values: ['user', 'admin'], maxSelect: 1 }));
    users.fields.add(new BoolField({ name: 'blocked' }));
    users.fields.add(new TextField({ name: 'blockReason', max: 300 }));
    users.createRule = null;
    // nobody can change their own role or block state through the API
    users.updateRule = 'id = @request.auth.id && @request.body.role:isset = false && @request.body.blocked:isset = false && @request.body.blockReason:isset = false';
    users.deleteRule = null;
    app.save(users);

    // singleton: registration mode and the secret that signs invites. No API access at all; only the hooks read it.
    const settings = new Collection({
      type: 'base',
      name: 'app_settings',
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { type: 'select', name: 'registration', values: ['invite', 'open'], maxSelect: 1, required: true },
        { type: 'text', name: 'inviteSecret', required: true },
      ],
    });
    app.save(settings);
    const record = new Record(settings);
    record.set('registration', 'invite'); // closed until an admin opens it
    record.set('inviteSecret', $security.randomString(64));
    app.save(record);

    const invites = new Collection({
      type: 'base',
      name: 'invites',
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { type: 'text', name: 'name', required: true, max: 100 },
        { type: 'text', name: 'email', max: 200 },
        { type: 'relation', name: 'createdBy', collectionId: users.id, maxSelect: 1 },
        { type: 'number', name: 'expiresAt', required: true }, // epoch seconds
        { type: 'number', name: 'usedAt' },
        { type: 'relation', name: 'usedBy', collectionId: users.id, maxSelect: 1 },
        { type: 'bool', name: 'revoked' },
      ],
    });
    app.save(invites);

    // a blocked account gets nothing from the data collections even if a token somehow survived
    for (const name of ['pieces', 'playlists']) {
      const c = app.findCollectionByNameOrId(name);
      const own = 'owner = @request.auth.id && @request.auth.blocked = false';
      c.listRule = own;
      c.viewRule = own;
      c.createRule = "@request.auth.id != '' && @request.auth.blocked = false && @request.body.owner = @request.auth.id";
      c.updateRule = own + ' && @request.body.owner:isset = false';
      c.deleteRule = own;
      app.save(c);
    }
  },
  (app) => {
    for (const name of ['invites', 'app_settings']) app.delete(app.findCollectionByNameOrId(name));
    const users = app.findCollectionByNameOrId('users');
    for (const f of ['role', 'blocked', 'blockReason']) users.fields.removeByName(f);
    users.createRule = '';
    users.deleteRule = 'id = @request.auth.id';
    app.save(users);
  },
);
