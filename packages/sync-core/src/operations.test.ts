import { describe, expect, it } from 'vitest';
import {
  appendOperation,
  createDeviceOperationLog,
  materializeOperations,
  mergeOperationLogs,
} from './operations';

describe('operation merge', () => {
  it('converges independent offline field and membership changes in every input order', () => {
    const alpha = createDeviceOperationLog('alpha');
    const beta = createDeviceOperationLog('beta');
    appendOperation(
      alpha,
      {
        kind: 'entity.field.set',
        entityType: 'article',
        entityId: 'article-1',
        field: 'title',
        value: 'Alpha title',
      },
      '2026-09-01T01:00:00.000Z',
    );
    appendOperation(
      beta,
      {
        kind: 'entity.field.set',
        entityType: 'article',
        entityId: 'article-1',
        field: 'favorite',
        value: true,
      },
      '2026-09-01T01:00:00.000Z',
    );
    appendOperation(
      alpha,
      {
        kind: 'membership.set',
        articleId: 'article-1',
        categoryId: 'research',
        present: true,
      },
      '2026-09-01T01:01:00.000Z',
    );
    appendOperation(
      beta,
      {
        kind: 'membership.set',
        articleId: 'article-1',
        categoryId: 'research',
        present: false,
      },
      '2026-09-01T01:01:00.000Z',
    );

    const first = materializeOperations(mergeOperationLogs(alpha.operations, beta.operations));
    const second = materializeOperations(mergeOperationLogs(beta.operations, alpha.operations));
    expect(first).toEqual(second);
    expect(first.articles['article-1']?.values).toEqual({ title: 'Alpha title', favorite: true });
    expect(first.memberships).toEqual([]);
  });

  it('uses device ID as the deterministic tie-breaker', () => {
    const alpha = createDeviceOperationLog('alpha');
    const beta = createDeviceOperationLog('beta');
    const time = '2026-09-01T01:00:00.000Z';
    appendOperation(
      alpha,
      {
        kind: 'entity.field.set',
        entityType: 'article',
        entityId: 'a',
        field: 'title',
        value: 'A',
      },
      time,
    );
    appendOperation(
      beta,
      {
        kind: 'entity.field.set',
        entityType: 'article',
        entityId: 'a',
        field: 'title',
        value: 'B',
      },
      time,
    );
    expect(
      materializeOperations([...beta.operations, ...alpha.operations]).articles.a?.values.title,
    ).toBe('B');
  });

  it('retains tombstones and permits only a later explicit field operation to resurrect', () => {
    const log = createDeviceOperationLog('device');
    appendOperation(
      log,
      {
        kind: 'entity.field.set',
        entityType: 'article',
        entityId: 'a',
        field: 'title',
        value: 'old',
      },
      '2026-09-01T00:00:00.000Z',
    );
    appendOperation(
      log,
      {
        kind: 'entity.delete',
        entityType: 'article',
        entityId: 'a',
      },
      '2026-09-01T01:00:00.000Z',
    );
    expect(materializeOperations(log.operations).articles.a?.deleted).toBe(true);
    appendOperation(
      log,
      {
        kind: 'entity.field.set',
        entityType: 'article',
        entityId: 'a',
        field: 'title',
        value: 'restored',
      },
      '2026-09-01T02:00:00.000Z',
    );
    expect(materializeOperations(log.operations).articles.a).toMatchObject({
      deleted: false,
      values: { title: 'restored' },
    });
  });

  it('preserves both immutable snapshot variants and surfaces a conflict', () => {
    const alpha = createDeviceOperationLog('alpha');
    const beta = createDeviceOperationLog('beta');
    appendOperation(alpha, {
      kind: 'snapshot.add',
      snapshotId: 'snapshot-1',
      articleId: 'article-1',
      snapshot: { blob: 'one' },
    });
    appendOperation(beta, {
      kind: 'snapshot.add',
      snapshotId: 'snapshot-1',
      articleId: 'article-1',
      snapshot: { blob: 'two' },
    });
    const state = materializeOperations([...alpha.operations, ...beta.operations]);
    expect(state.snapshotVariants['snapshot-1']).toHaveLength(2);
    expect(state.conflicts).toHaveLength(1);
  });

  it('rejects an operation ID collision with different content', () => {
    const log = createDeviceOperationLog('device');
    const operation = appendOperation(log, {
      kind: 'entity.field.set',
      entityType: 'article',
      entityId: 'a',
      field: 'title',
      value: 'one',
    });
    expect(() => mergeOperationLogs([operation], [{ ...operation, value: 'two' }])).toThrow(
      /identity collision/u,
    );
  });

  it('rejects identifiers that cannot be represented safely in provider paths', () => {
    expect(() => createDeviceOperationLog('device~ambiguous')).toThrow(/only letters/u);
  });
});
