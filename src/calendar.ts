import type { Todo } from './types';

export const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export interface CalendarDay {
  key: string;
  date: Date;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
}

export function dateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + amount);
  return next;
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function startOfWeek(date: Date): Date {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (day.getDay() + 6) % 7;
  return addDays(day, -offset);
}

function makeDay(date: Date, inMonth: boolean): CalendarDay {
  const today = new Date();
  const weekday = date.getDay();
  return {
    key: dateKey(date),
    date,
    day: date.getDate(),
    inMonth,
    isToday: dateKey(date) === dateKey(today),
    isWeekend: weekday === 0 || weekday === 6,
  };
}

export function monthGrid(anchor: Date): CalendarDay[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_unused, index) => {
    const date = addDays(start, index);
    return makeDay(date, date.getMonth() === anchor.getMonth() && date.getFullYear() === anchor.getFullYear());
  });
}

export function weekDays(anchor: Date): CalendarDay[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_unused, index) => makeDay(addDays(start, index), true));
}

export function todosOn(todos: Todo[], key: string): Todo[] {
  return todos
    .filter((todo) => todo.dueDate && dateKey(new Date(todo.dueDate)) === key)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return new Date(a.dueDate as string).getTime() - new Date(b.dueDate as string).getTime();
    });
}

export function monthTitle(anchor: Date): string {
  return `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`;
}

export function weekTitle(anchor: Date): string {
  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  const format = (date: Date) => `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${format(start)} - ${format(end)}`;
}

export function dayTitle(key: string): string {
  const date = fromKey(key);
  return `${date.getMonth() + 1}月${date.getDate()}日 · 周${WEEK_LABELS[(date.getDay() + 6) % 7]}`;
}
