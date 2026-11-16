/**
 * 网页版到点提醒：页面打开期间轮询 remindAt，并通过浏览器通知提醒。
 * 权限必须由用户在设置里主动授权；浏览器关闭后定时器不再运行。
 */
import type { Todo } from '../types';
import { emit, on } from '../mobile/events';

export interface ReminderHost {
  todos(): Todo[];
  /** 保存、广播 todos:updated，并把改动排进同步队列。 */
  commit(todos: Todo[]): void;
}

const CHECK_MS = 30_000;
let timer: number | null = null;
let currentHost: ReminderHost | null = null;

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** 必须在用户点击等手势中调用，浏览器才会授予通知权限。 */
export async function requestNotifications(): Promise<{ ok: boolean; message: string }> {
  if (typeof Notification === 'undefined') {
    return { ok: false, message: '当前浏览器不支持系统通知' };
  }
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      if (currentHost) check(currentHost);
      return { ok: true, message: '通知已开启，页面打开期间会弹出到点提醒' };
    }
    return {
      ok: false,
      message: result === 'denied'
        ? '通知权限被拒绝，请在浏览器地址栏的通知设置中改为允许'
        : '未获得通知权限，到点只会在页内提示',
    };
  } catch (_) {
    return { ok: false, message: '通知授权失败，请在浏览器设置中允许本站点通知' };
  }
}

function notify(todo: Todo): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const notification = new Notification(`SmartTodo · ${todo.title}`, {
      body: todo.content ? todo.content.slice(0, 120) : '到点了，去完成这条待办',
      tag: todo.id,
    });
    notification.onclick = () => {
      window.focus();
      emit('editor:open', todo.id);
      notification.close();
    };
  } catch (_) {
    // 通知构造失败时仍保留页内 toast。
  }
}

function check(host: ReminderHost): void {
  const now = Date.now();
  let changed = false;
  const next = host.todos().map((todo) => {
    if (todo.done || todo.reminded || todo.deletedAt || !todo.remindAt) return todo;
    const at = new Date(todo.remindAt).getTime();
    if (!Number.isFinite(at) || at > now) return todo;
    changed = true;
    const updated: Todo = { ...todo, reminded: true, updatedAt: new Date().toISOString() };
    emit('reminder:due', updated);
    notify(updated);
    return updated;
  });
  if (changed) host.commit(next);
}

export function initWebReminders(host: ReminderHost): void {
  currentHost = host;
  check(host);
  if (timer !== null) window.clearInterval(timer);
  timer = window.setInterval(() => check(host), CHECK_MS);
  on('todos:updated', () => check(host));
}
