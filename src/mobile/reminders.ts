/**
 * Android 到点提醒：把未来的 remindAt 注册成系统本地通知，由 AlarmManager 投递，
 * 应用退到后台、被回收或设备重启后仍可送达（插件自带 BOOT_COMPLETED 恢复）。
 *
 * 桌面端仍由 electron/main.cjs 的 startReminderLoop 负责。两端共用 reminded 标记
 * 尽量只提醒一次：谁先弹出谁写入并同步，另一端同步到后就会取消自己的调度。
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { Todo } from '../types';
import { activeTodos } from '../types';
import { emit, on } from './events';

const CHANNEL_ID = 'smarttodo-reminders';
const SCHEDULED_KEY = 'smarttodo:reminders';
const DEBOUNCE_MS = 400;
const PERMISSION_RETRY_MS = 60000;

interface ScheduledReminder {
  id: number;
  todoId: string;
  at: number;
}

export interface ReminderHost {
  todos(): Todo[];
  /** 保存、广播 todos:updated，并把改动排进同步队列。 */
  commit(todos: Todo[]): void;
}

let host: ReminderHost | null = null;
let debounceTimer: number | null = null;
let running = false;
let pendingAgain = false;
let warnedPermission = false;
let lastPermissionRequest = 0;

function readScheduled(): ScheduledReminder[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SCHEDULED_KEY) || '[]');
    return Array.isArray(parsed) ? (parsed as ScheduledReminder[]) : [];
  } catch (_) {
    return [];
  }
}

function writeScheduled(list: ScheduledReminder[]): void {
  try {
    localStorage.setItem(SCHEDULED_KEY, JSON.stringify(list));
  } catch (_) {
    // 存储不可用时退化为每次重建调度，不影响提醒本身。
  }
}

/** UUID 稳定映射成 32 位正整数，作为本地通知 id。 */
function notificationId(todoId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < todoId.length; i += 1) {
    hash ^= todoId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 1) || 1;
}

function futureReminders(todos: Todo[], now: number): ScheduledReminder[] {
  return activeTodos(todos)
    .filter((todo) => !todo.done && !todo.reminded && todo.remindAt)
    .map((todo) => ({ todoId: todo.id, at: new Date(todo.remindAt as string).getTime() }))
    .filter((item) => Number.isFinite(item.at) && item.at > now)
    .map((item) => ({ ...item, id: notificationId(item.todoId) }))
    .sort((a, b) => a.at - b.at);
}

function sameSchedule(a: ScheduledReminder[], b: ScheduledReminder[]): boolean {
  return a.length === b.length
    && a.every((item, index) => item.id === b[index].id && item.at === b[index].at);
}

/** 通知已由系统投递但应用当时不在前台：补记 reminded，避免桌面端再弹一次。 */
function settleDeliveredReminders(now: number): void {
  if (!host) return;
  const firedIds = new Set(readScheduled().filter((item) => item.at <= now).map((item) => item.todoId));
  if (!firedIds.size) return;
  const todos = host.todos();
  let changed = false;
  const next = todos.map((todo) => {
    if (!firedIds.has(todo.id) || todo.reminded) return todo;
    changed = true;
    return { ...todo, reminded: true };
  });
  if (changed) host.commit(next);
}

function markReminded(todoId: string): void {
  if (!host) return;
  const todos = host.todos();
  const target = todos.find((todo) => todo.id === todoId);
  if (!target || target.reminded) return;
  host.commit(todos.map((todo) => (todo.id === todoId ? { ...todo, reminded: true } : todo)));
  refreshReminders();
}

function warnOnce(message: string): void {
  if (warnedPermission) return;
  warnedPermission = true;
  emit('toast', message);
}

async function exactAlarmAllowed(): Promise<boolean> {
  try {
    const setting = await LocalNotifications.checkExactNotificationSetting();
    return setting.exact_alarm === 'granted';
  } catch (_) {
    return false;
  }
}

