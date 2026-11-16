import type {
  AiItem,
  AiOrganizeResult,
  AppState,
  Settings,
  SyncConfig,
  SyncConfigInput,
  SyncStatus,
  Todo,
} from './types';

export interface Events {
  'todos:updated': Todo[];
  'settings:updated': Settings;
  'sync:status': SyncStatus;
  'notes:changed': string[];
  'editor:open': string | null;
  'widget:quick-add': string[];
  'reminder:due': Todo;
  'app:back': null;
  toast: string;
}

export interface SmartTodoApi {
  getState(): Promise<AppState>;
  saveTodos(todos: Todo[]): Promise<{ ok: boolean }>;
  saveSettings(settings: Settings): Promise<Settings>;
  getOpenNotes(): Promise<string[]>;
  openNote(id: string): Promise<{ ok: boolean; message?: string }>;
  closeNote(id: string): Promise<{ ok: boolean }>;
  openEditor(id: string | null): Promise<{ ok: boolean }>;
  hideWindow(): Promise<{ ok: boolean }>;
  minimizeWindow(): Promise<{ ok: boolean }>;

  syncGetConfig(): Promise<SyncConfig>;
  syncGetStatus(): Promise<SyncStatus>;
  syncConfigure(input: SyncConfigInput): Promise<{ ok: boolean; message: string }>;
  syncTest(input: SyncConfigInput): Promise<{ ok: boolean; message: string }>;
  syncNow(): Promise<{ ok: boolean; message: string }>;
  syncDisable(): Promise<{ ok: boolean; message: string }>;

  aiFromText(text: string): Promise<{ items: AiItem[] }>;
  aiOrganize(todos: Todo[]): Promise<AiOrganizeResult>;
  aiSummary(todos: Todo[]): Promise<string>;
  aiTest(): Promise<{ ok: boolean; message: string }>;

  exportData(): Promise<{ ok: boolean; path?: string }>;
  importData(): Promise<Todo[] | null>;

  /** 网页版通知权限状态；其他端可不实现。 */
  notificationPermission?(): NotificationPermission | 'unsupported';
  requestNotifications?(): Promise<{ ok: boolean; message: string }>;

  on<K extends keyof Events>(channel: K, callback: (payload: Events[K]) => void): () => void;
}

declare global {
  interface Window {
    api: SmartTodoApi;
  }
}

/** 桌面端由 preload 注入 window.api，Android 端由 mobile/bootstrap 注入。
 *  用 Proxy 延迟解析，避免模块加载早于移动端桥接初始化。 */
export const api: SmartTodoApi = new Proxy({} as SmartTodoApi, {
  get(_target, key: string | symbol) {
    const bridge = (window as Window & { api?: SmartTodoApi }).api;
    const value = (bridge as unknown as Record<string | symbol, unknown> | undefined)?.[key];
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(bridge)
      : value;
  },
});
