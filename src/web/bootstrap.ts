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

type NavState = { smarttodoNav: 'home' | 'panel' };

/**
 * 网页端（尤其 iOS 添加到桌面的 PWA）的左滑返回处理。
 *
 * 关键点：绝不在首页额外 pushState 哨兵。过去那样做会让 history 里出现多条同 URL
 * 记录，WKWebView 左滑退回时判定为跨文档导航 → 白屏重载。现在：
 *   - 首页用 replaceState 标记，历史仍只有一条，左滑可正常退出回桌面；
 *   - 仅在设置/日历/AI/编辑器打开时压入一条 panel 记录；
 *   - 面板内左滑退回首页时转成 app:back，由 App 分层关闭面板，停在同一 document。
 */
function initWebBackHandler(): void {
  const isNavState = (value: unknown): value is NavState => (
    !!value && (value as NavState).smarttodoNav === 'home'
    || !!value && (value as NavState).smarttodoNav === 'panel'
  );

  // 不新增历史条目，只给当前（首页）记录打标记。
  history.replaceState({ smarttodoNav: 'home' }, '');

  let panelOpen = false;
  let ignoreNextPop = false;
  let suppressOverlaySync = false;

  window.addEventListener('popstate', (event) => {
    if (ignoreNextPop) {
      ignoreNextPop = false;
      return;
    }
    const state: unknown = event.state;
    // 从 panel 记录退回 home：面板内左滑 → 关闭面板，停在当前 document。
    if (isNavState(state) && state.smarttodoNav === 'home' && panelOpen) {
      suppressOverlaySync = true;
      emit('app:back', null);
      // 兜底：若这次返回未引起任何 overlay 变化，避免标志一直残留。
      window.setTimeout(() => { suppressOverlaySync = false; }, 60);
    }
    // 其余情况（首页左滑、前进到 panel）不拦截，交给浏览器/系统处理。
  });

  // 面板由 React 条件渲染，用 DOM 变化同步历史栈，避免改 App.tsx / api.ts。
  const observer = new MutationObserver(() => {
    const open = !!document.querySelector('.panel-overlay');
    if (open === panelOpen) return;
    panelOpen = open;
    if (suppressOverlaySync) {
      suppressOverlaySync = false;
      return;
    }
    if (open) {
      history.pushState({ smarttodoNav: 'panel' }, '');
    } else if (isNavState(history.state) && (history.state as NavState).smarttodoNav === 'panel') {
      // 面板由 UI（X / 遮罩 / 保存）关闭：同步弹掉 panel 记录，保持历史栈一致。
      ignoreNextPop = true;
      history.back();
      window.setTimeout(() => { ignoreNextPop = false; }, 300);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export async function initWeb(): Promise<void> {
  // 界面完全沿用安卓版（大标题、左滑卡片、隐藏窗口类按钮），仅用 shell 标记区分原生能力。
  document.documentElement.dataset.platform = 'android';
  document.documentElement.dataset.shell = 'web';
  document.documentElement.classList.add('platform-android');
  document.documentElement.style.removeProperty('--status-bar-inset');

  initWebBackHandler();

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
      // 网页版无法真正关闭窗口；分层返回走到主界面时给个明确提示，而不是“不支持”。
      emit('toast', '已经是首页了');
      return { ok: false };
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
