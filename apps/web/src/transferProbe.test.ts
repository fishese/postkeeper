import { describe, expect, it } from 'vitest';
import { transferBoundedPayload } from './transferProbe';

describe('bounded transfer protocol', () => {
  it('reassembles chunked data after hash checks', async () => {
    await expect(transferBoundedPayload('a fixture payload', 3)).resolves.toBe('a fixture payload');
  });
});
