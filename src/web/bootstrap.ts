/**
 * 纯浏览器网页版启动入口：在 React 渲染前注入与 Electron preload 等价的 window.api。
 * 数据保存在浏览器 localStorage，格式与安卓端一致，可用 JSON 备份互通。
 */
import type { Events, SmartTodoApi } from '../api';
import type { Settings, Todo } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { aiFromText, aiOrganize, aiSummary, aiTest } from '../mobile/ai';
import { emit, on as addListener } from '../mobile/events';
import { initSync, type MobileSync } from '../mobile/sync';
import { loadState, saveSettings, saveTodos } from '../mobile/store';
import { initWebReminders, notificationPermission, requestNotifications } from './reminders';

const BACKUP_PREFIX = 'smarttodo-backup';
const DAV_BASE_KEY = 'smarttodo:davBase';

function downloadBackup(): { ok: boolean; path?: string } {
  const state = loadState();
  const name = `${BACKUP_PREFIX}-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true, path: name };
}

function pickJson(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    let done = false;
    let timer = 0;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      void file.text().then(finish, () => finish(null));
    });
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    timer = window.setTimeout(() => finish(null), 45000);
    input.click();
  });
}

async function importBackup(sync: MobileSync): Promise<Todo[] | null> {
  const text = await pickJson();
  if (!text) return null;
  const parsed = JSON.parse(text) as { todos?: unknown; settings?: Partial<Settings> };
  if (!Array.isArray(parsed.todos)) throw new Error('文件格式不正确');
  const todos = parsed.todos as Todo[];
  const state = loadState();
  const settings: Settings = parsed.settings
    ? { ...DEFAULT_SETTINGS, ...parsed.settings }
    : state.settings;
  saveTodos(todos);
  saveSettings(settings);
  emit('todos:updated', todos);
  emit('settings:updated', settings);
  sync.markDirty();
  return todos;
}

function unsupported(feature: string): { ok: false; message: string } {
  const message = `网页版不支持${feature}`;
  emit('toast', message);
  return { ok: false, message };
}

export async function initWeb(): Promise<void> {
  // 界面完全沿用安卓版（大标题、左滑卡片、隐藏窗口类按钮），仅用 shell 标记区分原生能力。
  document.documentElement.dataset.platform = 'android';
  document.documentElement.dataset.shell = 'web';
  document.documentElement.classList.add('platform-android');
  document.documentElement.style.removeProperty('--status-bar-inset');

  // 默认走同源 /dav（Netlify Functions 转发）；设置里的 baseUrl 可覆盖，localStorage 兼容旧值。
  const davBase = localStorage.getItem(DAV_BASE_KEY) || '/dav';
  const sync = initSync({ baseUrl: davBase, allowMkcol: true });

  const commitTodos = (todos: Todo[]): void => {
    saveTodos(todos);
    emit('todos:updated', todos);
    sync.markDirty();
  };

  const api: SmartTodoApi = {
    async getState() {
      return loadState();
    },
    async saveTodos(todos) {
      commitTodos(todos);
      return { ok: true };
    },
    async saveSettings(settings) {
      const saved = saveSettings(settings);
      emit('settings:updated', saved);
      return saved;
    },
    async getOpenNotes(): Promise<string[]> {
      return [];
    },
    async openNote() {
      return unsupported('独立便签窗口');
    },
    async closeNote() {
      return unsupported('独立便签窗口');
    },
    async openEditor(id) {
      emit('editor:open', id);
      return { ok: true };
    },
    async hideWindow() {
      return unsupported('窗口隐藏');
    },
    async minimizeWindow() {
      return unsupported('窗口最小化');
    },

    syncGetConfig: () => Promise.resolve(sync.getConfig()),
    syncGetStatus: () => Promise.resolve(sync.getStatus()),
    syncConfigure: (input) => sync.configure(input),
    syncTest: (input) => sync.test(input),
    syncNow: () => sync.syncNow(),
    syncDisable: () => sync.disable(),

    aiFromText: (text) => aiFromText(text, loadState().settings),
    aiOrganize: (todos) => aiOrganize(todos, loadState().settings),
    aiSummary: (todos) => aiSummary(todos, loadState().settings),
    aiTest: () => aiTest(loadState().settings),

    exportData: async () => downloadBackup(),
    importData: () => importBackup(sync),

    notificationPermission,
    requestNotifications,

    on<K extends keyof Events>(channel: K, callback: (payload: Events[K]) => void): () => void {
      return addListener(channel, callback as (payload: unknown) => void);
    },
  };

  (window as Window & { api: SmartTodoApi }).api = api;
  initWebReminders({ todos: () => loadState().todos, commit: commitTodos });
  sync.start();
}
