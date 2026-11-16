/**
 * 与桌面端 electron/sync-merge.cjs 完全一致的多设备合并逻辑。
 * 两台设备即使时间戳相同也必须得到相同结果，因此平局用 deviceId 决胜。
 */
import type { Todo } from '../types';

type Entry = Todo & { deviceId?: string };

export interface DeviceFile {
  schema: 1;
  deviceId: string;
  writtenAt: string;
  entries: Record<string, Entry>;
}

function stamp(entry: Entry): number {
  const time = Date.parse(entry?.updatedAt || '');
  return Number.isFinite(time) ? time : 0;
}

function isNewer(candidate: Entry, current: Entry): boolean {
  const a = stamp(candidate);
  const b = stamp(current);
  if (a !== b) return a > b;
  return String(candidate.deviceId || '') > String(current.deviceId || '');
}

export function makeDeviceFile(deviceId: string, todos: Todo[], writtenAt = new Date().toISOString()): DeviceFile {
  const entries: Record<string, Entry> = {};
  for (const todo of Array.isArray(todos) ? todos : []) {
    if (!todo || !todo.id) continue;
    entries[todo.id] = {
      ...todo,
      deviceId: todo.deviceId || deviceId,
      updatedAt: todo.updatedAt || writtenAt,
    };
  }
  return { schema: 1, deviceId, writtenAt, entries };
}

export function mergeDeviceFiles(files: DeviceFile[]): Todo[] {
  const map = new Map<string, Entry>();
  for (const file of Array.isArray(files) ? files : []) {
    if (!file || !file.entries || typeof file.entries !== 'object') continue;
    for (const [id, raw] of Object.entries(file.entries)) {
      if (!raw || typeof raw !== 'object') continue;
      const entry: Entry = {
        ...raw,
        id: id || raw.id,
        deviceId: raw.deviceId || file.deviceId || '',
      };
      if (!entry.id) continue;
      const current = map.get(entry.id);
      if (!current || isNewer(entry, current)) map.set(entry.id, entry);
    }
  }
  return [...map.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function signature(todos: Todo[]): string {
  return (Array.isArray(todos) ? todos : [])
    .map((todo) => `${todo.id}|${todo.updatedAt || ''}|${todo.deletedAt || ''}`)
    .sort()
    .join('\n');
}
