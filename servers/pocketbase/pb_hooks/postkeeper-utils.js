/* global $os, BadRequestError, module */

const COLLECTION = 'postkeeper_objects';
const MAX_OBJECT_BYTES = 16 * 1024 * 1024;
const DEFAULT_USER_QUOTA = 2 * 1024 * 1024 * 1024;
const PAGE_SIZE = 100;

function userQuota() {
  const configured = Number($os.getenv('POSTKEEPER_MAX_USER_BYTES'));
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_USER_QUOTA;
}

function objectPath(e) {
  const path = e.request.url.query().get('path') || '';
  if (
    !path ||
    path.length > 768 ||
    path.startsWith('/') ||
    path.includes('..') ||
    path.includes('//') ||
    !/^[A-Za-z0-9._~/-]+$/.test(path)
  ) {
    throw new BadRequestError('Invalid object path.');
  }
  return path;
}

function findObject(app, owner, path) {
  return app.findRecordsByFilter(COLLECTION, 'owner = {:owner} && path = {:path}', '', 1, 0, {
    owner,
    path,
  })[0];
}

function quotedEtag(record) {
  return `"${record.getString('etag')}"`;
}

function metadata(record) {
  return {
    path: record.getString('path'),
    etag: quotedEtag(record),
    byteLength: record.getInt('byteLength'),
    updatedAt: record.getString('updated'),
  };
}

function currentUsage(app, owner, omittedId) {
  return app
    .findRecordsByFilter(COLLECTION, 'owner = {:owner}', '', 0, 0, { owner })
    .reduce((total, record) => {
      return total + (record.id === omittedId ? 0 : record.getInt('byteLength'));
    }, 0);
}

module.exports = {
  COLLECTION,
  MAX_OBJECT_BYTES,
  PAGE_SIZE,
  userQuota,
  objectPath,
  findObject,
  quotedEtag,
  metadata,
  currentUsage,
};
