import type { AiItem, AiOrganizeResult, Settings, Todo } from '../types';

function endpoint(settings: Settings): string {
  const base = (settings.apiBase || 'https://api.deepseek.com').replace(/\/+$/, '');
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
}

async function chat(settings: Settings, system: string, user: string): Promise<string> {
  if (!settings.apiKey.trim()) throw new Error('请先在设置中填写 DeepSeek API Key');
  const response = await fetch(endpoint(settings), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.model || 'deepseek-chat',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek 返回 HTTP ${response.status}`);
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('DeepSeek 未返回内容');
  return text;
}

function parseObject(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 未返回 JSON 结果');
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function aiFromText(text: string, settings: Settings): Promise<{ items: AiItem[] }> {
  const system = '把用户文本拆成待办清单，只返回 JSON：{"items":[{"title","content","priority":"high|medium|low","tags":[],"dueDate":"YYYY-MM-DD 或 null","dueTime":"HH:mm 或 null"}]}。只有原文明确写出具体时间才返回 dueTime，否则必须为 null，禁止臆测。';
  try {
    const raw = await chat(settings, system, text.slice(0, 6000));
    const parsed = parseObject(raw);
    const list = Array.isArray(parsed.items) ? parsed.items : [];
    const items: AiItem[] = list
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => ({
        title: String(item.title || '').trim().slice(0, 80),
        content: String(item.content || '').slice(0, 2000),
        priority: ['high', 'medium', 'low'].includes(String(item.priority)) ? item.priority as AiItem['priority'] : 'medium',
        tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 8) : [],
        dueDate: DATE_RE.test(String(item.dueDate)) ? String(item.dueDate) : null,
        dueTime: TIME_RE.test(String(item.dueTime)) ? String(item.dueTime) : null,
      }))
      .filter((item) => item.title);
    return { items };
  } catch (error) {
    return { items: [{ title: text.split('\n')[0].slice(0, 40) || '文本便签', content: text, priority: 'medium', tags: [], dueDate: null, dueTime: null }] };
  }
}

export async function aiOrganize(todos: Todo[], settings: Settings): Promise<AiOrganizeResult> {
  const system = '分析待办并返回 JSON：{"summary":string,"insights":string[],"updates":[{"id","title","priority","tags","dueDate"}]}。只返回有必要的修改。';
  const brief = todos.map((todo) => ({ id: todo.id, title: todo.title, priority: todo.priority, tags: todo.tags, dueDate: todo.dueDate }));
  const raw = await chat(settings, system, JSON.stringify(brief).slice(0, 12000));
  const parsed = parseObject(raw);
  const updates = (Array.isArray(parsed.updates) ? parsed.updates : [])
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && typeof item.id === 'string')
    .map((item) => ({
      id: String(item.id),
      title: item.title === undefined ? undefined : String(item.title),
      priority: ['high', 'medium', 'low'].includes(String(item.priority)) ? item.priority as AiOrganizeResult['updates'][number]['priority'] : undefined,
      tags: Array.isArray(item.tags) ? item.tags.map(String) : undefined,
      dueDate: item.dueDate === undefined ? undefined : (DATE_RE.test(String(item.dueDate)) ? String(item.dueDate) : null),
    }));
  return {
    summary: String(parsed.summary || '整理完成'),
    insights: Array.isArray(parsed.insights) ? parsed.insights.map(String).slice(0, 8) : [],
    updates,
  };
}

export async function aiSummary(todos: Todo[], settings: Settings): Promise<string> {
  const system = '用中文简要总结这些待办的重点、风险与建议，控制在 200 字内，纯文本。';
  const brief = todos.map((todo) => `${todo.done ? '✔' : '□'} ${todo.title}（${todo.priority}）`);
  return chat(settings, system, brief.join('\n').slice(0, 12000));
}

export async function aiTest(settings: Settings): Promise<{ ok: boolean; message: string }> {
  try {
    await chat(settings, '只回复 OK 两个字符。', 'OK');
    return { ok: true, message: 'DeepSeek 连接成功' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
