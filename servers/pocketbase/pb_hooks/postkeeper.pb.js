/* eslint-disable @typescript-eslint/no-require-imports */
/* global routerAdd, require, __hooks, BadRequestError, $apis, NotFoundError, toBytes, ApiError, $security, $filesystem */

const MAX_OBJECT_BYTES = 16 * 1024 * 1024;

routerAdd(
  'GET',
  '/api/postkeeper/v1/objects',
  (e) => {
    const utils = require(`${__hooks}/postkeeper-utils.js`);
    const prefix = e.request.url.query().get('prefix') || '';
    const cursor = e.request.url.query().get('cursor') || '';
    if (prefix.length > 768 || cursor.length > 768)
      throw new BadRequestError('Invalid listing cursor.');
    const owner = e.auth.id;
    const matching = [];
    let scanCursor = cursor;
    while (matching.length <= utils.PAGE_SIZE) {
      const records = e.app.findRecordsByFilter(
        utils.COLLECTION,
        'owner = {:owner} && path > {:cursor}',
        'path',
        250,
        0,
        { owner, cursor: scanCursor },
      );
      if (records.length === 0) break;
      for (const record of records) {
        const path = record.getString('path');
        if (path.startsWith(prefix)) matching.push(record);
        scanCursor = path;
        if (matching.length > utils.PAGE_SIZE) break;
      }
      if (matching.length > utils.PAGE_SIZE || records.length < 250) break;
    }
    const page = matching.slice(0, utils.PAGE_SIZE);
    return e.json(200, {
      objects: page.map(utils.metadata),
      ...(matching.length > utils.PAGE_SIZE
        ? { continuationToken: page[page.length - 1].getString('path') }
        : {}),
    });
  },
  $apis.requireAuth('postkeeper_users'),
);

routerAdd(
  'GET',
  '/api/postkeeper/v1/object',
  (e) => {
    const utils = require(`${__hooks}/postkeeper-utils.js`);
    const path = utils.objectPath(e);
    const record = utils.findObject(e.app, e.auth.id, path);
    if (!record) throw new NotFoundError('Remote object not found.');
    const filename = record.getString('payload');
    let filesystem;
    let reader;
    try {
      filesystem = e.app.newFilesystem();
      reader = filesystem.getReader(`${record.baseFilesPath()}/${filename}`);
      const bytes = toBytes(reader, utils.MAX_OBJECT_BYTES + 1);
      if (bytes.length > utils.MAX_OBJECT_BYTES) {
        throw new ApiError(507, 'Remote object is too large.');
      }
      e.response.header().set('ETag', utils.quotedEtag(record));
      e.response.header().set('Last-Modified', record.getString('updated'));
      e.response.header().set('Cache-Control', 'no-store');
      return e.blob(200, 'application/octet-stream', bytes);
    } finally {
      if (reader) reader.close();
      if (filesystem) filesystem.close();
    }
  },
  $apis.requireAuth('postkeeper_users'),
);

routerAdd(
  'PUT',
  '/api/postkeeper/v1/object',
  (e) => {
    const utils = require(`${__hooks}/postkeeper-utils.js`);
    const path = utils.objectPath(e);
    const owner = e.auth.id;
    const expected = e.request.header.get('If-Match');
    const createOnly = e.request.header.get('If-None-Match') === '*';
    if ((!expected && !createOnly) || (expected && createOnly)) {
      throw new BadRequestError('Exactly one conditional-write header is required.');
    }
    const bytes = toBytes(e.request.body, utils.MAX_OBJECT_BYTES + 1);
    if (bytes.length > utils.MAX_OBJECT_BYTES) {
      throw new ApiError(413, 'Remote object is too large.');
    }

    let result;
    e.app.runInTransaction((tx) => {
      const existing = utils.findObject(tx, owner, path);
      if (existing && createOnly) {
        result = { status: 'existing', object: utils.metadata(existing) };
        return;
      }
      if (!existing && expected) throw new ApiError(412, 'Remote object no longer exists.');
      if (existing && expected !== utils.quotedEtag(existing)) {
        throw new ApiError(412, 'Remote object changed.');
      }
      if (
        utils.currentUsage(tx, owner, existing ? existing.id : '') + bytes.length >
        utils.userQuota()
      ) {
        throw new ApiError(507, 'PostKeeper user quota exceeded.');
      }

      const record = existing || new Record(tx.findCollectionByNameOrId(utils.COLLECTION));
      record.set('owner', owner);
      record.set('path', path);
      record.set('etag', $security.randomString(32));
      record.set('byteLength', bytes.length);
      record.set('payload', $filesystem.fileFromBytes(bytes, 'object.bin'));
      tx.save(record);
      result = { status: existing ? 'updated' : 'created', object: utils.metadata(record) };
    });
    return e.json(result.status === 'created' ? 201 : 200, result);
  },
  $apis.requireAuth('postkeeper_users'),
  $apis.bodyLimit(MAX_OBJECT_BYTES + 1),
);
