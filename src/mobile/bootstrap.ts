/**
 * Android / WebView 启动入口：在 React 渲染前注入与 Electron preload 等价的 window.api。
 * 桌面能力（独立贴窗、托盘、全局快捷键）在这里做移动端降级。
 */
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { Events, SmartTodoApi } from '../api';
import type { Settings, Todo } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { aiFromText, aiOrganize, aiSummary, aiTest } from './ai';
import { emit, on as addListener } from './events';
import { initReminders, refreshReminders } from './reminders';
import { initSync, type MobileSync } from './sync';
import { consumeQuickTodos, consumeWidgetAction, initWidget } from './widget';
import { loadState, saveSettings, saveTodos } from './store';

const BACKUP_PREFIX = 'smarttodo-backup';

async function minimize(): Promise<{ ok: boolean }> {
  if (!Capacitor.isNativePlatform()) return { ok: false };
  try {
    await App.minimizeApp();
    return { ok: true };
  } catch (_) {
    return { ok: false };
  }
}

async function exportBackup(): Promise<{ ok: boolean; path?: string }> {
  const state = loadState();
  const text = JSON.stringify(state, null, 2);
  const name = `${BACKUP_PREFIX}-${new Date().toISOString().slice(0, 10)}.json`;
  let clipboard: Promise<void> | undefined;
  try {
    clipboard = navigator.clipboard?.writeText(text);
  } catch (_) {
    clipboard = undefined;
  }
  try {
    await clipboard;
  } catch (_) {
    // 部分 WebView 不允许写剪贴板，继续走文件备份。
  }

  let path = '';
  if (Capacitor.isNativePlatform()) {
    for (const directory of [Directory.Documents, Directory.Data]) {
      try {
        const result = await Filesystem.writeFile({
          path: name,
          data: text,
          directory,
          encoding: Encoding.UTF8,
          recursive: true,
        });
        path = result.uri;
        break;
      } catch (_) {
        // Android 11+ 分区存储可能不允许写公共 Documents，回退到应用私有目录。
      }
    }
  }
  return { ok: true, path: path || '已复制到剪贴板' };
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

/** 把系统状态栏高度（dp，与 WebView 的 CSS px 等价）注入样式，供顶部安全区使用。 */
async function applyStatusBarInsets(): Promise<void> {
  try {
    const info = await StatusBar.getInfo();
    const inset = info.visible ? Math.max(0, Math.round(info.height || 0)) : 0;
    document.documentElement.style.setProperty('--status-bar-inset', `${inset}px`);
  } catch (_) {
    document.documentElement.style.setProperty('--status-bar-inset', '0px');
  }
}

async function setupNativeUi(native: boolean, android: boolean, sync: MobileSync): Promise<void> {
  if (!native) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: '#f2f2f7' });
  } catch (_) {
    // 部分 Android 版本不支持状态栏着色，忽略即可。
  }
  void applyStatusBarInsets();

  let lastTheme = '';
  const applyStatusBarTheme = () => {
    const theme = document.documentElement.dataset.theme || 'light';
    if (theme === lastTheme) return;
    lastTheme = theme;
    const dark = theme === 'dark';
    void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
    void StatusBar.setBackgroundColor({ color: dark ? '#1c1c1e' : '#f2f2f7' }).catch(() => undefined);
  };
  applyStatusBarTheme();
  new MutationObserver(applyStatusBarTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  if (!android) return;
  try {
    await App.addListener('backButton', () => emit('app:back', null));
    await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      sync.resume();
      refreshReminders();
      void applyStatusBarInsets();
      void consumeWidgetAction();
      void consumeQuickTodos();
    });
  } catch (_) {
    // Web 预览环境下插件未提供原生监听器。
  }
}

export async function initMobile(): Promise<void> {
  const native = Capacitor.isNativePlatform();
  const android = Capacitor.getPlatform() === 'android';
  document.documentElement.dataset.platform = android ? 'android' : 'web';
  document.documentElement.classList.toggle('platform-android', android);

  const sync = initSync();

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
    async openNote(_id: string) {
      emit('toast', '安卓版不支持独立贴窗');
      return { ok: false, message: '安卓版不支持独立贴窗' };
    },
    async closeNote(_id: string) {
      return { ok: false };
    },
    async openEditor(id) {
      emit('editor:open', id);
      return { ok: true };
    },
    async hideWindow() {
      return minimize();
    },
    async minimizeWindow() {
      return minimize();
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

    exportData: () => exportBackup(),
    importData: () => importBackup(sync),

    on<K extends keyof Events>(channel: K, callback: (payload: Events[K]) => void): () => void {
      return addListener(channel, callback as (payload: unknown) => void);
    },
  };

  (window as Window & { api: SmartTodoApi }).api = api;
  await setupNativeUi(native, android, sync);
  await initReminders({ todos: () => loadState().todos, commit: commitTodos });
  initWidget(loadState().todos);
  sync.start();
}
