export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type SyncEntityType = 'article' | 'category';

type OperationBase = {
  schemaVersion: 1;
  operationId: string;
  deviceId: string;
  sequence: number;
  occurredAt: string;
};

export type FieldSetOperation = OperationBase & {
  kind: 'entity.field.set';
  entityType: SyncEntityType;
  entityId: string;
  field: string;
  value: JsonValue;
};

export type EntityDeleteOperation = OperationBase & {
  kind: 'entity.delete';
  entityType: SyncEntityType;
  entityId: string;
};

export type MembershipOperation = OperationBase & {
  kind: 'membership.set';
  articleId: string;
  categoryId: string;
  present: boolean;
};

export type SnapshotAddOperation = OperationBase & {
  kind: 'snapshot.add';
  snapshotId: string;
  articleId: string;
  snapshot: JsonValue;
};

export type SyncOperation =
  FieldSetOperation | EntityDeleteOperation | MembershipOperation | SnapshotAddOperation;

export type NewSyncOperation = SyncOperation extends infer Operation
  ? Operation extends SyncOperation
    ? Omit<Operation, keyof OperationBase>
    : never
  : never;

export type DeviceOperationLog = {
  deviceId: string;
  nextSequence: number;
  operations: SyncOperation[];
};

export type MaterializedEntity = {
  id: string;
  values: Record<string, JsonValue>;
  deleted: boolean;
};

export type SyncConflict = {
  kind: 'immutable-snapshot-mismatch';
  conflictId: string;
  snapshotId: string;
  variants: Array<{ operationId: string; snapshot: JsonValue }>;
};

export type MaterializedSyncState = {
  articles: Record<string, MaterializedEntity>;
  categories: Record<string, MaterializedEntity>;
  memberships: Array<{ articleId: string; categoryId: string }>;
  snapshots: Record<string, { articleId: string; snapshot: JsonValue }>;
  snapshotVariants: Record<string, Array<{ operationId: string; snapshot: JsonValue }>>;
  conflicts: SyncConflict[];
};

function requireIdentifier(value: string, label: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._-]+$/u.test(trimmed)) {
    throw new Error(`${label} must use only letters, numbers, dots, underscores, or hyphens.`);
  }
  return trimmed;
}

export function createDeviceOperationLog(
  deviceId: string = crypto.randomUUID(),
): DeviceOperationLog {
  return { deviceId: requireIdentifier(deviceId, 'Device ID'), nextSequence: 1, operations: [] };
}

export function appendOperation(
  log: DeviceOperationLog,
  operation: NewSyncOperation,
  occurredAt = new Date().toISOString(),
): SyncOperation {
  const previous = log.operations.at(-1);
  if (previous && occurredAt < previous.occurredAt) {
    throw new Error('Operation timestamps must be monotonic within a device log.');
  }
  const sequence = log.nextSequence;
  const complete = {
    ...operation,
    schemaVersion: 1 as const,
    operationId: `${log.deviceId}:${sequence}`,
    deviceId: log.deviceId,
    sequence,
    occurredAt,
  } as SyncOperation;
  assertSyncOperation(complete);
  log.operations.push(complete);
  log.nextSequence += 1;
  return complete;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.values(value as Record<string, unknown>).every(isJsonValue)
  );
}

export function assertSyncOperation(value: unknown): asserts value is SyncOperation {
  if (!value || typeof value !== 'object') throw new Error('Sync operation must be an object.');
  const operation = value as Record<string, unknown>;
  if (operation.schemaVersion !== 1) throw new Error('Unsupported sync operation version.');
  const deviceId = requireIdentifier(String(operation.deviceId ?? ''), 'Device ID');
  if (!Number.isSafeInteger(operation.sequence) || Number(operation.sequence) < 1) {
    throw new Error('Operation sequence must be a positive safe integer.');
  }
  if (operation.operationId !== `${deviceId}:${operation.sequence}`) {
    throw new Error('Operation ID does not match its device and sequence.');
  }
  if (typeof operation.occurredAt !== 'string' || Number.isNaN(Date.parse(operation.occurredAt))) {
    throw new Error('Operation timestamp must be an ISO date.');
  }
  switch (operation.kind) {
    case 'entity.field.set':
      if (operation.entityType !== 'article' && operation.entityType !== 'category') {
        throw new Error('Unknown entity type.');
      }
      requireIdentifier(String(operation.entityId ?? ''), 'Entity ID');
      requireIdentifier(String(operation.field ?? ''), 'Field');
      if (!isJsonValue(operation.value)) throw new Error('Field value must be JSON-compatible.');
      break;
    case 'entity.delete':
      if (operation.entityType !== 'article' && operation.entityType !== 'category') {
        throw new Error('Unknown entity type.');
      }
      requireIdentifier(String(operation.entityId ?? ''), 'Entity ID');
      break;
    case 'membership.set':
      requireIdentifier(String(operation.articleId ?? ''), 'Article ID');
      requireIdentifier(String(operation.categoryId ?? ''), 'Category ID');
      if (typeof operation.present !== 'boolean')
        throw new Error('Membership state must be boolean.');
      break;
    case 'snapshot.add':
      requireIdentifier(String(operation.snapshotId ?? ''), 'Snapshot ID');
      requireIdentifier(String(operation.articleId ?? ''), 'Article ID');
      if (!isJsonValue(operation.snapshot)) throw new Error('Snapshot must be JSON-compatible.');
      break;
    default:
      throw new Error('Unknown sync operation kind.');
  }
}

