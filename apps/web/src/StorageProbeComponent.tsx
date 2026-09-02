import { useState } from 'react';
import { probeBlobStorage, probeIndexedDb } from './storageProbe';

export function StorageProbe() {
  const [result, setResult] = useState('Not run.');
  async function run() {
    try {
      setResult(`${await probeIndexedDb()} ${await probeBlobStorage()}`);
    } catch (error) {
      setResult(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return (
    <>
      <button onClick={run}>Run storage probe</button>
      <p data-testid="storage-result">{result}</p>
    </>
  );
}
