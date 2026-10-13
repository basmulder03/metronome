/// <reference path="../pb_data/types.d.ts" />
// Editing together: a piece can have editors besides its owner. The owner lets people in through a share link that allows editing; the
// routes in pb_hooks are the only way to change the list (the API rules below forbid it), so nobody can add themselves.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const pieces = app.findCollectionByNameOrId('pieces');
    pieces.fields.add(new RelationField({ name: 'editors', collectionId: users.id, maxSelect: 10, cascadeDelete: false }));
    const member = '@request.auth.blocked = false && (owner = @request.auth.id || editors.id ?= @request.auth.id)';
    pieces.listRule = member;
    pieces.viewRule = member;
    // editors may change the markup and title, but not who owns or edits it, and cannot delete it for everybody
    pieces.updateRule = '@request.auth.blocked = false && @request.body.owner:isset = false && @request.body.editors:isset = false && (owner = @request.auth.id || (editors.id ?= @request.auth.id && @request.body.deleted:isset = false))';
    app.save(pieces);

    const shares = app.findCollectionByNameOrId('shares');
    shares.fields.add(new TextField({ name: 'piece', max: 64 })); // the shared piece's id, when the link lets people edit it
    shares.fields.add(new BoolField({ name: 'editable' }));
    app.save(shares);
  },
  (app) => {
    const pieces = app.findCollectionByNameOrId('pieces');
    pieces.fields.removeByName('editors');
    const own = 'owner = @request.auth.id && @request.auth.blocked = false';
    pieces.listRule = own;
    pieces.viewRule = own;
    pieces.updateRule = own + ' && @request.body.owner:isset = false';
    app.save(pieces);
    const shares = app.findCollectionByNameOrId('shares');
    shares.fields.removeByName('piece');
    shares.fields.removeByName('editable');
    app.save(shares);
  },
);
