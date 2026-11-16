/** 轻量事件总线，替代 Electron 的 ipcRenderer.on。 */
type Listener = (payload: unknown) => void;

const channels = new Map<string, Set<Listener>>();

export function emit(channel: string, payload: unknown): void {
  for (const listener of [...(channels.get(channel) || [])]) {
    try {
      (listener as (value: unknown) => void)(payload);
    } catch (error) {
      console.error('[mobile] event listener failed', error);
    }
  }
}

export function on(channel: string, callback: Listener): () => void {
  let set = channels.get(channel);
  if (!set) {
    set = new Set();
    channels.set(channel, set);
  }
  set.add(callback);
  return () => { set?.delete(callback); };
}
