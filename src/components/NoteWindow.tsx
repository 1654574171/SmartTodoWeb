import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Check, Clock, Pencil, X } from 'lucide-react';
import { api } from '../api';
import BrandLogo from './BrandLogo';
import { applyTheme } from '../theme';
import type { Settings, Todo } from '../types';
import { DEFAULT_SETTINGS, PRIORITY_META, formatDue } from '../types';

export default function NoteWindow({ id }: { id: string }) {
  const [todo, setTodo] = useState<Todo | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let alive = true;
    api.getState().then((state) => {
      if (!alive) return;
      setTodo(state.todos.find((item) => item.id === id && !item.deletedAt) || null);
      setSettings(state.settings);
    });
    const offs = [
      api.on('todos:updated', (todos) => setTodo(todos.find((item) => item.id === id && !item.deletedAt) || null)),
      api.on('settings:updated', setSettings),
    ];
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
  }, [id]);

  useEffect(() => applyTheme(settings), [settings]);

  const toggleDone = async () => {
    const state = await api.getState();
    const now = new Date().toISOString();
    const next = state.todos.map((item) =>
      item.id === id
        ? { ...item, done: !item.done, completedAt: !item.done ? now : null, updatedAt: now }
        : item,
    );
    setTodo(next.find((item) => item.id === id) || null);
    await api.saveTodos(next);
  };

  const style = { '--note-color': todo?.color || '#5b7cfa' } as CSSProperties;

  return (
    <div className="note-window" style={style}>
      <div className="note-window-bar drag">
        <span><BrandLogo size={13} /> 便签</span>
        <div className="no-drag note-window-actions">
          <button className="icon-button" title="在主面板编辑" onClick={() => api.openEditor(id)}><Pencil size={13} /></button>
          <button className="icon-button" title="收回贴窗" onClick={() => api.closeNote(id)}><X size={14} /></button>
        </div>
      </div>
      {todo ? (
        <div className={`note-window-body ${todo.done ? 'is-done' : ''}`}>
          <div className="note-window-title-row">
            <button className={`check-button ${todo.done ? 'checked' : ''}`} onClick={toggleDone} title="完成 / 取消完成">
              {todo.done && <Check size={12} strokeWidth={3} />}
            </button>
            <h3>{todo.title}</h3>
          </div>
          {todo.content && <p className="note-window-content">{todo.content}</p>}
          <div className="todo-meta">
            <span className={`priority priority-${todo.priority}`}>{PRIORITY_META[todo.priority].label}</span>
            {todo.dueDate && <span className="meta-chip"><Clock size={11} /> {formatDue(todo.dueDate)}</span>}
            {todo.tags.map((tag) => <span className="tag-chip" key={tag}>#{tag}</span>)}
          </div>
        </div>
      ) : (
        <div className="note-window-empty">便签已删除，可关闭此贴窗</div>
      )}
    </div>
  );
}
