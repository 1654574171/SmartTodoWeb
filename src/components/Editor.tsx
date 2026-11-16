import { useState } from 'react';
import { Bell, CalendarDays, Check, Pin, Plus, Trash2, X } from 'lucide-react';
import type { Priority, Todo } from '../types';
import {
  NOTE_COLORS,
  PRIORITY_META,
  QUICK_TAGS,
  createTodo,
  isoToLocalInput,
  localInputToIso,
} from '../types';

interface Props {
  value: Todo | 'new';
  initialDraft?: Todo | null;
  onSave: (todo: Todo) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function Editor({ value, initialDraft, onSave, onDelete, onClose }: Props) {
  const isNew = value === 'new';
  const [draft, setDraft] = useState<Todo>(() => (isNew ? { ...(initialDraft || createTodo()) } : { ...(value as Todo) }));
  const [tagInput, setTagInput] = useState('');

  const patch = (changes: Partial<Todo>) => setDraft((prev) => ({ ...prev, ...changes }));

  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/^#/, '');
    if (!tag || draft.tags.includes(tag) || draft.tags.length >= 6) return;
    patch({ tags: [...draft.tags, tag] });
    setTagInput('');
  };

  const save = () => {
    const content = draft.content.trim();
    const title = draft.title.trim() || content.split('\n')[0].slice(0, 30) || '未命名便签';
    onSave({
      ...draft,
      title,
      content,
      updatedAt: new Date().toISOString(),
      reminded: draft.remindAt === (isNew ? null : (value as Todo).remindAt) ? draft.reminded : false,
    });
  };

  return (
    <div className="panel-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="side-panel editor-panel">
        <header className="panel-header">
          <div>
            <span className="eyebrow">SMARTTODO</span>
            <h2>{isNew ? '新建便签' : '编辑便签'}</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="关闭"><X size={17} /></button>
        </header>

        <div className="panel-scroll">
          <label className="field">
            <span className="field-label">标题</span>
            <input
              className="text-input title-input"
              value={draft.title}
              autoFocus
              placeholder="要做什么？"
              onChange={(event) => patch({ title: event.target.value })}
              onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            />
          </label>

          <label className="field">
            <span className="field-label">内容 / 备注</span>
            <textarea
              className="text-input textarea"
              rows={5}
              value={draft.content}
              placeholder="补充细节、链接、想法…"
              onChange={(event) => patch({ content: event.target.value })}
            />
          </label>

          <div className="field">
            <span className="field-label">优先级</span>
            <div className="segmented">
              {(Object.keys(PRIORITY_META) as Priority[]).map((key) => (
                <button
                  key={key}
                  className={`segment ${draft.priority === key ? 'selected' : ''} segment-${key}`}
                  onClick={() => patch({ priority: key })}
                >
                  {PRIORITY_META[key].label}优先级
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">便签颜色</span>
            <div className="color-row">
              {NOTE_COLORS.map((color) => (
                <button
                  key={color}
                  className={`color-dot ${draft.color === color ? 'selected' : ''}`}
                  style={{ background: color }}
                  title={color}
                  onClick={() => patch({ color })}
                >
                  {draft.color === color && <Check size={12} strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">标签</span>
            <div className="tag-editor">
              {draft.tags.map((tag) => (
                <button key={tag} className="tag-chip removable" onClick={() => patch({ tags: draft.tags.filter((t) => t !== tag) })}>
                  #{tag} <X size={10} />
                </button>
              ))}
              <input
                className="tag-input"
                value={tagInput}
                placeholder="输入后回车"
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); addTag(tagInput); }
                }}
              />
            </div>
            <div className="quick-tags">
              {QUICK_TAGS.map((tag) => (
                <button key={tag} className="quick-tag" onClick={() => addTag(tag)}>
                  <Plus size={10} /> {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-label"><CalendarDays size={12} /> 截止时间</span>
              <input
                type="datetime-local"
                className="text-input"
                value={isoToLocalInput(draft.dueDate)}
                onChange={(event) => patch({ dueDate: localInputToIso(event.target.value) })}
              />
            </label>
            <label className="field">
              <span className="field-label"><Bell size={12} /> 提醒时间</span>
              <input
                type="datetime-local"
                className="text-input"
                value={isoToLocalInput(draft.remindAt)}
                onChange={(event) => patch({ remindAt: localInputToIso(event.target.value), reminded: false })}
              />
            </label>
          </div>
          <p className="hint">「提醒时间」到点弹出系统通知，与「截止时间」互不影响，可只设置其中一个。</p>

          <button className={`switch-row ${draft.pinned ? 'on' : ''}`} onClick={() => patch({ pinned: !draft.pinned })}>
            <span><Pin size={14} /> 置顶此便签</span>
            <span className="switch"><i /></span>
          </button>
        </div>

        <footer className="panel-footer">
          {!isNew && (
            <button className="button ghost danger" onClick={() => onDelete(draft.id)}>
              <Trash2 size={14} /> 删除
            </button>
          )}
          <span className="spacer" />
          <button className="button ghost" onClick={onClose}>取消</button>
          <button className="button primary" onClick={save}><Check size={15} /> 保存便签</button>
        </footer>
      </section>
    </div>
  );
}
