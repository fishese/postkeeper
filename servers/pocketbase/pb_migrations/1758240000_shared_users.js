/* global migrate */

// Preserve existing accounts while changing the auth collection from the
// PostKeeper-specific name to the server-wide identity collection.
migrate(
  (app) => {
    let legacy;
    try {
      legacy = app.findCollectionByNameOrId('postkeeper_users');
    } catch {
      return;
    }
    let shared;
    try {
      shared = app.findCollectionByNameOrId('users');
    } catch {
      // The shared collection does not exist yet, so the legacy collection can be renamed.
    }
    if (shared) {
      throw new Error(
        'Cannot migrate PostKeeper accounts because a users collection already exists.',
      );
    }
    legacy.name = 'users';
    app.save(legacy);
  },
  () => {
    // Shared identities are not renamed during rollback because another app may
    // already depend on the collection after this migration is applied.
  },
);
