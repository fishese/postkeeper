import { StorageProbe } from './StorageProbeComponent';
import { TransferProbe } from './TransferProbeComponent';

export function FeasibilityApp() {
  return (
    <main>
      <p className="eyebrow">Milestone 0 · Foundation and feasibility</p>
      <h1>PostKeeper</h1>
      <p>
        Storage and transfer probes retained for Milestone 0 evidence. The library lives at the
        application root.
      </p>
      <p>
        <a href="#/">Back to library</a>
      </p>
      <section aria-labelledby="storage-title">
        <h2 id="storage-title">Storage feasibility</h2>
        <StorageProbe />
      </section>
      <section aria-labelledby="transfer-title">
        <h2 id="transfer-title">Bounded transfer protocol feasibility</h2>
        <TransferProbe />
      </section>
    </main>
  );
}
