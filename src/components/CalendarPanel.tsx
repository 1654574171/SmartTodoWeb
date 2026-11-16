import { useState } from 'react';
import type { CSSProperties } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Plus, X } from 'lucide-react';
import type { Todo } from '../types';
import { PRIORITY_META, dueTimeText } from '../types';
import {
  WEEK_LABELS, addDays, addMonths, dateKey, dayTitle, monthGrid, monthTitle,
  todosOn, weekDays, weekTitle,
} from '../calendar';

interface Props {
  todos: Todo[];
  onEdit: (todo: Todo) => void;
  onToggle: (todo: Todo) => void;
  onAddAt: (key: string) => void;
  onClose: () => void;
}

type ViewMode = 'week' | 'month';

export default function CalendarPanel({ todos, onEdit, onToggle, onAddAt, onClose }: Props) {
  const [view, setView] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [selected, setSelected] = useState<string>(() => dateKey(new Date()));

  const days = view === 'month' ? monthGrid(anchor) : weekDays(anchor);
  const selectedTodos = todosOn(todos, selected);
  const title = view === 'month' ? monthTitle(anchor) : weekTitle(anchor);

  const navigate = (direction: number) => {
    setAnchor((current) => (view === 'month' ? addMonths(current, direction) : addDays(current, direction * 7)));
  };

  const goToday = () => {
    const today = new Date();
    setAnchor(today);
    setSelected(dateKey(today));
  };

  return (
    <div className="panel-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="side-panel calendar-panel">
        <header className="panel-header">
          <div>
            <span className="eyebrow">CALENDAR</span>
            <h2>日历视图</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="关闭"><X size={17} /></button>
        </header>

        <div className="calendar-controls">
          <div className="calendar-nav">
            <button className="icon-button" onClick={() => navigate(-1)} title="上一页"><ChevronLeft size={16} /></button>
            <b><CalendarDays size={13} /> {title}</b>
            <button className="icon-button" onClick={() => navigate(1)} title="下一页"><ChevronRight size={16} /></button>
          </div>
          <div className="calendar-view-row">
            <div className="segmented calendar-switch">
              <button className={`segment ${view === 'week' ? 'selected' : ''}`} onClick={() => setView('week')}>周</button>
              <button className={`segment ${view === 'month' ? 'selected' : ''}`} onClick={() => setView('month')}>月</button>
            </div>
            <button className="button soft small" onClick={goToday}>今天</button>
          </div>
        </div>

        <div className="panel-scroll calendar-scroll no-scrollbar">
          <div className="calendar-week-head">
            {WEEK_LABELS.map((label) => <span key={label}>{label}</span>)}
          </div>

          {view === 'month' ? (
            <div className="calendar-month-grid">
              {days.map((day) => {
                const items = todosOn(todos, day.key);
                return (
                  <button
                    key={day.key}
                    className={[
                      'cal-cell',
                      day.inMonth ? '' : 'other-month',
                      day.isToday ? 'today' : '',
                      selected === day.key ? 'selected' : '',
                      day.isWeekend ? 'weekend' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => {
                      setSelected(day.key);
                      if (!day.inMonth) setAnchor(new Date(day.date.getFullYear(), day.date.getMonth(), 1));
                    }}
                    title={`${day.key} · ${items.length} 条待办`}
                  >
                    <span className="cal-day-num">{day.day}</span>
                    <span className="cal-dots">
                      {items.slice(0, 3).map((todo) => (
                        <i
                          key={todo.id}
                          className={todo.done ? 'done' : ''}
                          style={{ background: todo.done ? 'transparent' : todo.color, borderColor: todo.color }}
                        />
                      ))}
                    </span>
                    {items.length > 3 && <span className="cal-more">+{items.length - 3}</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="calendar-week-grid">
              {days.map((day, index) => {
                const items = todosOn(todos, day.key);
                return (
                  <div className="cal-week-column" key={day.key}>
                    <button
                      className={[
                        'cal-week-head',
                        day.isToday ? 'today' : '',
                        selected === day.key ? 'selected' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => setSelected(day.key)}
                    >
                      <span>周{WEEK_LABELS[index]}</span>
                      <b>{day.day}</b>
                    </button>
                    <div className="cal-week-items">
                      {items.slice(0, 4).map((todo) => (
                        <button
                          key={todo.id}
                          className={`cal-week-item ${todo.done ? 'is-done' : ''}`}
                          style={{ '--note-color': todo.color } as CSSProperties}
                          title={todo.title}
                          onClick={() => onEdit(todo)}
                        >
                          {todo.title}
                        </button>
                      ))}
                      {items.length > 4 && <span className="cal-week-more">+{items.length - 4}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="calendar-day-detail">
            <div className="calendar-detail-head">
              <span>{dayTitle(selected)} · {selectedTodos.length} 条待办</span>
              <button className="link-button" onClick={() => onAddAt(selected)}><Plus size={12} /> 新建</button>
            </div>
            {selectedTodos.length ? (
              <div className="calendar-todo-list">
                {selectedTodos.map((todo) => (
                  <div className={`cal-todo-row ${todo.done ? 'is-done' : ''}`} key={todo.id}>
                    <button
                      className={`check-button ${todo.done ? 'checked' : ''}`}
                      onClick={() => onToggle(todo)}
                      title={todo.done ? '标记未完成' : '标记完成'}
                    >
                      {todo.done && <Check size={12} strokeWidth={3} />}
                    </button>
                    <button className="cal-todo-title" onClick={() => onEdit(todo)}>{todo.title}</button>
                    <span className={`priority priority-${todo.priority}`}>{PRIORITY_META[todo.priority].label}</span>
                    {todo.dueDate && dueTimeText(todo.dueDate) && (
                      <span className="meta-chip"><Clock size={10} /> {dueTimeText(todo.dueDate)}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">这一天还没有安排待办，点「新建」即可添加并自动带上日期。</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
