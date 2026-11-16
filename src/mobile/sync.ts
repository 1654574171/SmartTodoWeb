/**
 * 安卓端坚果云同步引擎（协议 v2.1）。
 *
 * 与 electron/sync-jianguo.cjs 保持一致：云端文件放在一个同步文件夹内
 *   <remoteDir>/index.json              设备清单 { schema, devices: { [id]: writtenAt } }
 *   <remoteDir>/device-<deviceId>.json  该设备快照
 *
 * 坚果云 WebDAV 根目录不能直接放文件，目录由桌面端用 MKCOL 创建；安卓端
 * 不支持 MKCOL，只用 GET / PUT / DELETE 读写已存在目录中的文件。
 * 任一端读取清单 → 拉取全部设备快照 → 按 todo.id 做 last-write-wins 合并。
 */
import type { SyncConfig, SyncConfigInput, SyncStatus } from '../types';
import { emit } from './events';
import { makeDeviceFile, mergeDeviceFiles, signature, type DeviceFile } from './merge';
import { deviceId, loadState, loadSync, saveSync, saveTodos } from './store';

const DEFAULT_BASE = 'https://dav.jianguoyun.com/dav';
const DEFAULT_CONFIG: SyncConfig = {
  configured: false,
  email: '',
  password: '',
  remoteDir: 'SmartTodo',
  autoSync: true,
  intervalMin: 2,
};

interface IndexFile {
  schema: 1;
  devices: Record<string, string>;
}

interface WebDavClient {
  get(name: string): Promise<string | null>;
  put(name: string, text: string): Promise<void>;
  del(name: string): Promise<void>;
  mkcol(name: string): Promise<void>;
}

export interface MobileSync {
  getConfig(): SyncConfig;
  getStatus(): SyncStatus;
  configure(input: SyncConfigInput): Promise<{ ok: boolean; message: string }>;
  test(input: SyncConfigInput): Promise<{ ok: boolean; message: string }>;
  syncNow(): Promise<{ ok: boolean; message: string }>;
  disable(): Promise<{ ok: boolean; message: string }>;
  markDirty(): void;
  resume(): void;
  start(): void;
}

export function dirFor(value: string): string {
  const clean = String(value || 'SmartTodo').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return clean || 'SmartTodo';
}

function encodeRemotePath(remotePath: string): string {
  const raw = String(remotePath || '/');
  const trailing = raw.endsWith('/') ? '/' : '';
  const parts = raw.split('/').filter(Boolean).map((part) => encodeURIComponent(part));
  return `/${parts.join('/')}${trailing && parts.length ? trailing : ''}`;
}

