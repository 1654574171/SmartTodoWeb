import type { AppState, Settings, Todo } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const STATE_KEY = 'smarttodo:state';
const SYNC_KEY = 'smarttodo:sync';
const DEVICE_KEY = 'smarttodo:device';

export interface MobileSyncData {
  config: {
    email: string;
    remoteDir: string;
    autoSync: boolean;
    intervalMin: number;
  } | null;
  password: string;
  lastSyncAt: string | null;
  dirty: boolean;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (_) {
    return fallback;
  }
}

export function loadState(): AppState {
  const raw = read<Partial<AppState>>(STATE_KEY, {});
  return {
    todos: Array.isArray(raw.todos) ? raw.todos : [],
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
  };
}

export function saveTodos(todos: Todo[]): void {
  const state = loadState();
  state.todos = todos;
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export function saveSettings(settings: Settings): Settings {
  const state = loadState();
  state.settings = settings;
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
  return settings;
}

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    const globalCrypto = globalThis.crypto;
    id = globalCrypto && typeof globalCrypto.randomUUID === 'function'
      ? globalCrypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function loadSync(): MobileSyncData {
  return read<MobileSyncData>(SYNC_KEY, {
    config: null, password: '', lastSyncAt: null, dirty: true,
  });
}

export function saveSync(data: MobileSyncData): void {
  localStorage.setItem(SYNC_KEY, JSON.stringify(data));
}
