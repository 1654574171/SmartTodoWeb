/**
 * 安卓桌面小组件桥接：把当前待办写成原生可读的轻量快照，并消费组件点击动作。
 * 小组件由 AppWidgetProvider 渲染 RemoteViews，不依赖 WebView 进程存活。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Todo } from '../types';
import { emit, on } from './events';

export interface WidgetStatus {
  installed: boolean;
  active: number;
  pinSupported: boolean;
  label: string;
}

interface SmartTodoWidgetPlugin {
  setTodos(options: { json: string }): Promise<void>;
  consumeAction(): Promise<{ action: string }>;
  getStatus(): Promise<WidgetStatus>;
  pinWidget(): Promise<{ requested: boolean }>;
  takeQuickTodos(): Promise<{ json: string }>;
}

const Widget = registerPlugin<SmartTodoWidgetPlugin>('SmartTodoWidget');

const UNAVAILABLE: WidgetStatus = { installed: false, active: 0, pinSupported: false, label: '' };

const MAX_ITEMS = 80;
let latest: Todo[] = [];
let timer: number | null = null;

function snapshot(todos: Todo[]): string {
  const items = todos
    .filter((todo) => !todo.deletedAt)
    .slice(0, MAX_ITEMS)
    .map((todo) => ({
      id: todo.id,
      title: todo.title,
      // 直接写毫秒时间戳，原生侧无需解析 ISO 字符串。
      dueAt: todo.dueDate ? new Date(todo.dueDate).getTime() : 0,
      priority: todo.priority,
      done: todo.done,
    }));
  return JSON.stringify({ updatedAt: Date.now(), todos: items });
}

async function flush(): Promise<void> {
  try {
    await Widget.setTodos({ json: snapshot(latest) });
  } catch (error) {
    console.warn('[mobile] 小组件数据同步失败', error);
  }
}

/** 待办变化后防抖写入，避免连续输入 / 同步合并时频繁刷新组件。 */
export function pushWidgetTodos(todos: Todo[], delay = 350): void {
  if (!Capacitor.isNativePlatform()) return;
  latest = todos;
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void flush();
  }, delay);
}

/** 消费「+ 号 / 列表项」留下的动作，打开新建或对应便签的编辑器。 */
export async function consumeWidgetAction(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { action } = await Widget.consumeAction();
    if (!action) return;
    if (action === 'new') emit('editor:open', null);
    else if (action.startsWith('todo:')) emit('editor:open', action.slice(5));
  } catch (error) {
    console.warn('[mobile] 小组件动作读取失败', error);
  }
}

export function initWidget(todos: Todo[]): void {
  if (!Capacitor.isNativePlatform()) return;
  pushWidgetTodos(todos, 0);
  on('todos:updated', (value) => {
    if (Array.isArray(value)) pushWidgetTodos(value as Todo[]);
  });
  // 等 App 注册完监听后再消费，避免冷启动时动作或桌面新增待办丢失。
  window.addEventListener('smarttodo:app-ready', () => {
    void consumeWidgetAction();
    void consumeQuickTodos();
  }, { once: true });
  // 应用已在前台时 MainActivity.onNewIntent() 会派发此事件，appStateChange 不会触发。
  window.addEventListener('smarttodo:widget-action', () => {
    void consumeWidgetAction();
    void consumeQuickTodos();
  });
}

/** 询问系统是否已识别到本组件，用于区分「组件没注册」与「桌面入口被藏起来」。 */
export async function getWidgetStatus(): Promise<WidgetStatus> {
  if (!Capacitor.isNativePlatform()) return UNAVAILABLE;
  try {
    return await Widget.getStatus();
  } catch (error) {
    console.warn('[mobile] 小组件自检失败', error);
    return UNAVAILABLE;
  }
}

/** 应用内请求桌面固定小组件；小米等桌面把原生组件藏在弱化入口时尤其有用。 */
export async function requestPinWidget(): Promise<{ requested: boolean; error?: string }> {
  if (!Capacitor.isNativePlatform()) return { requested: false, error: '仅安卓端可用' };
  try {
    return await Widget.pinWidget();
  } catch (error) {
    return { requested: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 取走桌面输入框创建的待办（读取即清空队列），交给 App 写入正式数据。 */
export async function consumeQuickTodos(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { json } = await Widget.takeQuickTodos();
    const items: unknown = JSON.parse(json);
    if (!Array.isArray(items)) return;
    const titles = items
      .map((item) => (item && typeof item === 'object' ? (item as { title?: unknown }).title : null))
      .filter((title): title is string => typeof title === 'string' && title.trim().length > 0);
    if (titles.length) emit('widget:quick-add', titles);
  } catch (error) {
    console.warn('[mobile] 桌面待办读取失败', error);
  }
}