export function compareOperations(left: SyncOperation, right: SyncOperation): number {
  return (
    left.occurredAt.localeCompare(right.occurredAt) ||
    left.deviceId.localeCompare(right.deviceId) ||
    left.sequence - right.sequence
  );
}

export function mergeOperationLogs(
  ...logs: ReadonlyArray<readonly SyncOperation[]>
): SyncOperation[] {
  const byId = new Map<string, SyncOperation>();
  for (const operation of logs.flat()) {
    assertSyncOperation(operation);
    const previous = byId.get(operation.operationId);
    if (previous && canonicalJson(previous) !== canonicalJson(operation)) {
      throw new Error(`Operation identity collision: ${operation.operationId}`);
    }
    byId.set(operation.operationId, operation);
  }
  return [...byId.values()].sort(compareOperations);
}

export function canonicalJson(value: JsonValue | SyncOperation): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item as JsonValue)}`)
    .join(',')}}`;
}

export function materializeOperations(operations: readonly SyncOperation[]): MaterializedSyncState {
  type Register = { operation: SyncOperation; value: JsonValue };
  const fields = new Map<string, Map<string, Register>>();
  const tombstones = new Map<string, SyncOperation>();
  const memberships = new Map<string, { operation: MembershipOperation; present: boolean }>();
  const snapshots = new Map<string, SnapshotAddOperation[]>();

  for (const operation of mergeOperationLogs(operations)) {
    if (operation.kind === 'entity.field.set') {
      const key = `${operation.entityType}:${operation.entityId}`;
      const entityFields = fields.get(key) ?? new Map<string, Register>();
      const current = entityFields.get(operation.field);
      if (!current || compareOperations(current.operation, operation) < 0) {
        entityFields.set(operation.field, { operation, value: operation.value });
      }
      fields.set(key, entityFields);
    } else if (operation.kind === 'entity.delete') {
      const key = `${operation.entityType}:${operation.entityId}`;
      const current = tombstones.get(key);
      if (!current || compareOperations(current, operation) < 0) tombstones.set(key, operation);
    } else if (operation.kind === 'membership.set') {
      const key = `${operation.articleId}:${operation.categoryId}`;
      const current = memberships.get(key);
      if (!current || compareOperations(current.operation, operation) < 0) {
        memberships.set(key, { operation, present: operation.present });
      }
    } else {
      const variants = snapshots.get(operation.snapshotId) ?? [];
      if (
        !variants.some(
          (variant) => canonicalJson(variant.snapshot) === canonicalJson(operation.snapshot),
        )
      ) {
        variants.push(operation);
      }
      snapshots.set(operation.snapshotId, variants);
    }
  }

  const articles: Record<string, MaterializedEntity> = {};
  const categories: Record<string, MaterializedEntity> = {};
  for (const key of new Set([...fields.keys(), ...tombstones.keys()])) {
    const separator = key.indexOf(':');
    const entityType = key.slice(0, separator) as SyncEntityType;
    const id = key.slice(separator + 1);
    const registers = fields.get(key) ?? new Map<string, Register>();
    const tombstone = tombstones.get(key);
    const values = Object.fromEntries(
      [...registers].map(([field, register]) => [field, register.value]),
    );
    const newestField = [...registers.values()]
      .map((register) => register.operation)
      .sort(compareOperations)
      .at(-1);
    const deleted = Boolean(
      tombstone && (!newestField || compareOperations(newestField, tombstone) <= 0),
    );
    (entityType === 'article' ? articles : categories)[id] = { id, values, deleted };
  }

  const selectedSnapshots: MaterializedSyncState['snapshots'] = {};
  const snapshotVariants: MaterializedSyncState['snapshotVariants'] = {};
  const conflicts: SyncConflict[] = [];
  for (const [id, variants] of snapshots) {
    const sorted = [...variants].sort(compareOperations);
    const selected = sorted[0];
    if (!selected) continue;
    selectedSnapshots[id] = { articleId: selected.articleId, snapshot: selected.snapshot };
    snapshotVariants[id] = sorted.map((variant) => ({
      operationId: variant.operationId,
      snapshot: variant.snapshot,
    }));
    if (sorted.length > 1) {
      conflicts.push({
        kind: 'immutable-snapshot-mismatch',
        conflictId: `snapshot:${id}`,
        snapshotId: id,
        variants: snapshotVariants[id] ?? [],
      });
    }
  }

  return {
    articles,
    categories,
    memberships: [...memberships.values()]
      .filter((membership) => membership.present)
      .map(({ operation }) => ({
        articleId: operation.articleId,
        categoryId: operation.categoryId,
      }))
      .sort(
        (left, right) =>
          left.articleId.localeCompare(right.articleId) ||
          left.categoryId.localeCompare(right.categoryId),
      ),
    snapshots: selectedSnapshots,
    snapshotVariants,
    conflicts: conflicts.sort((left, right) => left.conflictId.localeCompare(right.conflictId)),
  };
}