async function applySchedule(): Promise<void> {
  if (running) {
    pendingAgain = true;
    return;
  }
  running = true;
  try {
    const now = Date.now();
    const permission = await LocalNotifications.checkPermissions();
    // 仅在通知确实能显示时才补记，否则交给桌面端兜底提醒。
    if (permission.display === 'granted') settleDeliveredReminders(now);

    const desired = futureReminders(host?.todos() || [], now);
    const previous = readScheduled();
    if (sameSchedule(previous, desired)) return;

    // 先取消旧调度：待办被删除、完成或改时间后不会留下幽灵提醒。
    if (previous.length) {
      try { await LocalNotifications.cancelAll(); } catch (_) { /* 没有待取消项 */ }
    }
    if (!desired.length) {
      writeScheduled([]);
      return;
    }

    let granted = permission.display === 'granted';
    // 不依赖权限状态字面值（不同 Android 版本可能返回 prompt / denied）：
    // 未授予时节流请求一次，用户后来在系统设置里开启后会自动恢复调度。
    if (!granted && now - lastPermissionRequest > PERMISSION_RETRY_MS) {
      lastPermissionRequest = now;
      const requested = await LocalNotifications.requestPermissions();
      granted = requested.display === 'granted';
    }
    if (!granted) {
      warnOnce('通知权限未开启，到点提醒不会弹出；请在系统设置中允许通知');
      return;
    }

    // 精确闹钟未授权时不让插件弹出系统设置页打扰用户，改用非精确闹钟兜底。
    const exact = await exactAlarmAllowed();
    if (!exact) console.warn('[mobile] 精确闹钟未授权，提醒可能略有延迟');

    const byId = new Map((host?.todos() || []).map((todo) => [todo.id, todo]));
    const notifications: LocalNotificationSchema[] = desired.map((item) => {
      const todo = byId.get(item.todoId);
      const at = new Date(item.at);
      const atLabel = `${at.getMonth() + 1}月${at.getDate()}日 ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
      return {
        id: item.id,
        title: `待办提醒 · ${todo?.title || '便签'}`,
        body: todo?.content
          ? `${todo.content.slice(0, 90)} · 提醒 ${atLabel}`
          : `提醒时间 ${atLabel}`,
        schedule: { at: new Date(item.at), allowWhileIdle: true },
        channelId: CHANNEL_ID,
        smallIcon: 'ic_stat_smarttodo',
        autoCancel: true,
        foreground: true,
        isExactNotification: exact,
        extra: { todoId: item.todoId },
      };
    });

    await LocalNotifications.schedule({ notifications });
    writeScheduled(desired);
  } catch (error) {
    console.error('[mobile] 提醒调度失败', error);
  } finally {
    running = false;
    if (pendingAgain) {
      pendingAgain = false;
      refreshReminders();
    }
  }
}

/** 防抖重建调度；todos 更新、导入、同步合并、应用恢复前台都会走这里。 */
export function refreshReminders(): void {
  if (!Capacitor.isNativePlatform()) return;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void applySchedule();
  }, DEBOUNCE_MS);
}

export async function initReminders(reminderHost: ReminderHost): Promise<void> {
  host = reminderHost;
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: '待办提醒',
      description: '便签到点提醒',
      importance: 4,
      visibility: 1,
    });
  } catch (_) {
    // Android 8 以下不需要通知渠道。
  }

  try {
    await LocalNotifications.addListener('localNotificationReceived', (notification) => {
      const todoId = notification.extra?.todoId;
      if (typeof todoId === 'string') markReminded(todoId);
    });
    await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const todoId = action.notification.extra?.todoId;
      if (typeof todoId !== 'string') return;
      markReminded(todoId);
      emit('editor:open', todoId);
    });
  } catch (_) {
    // 插件监听器不可用时仍保留调度能力，只是不能自动打开对应便签。
  }

  on('todos:updated', () => refreshReminders());
  refreshReminders();
}
