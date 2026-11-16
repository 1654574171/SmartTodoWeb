export type Priority = 'high' | 'medium' | 'low';
export type ThemeName = 'light' | 'dark' | 'sakura' | 'ocean' | 'forest';
export type FilterKey = 'all' | 'active' | 'done' | 'pinned';

export interface Todo {
  id: string;
  title: string;
  content: string;
  done: boolean;
  pinned: boolean;
  priority: Priority;
  tags: string[];
  color: string;
  dueDate: string | null;
  remindAt: string | null;
  reminded: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** 墓碑：删除不再物理移除记录，避免云端同步时被其他设备复活。 */
  deletedAt?: string | null;
  /** 最后修改该记录的设备，用于时间戳相同时的确定性决胜。 */
  deviceId?: string;
}

export interface Settings {
  theme: ThemeName;
  accent: string;
  opacity: number;
  fontScale: number;
  apiKey: string;
  apiBase: string;
  model: string;
  bounds: { x: number; y: number; width: number; height: number } | null;
}

export interface AppState {
  todos: Todo[];
  settings: Settings;
}

export interface AiItem {
  title: string;
  content: string;
  priority: Priority;
  tags: string[];
  dueDate: string | null;
  dueTime: string | null;
}

export interface AiUpdate {
  id: string;
  title?: string;
  priority?: Priority;
  tags?: string[];
  dueDate?: string | null;
}

export interface AiOrganizeResult {
  summary: string;
  insights: string[];
  updates: AiUpdate[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  accent: '#0071e3',
  opacity: 0.88,
  fontScale: 1,
  apiKey: '',
  apiBase: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  bounds: null,
};

export const THEMES: { key: ThemeName; label: string; accent: string }[] = [
  { key: 'light', label: '云白', accent: '#0071e3' },
  { key: 'dark', label: '夜墨', accent: '#0a84ff' },
  { key: 'sakura', label: '樱粉', accent: '#ff2d55' },
  { key: 'ocean', label: '海蓝', accent: '#30b0c7' },
  { key: 'forest', label: '松绿', accent: '#30d158' },
];

export const ACCENTS = ['#0071e3', '#5e5ce6', '#af52de', '#ff375f', '#ff9f0a', '#30d158', '#30b0c7'];
export const NOTE_COLORS = ['#0071e3', '#ff9f0a', '#30d158', '#ff375f', '#af52de', '#30b0c7'];
export const QUICK_TAGS = ['工作', '生活', '学习', '灵感', '紧急'];

export const PRIORITY_META: Record<Priority, { label: string; key: Priority }> = {
  high: { label: '高', key: 'high' },
  medium: { label: '中', key: 'medium' },
  low: { label: '低', key: 'low' },
};

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'done', label: '已完成' },
  { key: 'pinned', label: '置顶' },
];

function randomId() {
  const globalCrypto = globalThis.crypto;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') return globalCrypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createTodo(patch: Partial<Todo> = {}): Todo {
  const now = new Date().toISOString();
  return {
    id: randomId(),
    title: '',
    content: '',
    done: false,
    pinned: false,
    priority: 'medium',
    tags: [],
    color: NOTE_COLORS[0],
    dueDate: null,
    remindAt: null,
    reminded: false,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...patch,
  };
}

export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function dueIso(date: string | null, time: string | null = null): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const clock = time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '00:00';
  const parsed = new Date(`${date}T${clock}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function dateOnlyToIso(value: string | null): string | null {
  return dueIso(value);
}

export function dueTimeText(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (date.getHours() === 0 && date.getMinutes() === 0) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const base = `${date.getMonth() + 1}月${date.getDate()}日`;
  const time = dueTimeText(iso);
  return time ? `${base} ${time}` : base;
}

export function isoToDateOnly(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dueState(iso: string | null): { label: string; overdue: boolean } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diff = date.getTime() - Date.now();
  const overdue = diff < 0;
  const days = Math.ceil(Math.abs(diff) / 86400000);
  const label = overdue
    ? days <= 1
      ? '已逾期'
      : `逾期 ${days} 天`
    : days <= 1
      ? '今天到期'
      : `还有 ${days} 天`;
  return { label, overdue };
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || '未知错误');
}

/** 过滤墓碑后的有效待办；列表、统计、日历、标签都基于它。 */
export function activeTodos(todos: Todo[]): Todo[] {
  return todos.filter((todo) => !todo.deletedAt);
}

/** 所有写路径统一刷新 updatedAt，云端按它做 last-write-wins。 */
export function touchTodo(todo: Todo, patch: Partial<Todo> = {}): Todo {
  return { ...todo, ...patch, updatedAt: new Date().toISOString() };
}

export interface SyncConfig {
  configured: boolean;
  email: string;
  /** 本机已保存的应用密码，回填到设置界面；未配置时为空串。 */
  password: string;
  remoteDir: string;
  autoSync: boolean;
  intervalMin: number;
  /** 网页版可填同源代理地址以绕过浏览器跨域限制；桌面 / 安卓端忽略。 */
  baseUrl?: string;
}

export interface SyncConfigInput {
  email: string;
  password: string;
  remoteDir: string;
  autoSync: boolean;
  intervalMin: number;
  baseUrl?: string;
}

export interface SyncStatus {
  state: 'off' | 'idle' | 'syncing' | 'error' | 'offline';
  message: string;
  lastSyncAt: string | null;
  deviceId: string;
  pending: boolean;
}
