type NativePort = {
  postMessage: (message: string) => void;
  onmessage?: (event: { data: string }) => void;
};
declare global {
  interface Window {
    PostKeeperNative?: NativePort;
  }
}
export function isNativeAndroid(): boolean {
  return location.origin === 'https://appassets.androidplatform.net' && !!window.PostKeeperNative;
}
let sequence = 0;
const callbacks = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
export function nativeRequest<T = unknown>(action: string, data: unknown = {}): Promise<T> {
  if (!isNativeAndroid()) return Promise.reject(new Error('Open this action in the Android app.'));
  const port = window.PostKeeperNative!;
  port.onmessage = (event) => {
    const reply = JSON.parse(event.data) as { id: number; result?: unknown; error?: string };
    const callback = callbacks.get(reply.id);
    if (!callback) return;
    callbacks.delete(reply.id);
    if (reply.error) callback.reject(new Error(reply.error));
    else callback.resolve(reply.result);
  };
  return new Promise<T>((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      callbacks.delete(id);
      reject(new Error('Android action timed out. Retry when ready.'));
    }, 300_000);
    callbacks.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value as T);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    port.postMessage(JSON.stringify({ id, action, data }));
  });
}