function basicAuth(email: string, password: string): string {
  const bytes = new TextEncoder().encode(`${email}:${password}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

function httpError(status: number, method: string): Error & { status: number } {
  const error = new Error(`WebDAV ${method} 返回 ${status}`) as Error & { status: number };
  error.status = status;
  return error;
}

function createClient(email: string, password: string, baseUrl: string): WebDavClient {
  const auth = basicAuth(email, password);
  const base = baseUrl.replace(/\/+$/, '');

  async function request(
    method: 'GET' | 'PUT' | 'DELETE' | 'MKCOL',
    name: string,
    body?: string,
  ): Promise<{ status: number; text: string }> {
    const headers: Record<string, string> = { Authorization: auth };
    if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
    // Netlify 等平台会拦截 MKCOL：用 POST + 覆盖头穿过平台，由同源代理还原成 MKCOL。
    const methodOverride = method === 'MKCOL';
    let fetchUrl = `${base}${encodeRemotePath(name)}`;
    if (methodOverride) {
      headers['X-HTTP-Method-Override'] = 'MKCOL';
      // 查询参数比自定义头更可靠：Netlify 不会过滤它。
      fetchUrl += `${fetchUrl.includes('?') ? '&' : '?'}__method=MKCOL`;
    }
    const fetchMethod = methodOverride ? 'POST' : method;
    const response = await fetch(fetchUrl, { method: fetchMethod, headers, body });
    const text = await response.text();
    if (response.status === 404 && (method === 'GET' || method === 'DELETE')) {
      return { status: 404, text };
    }
    // MKCOL 返回 405 表示目录已存在，视为成功。
    if (method === 'MKCOL' && response.status === 405) return { status: 405, text };
    if (!response.ok) throw httpError(response.status, method);
    return { status: response.status, text };
  }

  return {
    async get(name) {
      const result = await request('GET', name);
      return result.status === 404 ? null : result.text;
    },
    async put(name, text) {
      await request('PUT', name, text);
    },
    async del(name) {
      await request('DELETE', name);
    },
    async mkcol(name) {
      await request('MKCOL', name);
    },
  };
}

/** 网页版可在同步前自动建目录；安卓端沿用既有行为，要求目录已存在。 */
async function ensureRemoteDir(client: WebDavClient, dir: string, allowMkcol: boolean): Promise<void> {
  if (!allowMkcol) return;
  try {
    await client.mkcol(dir);
  } catch (_) {
    // 目录可能已存在或由其他端创建，后续读写会验证真实状态。
  }
}

async function readIndex(client: WebDavClient, dir: string): Promise<Record<string, string>> {
  const text = await client.get(`${dir}/index.json`);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as Partial<IndexFile>;
    return parsed && parsed.devices && typeof parsed.devices === 'object' ? parsed.devices : {};
  } catch (_) {
    return {};
  }
}

function describeError(error: unknown): { state: SyncStatus['state']; message: string } {
  const status = (error as { status?: number } | null)?.status;
  const http = status ? `（HTTP ${status}）` : '';
  if (status === 401) return { state: 'error', message: '应用密码无效，请在坚果云重新生成应用密码' };
  if (status === 403) return { state: 'error', message: `没有该目录的访问权限${http}；请检查应用密码与云端目录名` };
  if (status === 404 || status === 409) {
    return { state: 'error', message: `云端目录不存在${http}；请先在坚果云网页端创建同名同步文件夹，或先在桌面端完成一次同步` };
  }
  if (status === 405) return { state: 'error', message: `WebDAV 写入被拒绝${http}；请确认代理放行了 MKCOL / PUT 方法` };
  if (status === 429 || status === 503) return { state: 'offline', message: '访问频率受限，已自动延后重试' };
  if (typeof status === 'number' && status >= 500) return { state: 'offline', message: '坚果云暂时不可用，稍后自动重试' };
  const rawMessage = error instanceof Error ? error.message : '';
  if (/Failed to fetch|NetworkError|Load failed/i.test(rawMessage)) {
    return { state: 'error', message: '浏览器跨域请求被拦截（CORS）；网页版请配置同源 WebDAV 代理地址' };
  }
  const reason = rawMessage ? `（${rawMessage}）` : '';
  return { state: 'offline', message: `网络不可用，改动已保存在本机${reason}` };
}

export function initSync(options: { baseUrl?: string; allowMkcol?: boolean } = {}): MobileSync {
  const defaultBase = options.baseUrl || DEFAULT_BASE;
  const allowMkcol = options.allowMkcol === true;
  const baseFor = (config?: Partial<SyncConfig> | null): string => config?.baseUrl || defaultBase;
  const ownId = deviceId();
  const initial = loadSync();
  let status: SyncStatus = {
    state: initial.config && initial.password ? 'idle' : 'off',
    message: initial.config && initial.password ? '等待同步' : '未配置',
    lastSyncAt: initial.lastSyncAt,
    deviceId: ownId,
    pending: !!initial.dirty,
  };

  let running = false;
  let rerun = false;
  let backoffMs = 0;
  let started = false;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function setStatus(state: SyncStatus['state'], message: string): void {
    const current = loadSync();
    status = {
      state,
      message,
      lastSyncAt: current.lastSyncAt,
      deviceId: ownId,
      pending: running || rerun || !!current.dirty,
    };
    emit('sync:status', status);
  }

  function scheduleInterval(): void {
    if (intervalTimer !== null) clearInterval(intervalTimer);
    if (retryTimer !== null) clearTimeout(retryTimer);
    intervalTimer = null;
    retryTimer = null;
    const current = loadSync();
    if (!current.config || !current.config.autoSync) return;
    const minutes = Math.max(1, Math.min(120, Number(current.config.intervalMin) || 2));
    intervalTimer = setInterval(() => { void syncOnce(); }, minutes * 60000);
  }

  function queue(delay = 0): void {
    const current = loadSync();
    if (!current.config || !current.password) return;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void syncOnce();
    }, delay);
  }

  async function syncOnce(): Promise<{ ok: boolean; message: string }> {
    const current = loadSync();
    if (!current.config || !current.password) return { ok: false, message: '尚未配置坚果云同步' };
    if (running) {
      rerun = true;
      return { ok: true, message: '同步进行中' };
    }
    running = true;
    setStatus('syncing', '正在同步…');
    try {
      const client = createClient(current.config.email, current.password, baseFor(current.config));
      const dir = dirFor(current.config.remoteDir);
      await ensureRemoteDir(client, dir, allowMkcol);
      const indexName = `${dir}/index.json`;
      const ownName = `${dir}/device-${ownId}.json`;

      let devices = await readIndex(client, dir);
      devices[ownId] = current.lastSyncAt || '';
      const files: DeviceFile[] = [];
      for (const id of Object.keys(devices)) {
        if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) continue;
        const text = await client.get(`${dir}/device-${id}.json`);
        if (!text) continue;
        try {
          const parsed = JSON.parse(text) as Partial<DeviceFile>;
          if (parsed && parsed.schema === 1 && parsed.entries && typeof parsed.entries === 'object') {
            files.push(parsed as DeviceFile);
          }
        } catch (_) {
          // 单个快照损坏时跳过，不阻断其余设备的数据。
        }
      }

      const localTodos = loadState().todos || [];
      const merged = mergeDeviceFiles([...files, makeDeviceFile(ownId, localTodos)]);
      if (signature(merged) !== signature(localTodos)) {
        saveTodos(merged);
        emit('todos:updated', merged);
      }

      const snapshot = makeDeviceFile(ownId, merged);
      await client.put(ownName, JSON.stringify(snapshot));
      // 写回清单前重新读取，尽量缩短多设备并发写清单的覆盖窗口。
      devices = await readIndex(client, dir);
      devices[ownId] = snapshot.writtenAt;
      await client.put(indexName, JSON.stringify({ schema: 1, devices }));

      const saved = loadSync();
      saved.lastSyncAt = snapshot.writtenAt;
      saved.dirty = false;
      saveSync(saved);
      backoffMs = 0;
      setStatus('idle', '同步完成');
      return { ok: true, message: '同步完成' };
    } catch (error) {
      const info = describeError(error);
      const saved = loadSync();
      saved.dirty = true;
      saveSync(saved);
      setStatus(info.state, info.message);
      backoffMs = Math.min(30 * 60000, Math.max(60000, (backoffMs || 0) * 2));
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { void syncOnce(); }, backoffMs);
      return { ok: false, message: info.message };
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        queue(1000);
      }
    }
  }

  const api: MobileSync = {
    getConfig() {
      const current = loadSync();
      return current.config
        ? {
            ...DEFAULT_CONFIG,
            ...current.config,
            baseUrl: baseFor(current.config),
            configured: true,
            password: current.password || '',
          }
        : { ...DEFAULT_CONFIG, baseUrl: defaultBase };
    },
    getStatus() {
      return { ...status };
    },
    markDirty() {
      const current = loadSync();
      if (!current.config || !current.password) return;
      current.dirty = true;
      saveSync(current);
      setStatus(status.state === 'syncing' ? 'syncing' : 'idle', '有待同步的改动');
      queue(5000);
    },
    async configure(input) {
      const email = String(input?.email || '').trim();
      const current = loadSync();
      // 用户清空输入框时沿用旧凭据，便于只修改目录 / 间隔而不必重输密码。
      const password = String(input?.password || '') || current.password || '';
      if (!email || !password) return { ok: false, message: '请填写邮箱和应用密码' };
      const next = {
        email,
        remoteDir: String(input?.remoteDir || 'SmartTodo').trim() || 'SmartTodo',
        autoSync: input?.autoSync !== false,
        intervalMin: Math.max(1, Math.min(120, Number(input?.intervalMin) || 2)),
        baseUrl: String(input?.baseUrl || '').trim() || undefined,
      };
      saveSync({ ...current, config: next, password, dirty: true });
      scheduleInterval();
      setStatus('idle', '已保存配置，正在首次同步');
      queue(0);
      return { ok: true, message: '配置已保存，正在首次同步' };
    },
    async test(input) {
      const current = loadSync();
      const email = String(input?.email || current.config?.email || '').trim();
      const password = String(input?.password || current.password || '');
      const dir = dirFor(input?.remoteDir || current.config?.remoteDir || 'SmartTodo');
      if (!email || !password) return { ok: false, message: '请填写邮箱和应用密码' };
      try {
        const client = createClient(email, password, input?.baseUrl || baseFor(current.config));
        await ensureRemoteDir(client, dir, allowMkcol);
        await client.get(`${dir}/index.json`);
        // 真正写一次再删除，避免「测试通过、同步却报网络错误」。
        const probe = `${dir}/smarttodo-probe.json`;
        await client.put(probe, 'ok');
        await client.del(probe);
        return { ok: true, message: '账号验证成功，云端目录可读写' };
      } catch (error) {
        return { ok: false, message: describeError(error).message };
      }
    },
    syncNow() {
      return syncOnce();
    },
    async disable() {
      if (intervalTimer !== null) clearInterval(intervalTimer);
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      intervalTimer = retryTimer = debounceTimer = null;
      const current = loadSync();
      saveSync({ ...current, config: null, password: '', lastSyncAt: null, dirty: true });
      setStatus('off', '未配置');
      return { ok: true, message: '已断开坚果云同步，本机数据保留' };
    },
    resume() {
      const current = loadSync();
      if (current.config && current.password) queue(0);
    },
    start() {
      if (started) return;
      started = true;
      scheduleInterval();
      const current = loadSync();
      if (current.config && current.password) queue(1500);
      window.addEventListener('online', () => {
        const latest = loadSync();
        if (latest.config && latest.password) queue(0);
      });
      window.addEventListener('offline', () => setStatus('offline', '网络不可用，改动已保存在本机'));
    },
  };

  return api;
}
