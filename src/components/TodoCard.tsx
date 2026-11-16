import { useEffect, useRef, useState } from 'react';
import { Bell, CalendarDays, Check, Clock, Monitor, Pencil, Pin, Trash2 } from 'lucide-react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, TouchEvent } from 'react';
import { isMobile, isWebApp } from '../platform';
import type { Todo } from '../types';
import { PRIORITY_META, dueState, formatDateTime, formatDue } from '../types';

interface Props {
  todo: Todo;
  detached: boolean;
  allowDetach?: boolean;
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onPin: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onDetach: (todo: Todo) => void;
}

/** 同时只允许一张卡片展开操作区，展开新的会自动收起上一张。 */
let activeSwipeClose: (() => void) | null = null;

export default function TodoCard({ todo, detached, allowDetach = true, onToggle, onEdit, onPin, onDelete, onDetach }: Props) {
  const due = dueState(todo.dueDate);
  const style = { '--note-color': todo.color } as CSSProperties;
  const mobile = isMobile();
  const web = isWebApp();
  // 桌面浏览器没有触摸事件，用鼠标拖拽模拟左滑；触摸设备仍走原生 touch。
  const mouseSwipe = web && typeof window !== 'undefined' && !window.matchMedia?.('(pointer: coarse)').matches;

  const [open, setOpen] = useState(false);
  const [dragX, setDragX] = useState<number | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<() => void>(() => {});
  const dragRef = useRef<number | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<'none' | 'h' | 'v' | null>(null);
  const lastSwipeAt = useRef(0);

  useEffect(() => {
    if (!mobile) return;
    closeRef.current = () => { setOpen(false); setDragX(null); dragRef.current = null; };
    return () => {
      if (activeSwipeClose === closeRef.current) activeSwipeClose = null;
    };
  }, [mobile]);

  const actionsWidth = () => actionsRef.current?.offsetWidth || 144;

  function setSwipeOpen(next: boolean) {
    setOpen(next);
    setDragX(null);
    dragRef.current = null;
    if (next) {
      if (activeSwipeClose && activeSwipeClose !== closeRef.current) activeSwipeClose();
      activeSwipeClose = closeRef.current;
    } else if (activeSwipeClose === closeRef.current) {
      activeSwipeClose = null;
    }
  }

  function beginTrack(x: number, y: number) {
    startX.current = x;
    startY.current = y;
    axis.current = 'none';
  }

  function moveTrack(x: number, y: number) {
    if (axis.current === null) return;
    const dx = x - startX.current;
    const dy = y - startY.current;
    if (axis.current === 'none') {
      // 先判定方向：纵向手势交还给页面滚动，不抢滚动事件。
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (axis.current !== 'h') return;
    const width = actionsWidth();
    let next = (open ? -width : 0) + dx;
    if (next > 0) next *= 0.25;
    const min = -width - 24;
    if (next < min) next = min + (next - min) * 0.25;
    dragRef.current = next;
    setDragX(next);
  }

  function endTrack() {
    if (axis.current !== 'h') {
      axis.current = null;
      setDragX(null);
      dragRef.current = null;
      return;
    }
    const width = actionsWidth();
    const x = dragRef.current ?? (open ? -width : 0);
    // 滑动结束后浏览器可能补发一次 click，用短时窗抑制误触编辑。
    lastSwipeAt.current = Date.now();
    setSwipeOpen(x < -width / 2);
    axis.current = null;
  }

  function onTouchStart(event: TouchEvent<HTMLElement>) {
    if (!mobile || event.touches.length !== 1) return;
    beginTrack(event.touches[0].clientX, event.touches[0].clientY);
  }

  function onTouchMove(event: TouchEvent<HTMLElement>) {
    if (!mobile || event.touches.length !== 1) return;
    moveTrack(event.touches[0].clientX, event.touches[0].clientY);
  }

  function onTouchEnd() {
    if (mobile) endTrack();
  }

  function onMouseDown(event: ReactMouseEvent<HTMLElement>) {
    if (!mouseSwipe || event.button !== 0) return;
    beginTrack(event.clientX, event.clientY);
  }

  function onMouseMove(event: ReactMouseEvent<HTMLElement>) {
    if (mouseSwipe) moveTrack(event.clientX, event.clientY);
  }

  function onMouseEnd() {
    if (mouseSwipe) endTrack();
  }

  function handleCardClick() {
    if (Date.now() - lastSwipeAt.current < 350) {
      lastSwipeAt.current = 0;
      return;
    }
    if (open) {
      setSwipeOpen(false);
      return;
    }
    onEdit(todo);
  }

  const body = (
    <>
      <button
        className={`check-button ${todo.done ? 'checked' : ''}`}
        onClick={(event) => { event.stopPropagation(); onToggle(todo); }}
        title={todo.done ? '标记为未完成' : '标记为完成'}
      >
        {todo.done && <Check size={13} strokeWidth={3} />}
      </button>

      <div className="todo-body" onClick={mobile ? undefined : () => onEdit(todo)}>
        <div className="todo-title-row">
          <span className="todo-title">{todo.title || '未命名便签'}</span>
          {todo.pinned && <Pin size={12} className="pin-mark" fill="currentColor" />}
        </div>
        {todo.content && <p className="todo-excerpt">{todo.content}</p>}
        <div className="todo-meta">
          <span className={`priority priority-${todo.priority}`}>{PRIORITY_META[todo.priority].label}</span>
          {todo.dueDate && (
            <span className={`meta-chip ${!todo.done && due?.overdue ? 'danger' : ''}`}>
              <CalendarDays size={11} /> {formatDue(todo.dueDate)}
            </span>
          )}
          {!todo.done && due && (
            <span className={`meta-chip ${due.overdue ? 'danger' : ''}`}>
              <Clock size={11} /> {due.label}
            </span>
          )}
          {todo.remindAt && !todo.reminded && (
            <span className="meta-chip"><Bell size={11} /> 提醒 {formatDateTime(todo.remindAt)}</span>
          )}
          {todo.tags.map((tag) => (
            <span className="tag-chip" key={tag}>#{tag}</span>
          ))}
        </div>
      </div>
    </>
  );

  if (mobile) {
    const x = dragX ?? (open ? -actionsWidth() : 0);
    return (
      <article
        className={`todo-card swipe-card ${todo.done ? 'is-done' : ''} ${open ? 'is-swiped' : ''}`}
        style={style}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onMouseDown={mouseSwipe ? onMouseDown : undefined}
        onMouseMove={mouseSwipe ? onMouseMove : undefined}
        onMouseUp={mouseSwipe ? onMouseEnd : undefined}
        onMouseLeave={mouseSwipe ? onMouseEnd : undefined}
        onClick={handleCardClick}
      >
        <div className="swipe-actions" ref={actionsRef}>
          <button
            className={`swipe-action pin ${todo.pinned ? 'active' : ''}`}
            onClick={(event) => { event.stopPropagation(); onPin(todo); setSwipeOpen(false); }}
            title={todo.pinned ? '取消置顶' : '置顶'}
          >
            <Pin size={17} fill={todo.pinned ? 'currentColor' : 'none'} />
            <span>置顶</span>
          </button>
          <button
            className="swipe-action delete"
            onClick={(event) => { event.stopPropagation(); onDelete(todo); }}
            title="删除"
          >
            <Trash2 size={17} />
            <span>删除</span>
          </button>
        </div>
        <div
          className={`swipe-content ${dragX !== null ? 'is-dragging' : ''}`}
          style={{ transform: `translateX(${x}px)` }}
        >
          {body}
        </div>
      </article>
    );
  }

  return (
    <article className={`todo-card ${todo.done ? 'is-done' : ''}`} style={style}>
      {body}
      <div className="todo-actions">
        <button className={`icon-button ${todo.pinned ? 'active' : ''}`} title="置顶" onClick={() => onPin(todo)}>
          <Pin size={13} />
        </button>
        {allowDetach && (
          <button className={`icon-button ${detached ? 'active' : ''}`} title={detached ? '关闭独立窗口' : '独立窗口显示'} onClick={() => onDetach(todo)}>
            <Monitor size={13} />
          </button>
        )}
        <button className="icon-button" title="编辑" onClick={() => onEdit(todo)}>
          <Pencil size={13} />
        </button>
        <button className="icon-button danger" title="删除" onClick={() => onDelete(todo)}>
          <Trash2 size={13} />
        </button>
      </div>
    </article>
  );
}
