import { useState } from 'react';
import { transferBoundedPayload } from './transferProbe';

export function TransferProbe() {
  const [result, setResult] = useState('Not run.');
  async function run() {
    try {
      setResult(
        (await transferBoundedPayload('local extension-to-PWA handoff feasibility payload')) ===
          'local extension-to-PWA handoff feasibility payload'
          ? 'Chunk sequencing, hash verification, and acknowledgement boundary passed.'
          : 'Failed.',
      );
    } catch (error) {
      setResult(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return (
    <>
      <button onClick={run}>Run transfer probe</button>
      <p data-testid="transfer-result">{result}</p>
    </>
  );
}
