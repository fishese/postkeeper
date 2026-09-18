/* global migrate, Collection */

migrate(
  (app) => {
    let users;
    try {
      users = app.findCollectionByNameOrId('users');
    } catch {
      users = new Collection({
        type: 'auth',
        name: 'users',
        listRule: 'id = @request.auth.id',
        viewRule: 'id = @request.auth.id',
        createRule: null,
        updateRule: 'id = @request.auth.id',
        deleteRule: null,
        passwordAuth: {
          enabled: true,
          identityFields: ['email'],
        },
      });
      app.save(users);
    }
    users.listRule = 'id = @request.auth.id';
    users.viewRule = 'id = @request.auth.id';
    users.createRule = null;
    users.updateRule = 'id = @request.auth.id';
    users.deleteRule = null;
    app.save(users);

    const objects = new Collection({
      type: 'base',
      name: 'postkeeper_objects',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          type: 'relation',
          name: 'owner',
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { type: 'text', name: 'path', required: true, max: 768 },
        { type: 'text', name: 'etag', required: true, max: 64 },
        { type: 'number', name: 'byteLength', required: true, min: 0 },
        {
          type: 'file',
          name: 'payload',
          required: true,
          maxSelect: 1,
          maxSize: 16 * 1024 * 1024,
          protected: true,
        },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_postkeeper_objects_owner_path ON postkeeper_objects (owner, path)',
      ],
    });
    app.save(objects);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('postkeeper_objects'));
    } catch {
      // Already removed.
    }
    // The shared auth collection may be used by other applications and is not
    // deleted when the PostKeeper storage migration is rolled back.
  },
);
