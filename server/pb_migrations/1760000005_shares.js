/// <reference path="../pb_data/types.d.ts" />
// Short share links: the compressed markup (never a PDF) is kept here under a short code, so the link is just the code.
// No API access at all; the two routes in pb_hooks are the only way in. Anyone with the code can read it, so a code is a key.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const shares = new Collection({
      type: 'base',
      name: 'shares',
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { type: 'text', name: 'code', required: true, max: 16 },
        { type: 'relation', name: 'owner', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: 'select', name: 'kind', values: ['piece', 'playlist'], maxSelect: 1, required: true },
        { type: 'text', name: 'title', max: 200 },
        { type: 'text', name: 'data', required: true, max: 600000 },
        { type: 'text', name: 'hash', required: true, max: 64 },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_shares_code ON shares (code)',
        'CREATE INDEX idx_shares_owner_hash ON shares (owner, hash)',
      ],
    });
    app.save(shares);

    const settings = app.settings();
    settings.rateLimits.rules = [
      { label: 'POST /api/metronome/share', maxRequests: 30, duration: 60 },
      { label: 'GET /api/metronome/share', maxRequests: 60, duration: 60 },
      ...settings.rateLimits.rules,
    ];
    app.save(settings);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('shares'));
    const settings = app.settings();
    settings.rateLimits.rules = settings.rateLimits.rules.filter((r) => !r.label.includes('/api/metronome/share'));
    app.save(settings);
  },
);
