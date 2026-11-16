import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, CheckCircle2, LayoutGrid, ListTodo, Minus, Plus,
  Search, Settings, Sparkles, X,
} from 'lucide-react';
import { api } from './api';
import AiPanel from './components/AiPanel';
import type { AiReport } from './components/AiPanel';
import BrandLogo from './components/BrandLogo';
import CalendarPanel from './components/CalendarPanel';
import Editor from './components/Editor';
import SettingsPanel from './components/SettingsPanel';
import TodoCard from './components/TodoCard';
import { applyTheme } from './theme';
import { isMobile } from './platform';
import type {
  AiItem, AppState, FilterKey, Settings as AppSettings, SyncConfig, SyncConfigInput,
  SyncStatus, Todo,
} from './types';
import {
  DEFAULT_SETTINGS, FILTERS, NOTE_COLORS, activeTodos, createTodo, dueIso, errorMessage, touchTodo,
} from './types';

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const stateRef = useRef<AppState | null>(null);
  stateRef.current = state;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [editor, setEditor] = useState<Todo | 'new' | null>(null);
  const [editorDraft, setEditorDraft] = useState<Todo | null>(null);
  const [panel, setPanel] = useState<'settings' | 'ai' | 'calendar' | null>(null);
  const [openNotes, setOpenNotes] = useState<string[]>([]);

  const [aiText, setAiText] = useState('');
  const [aiItems, setAiItems] = useState<AiItem[]>([]);
  const [aiSelected, setAiSelected] = useState<Set<string>>(new Set());
  const [aiReport, setAiReport] = useState<AiReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const [toast, setToast] = useState('');
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const mobile = isMobile();
  const overlayRef = useRef<{
    editor: Todo | 'new' | null;
    panel: 'settings' | 'ai' | 'calendar' | null;
  }>({ editor: null, panel: null });
  overlayRef.current = { editor, panel };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (state) applyTheme(state.settings);
  }, [state?.settings]);

  const commitTodos = useCallback((updater: Todo[] | ((prev: Todo[]) => Todo[])) => {
    const prev = stateRef.current;
    if (!prev) return;
    const todos = typeof updater === 'function' ? updater(prev.todos) : updater;
    stateRef.current = { ...prev, todos };
    setState(stateRef.current);
    api.saveTodos(todos);
  }, []);

  const commitSettings = useCallback((patch: Partial<AppSettings>) => {
    const prev = stateRef.current;
    if (!prev) return;
    const settings = { ...prev.settings, ...patch };
    stateRef.current = { ...prev, settings };
    setState(stateRef.current);
    api.saveSettings(settings);
  }, []);

  const openNew = (draft: Todo | null = null) => {
    setEditorDraft(draft);
    setEditor('new');
    setPanel(null);
  };

  const runAnalyze = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setBusy('ai');
    setAiReport(null);
    setAiItems([]);
    try {
      const result = await api.aiFromText(text);
      setAiItems(result.items);
      setAiSelected(new Set(result.items.map((_item, index) => String(index))));
      if (!result.items.length) setToast('AI 未发现明确任务，可直接存为原文便签');
    } catch (error) {
      setToast(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api.getState().then((initial) => {
      if (!alive) return;
      const loaded: AppState = {
        todos: Array.isArray(initial.todos) ? initial.todos : [],
        settings: { ...DEFAULT_SETTINGS, ...initial.settings },
      };
      stateRef.current = loaded;
      setState(loaded);
    });
    api.getOpenNotes().then(setOpenNotes);
    api.syncGetConfig().then(setSyncConfig);
    api.syncGetStatus().then(setSyncStatus);

    const offs = [
      api.on('todos:updated', (todos) => {
        const prev = stateRef.current;
        if (!prev) return;
        stateRef.current = { ...prev, todos };
        setState(stateRef.current);
      }),
      api.on('settings:updated', (settings) => {
        const prev = stateRef.current;
        if (!prev) return;
        stateRef.current = { ...prev, settings };
        setState(stateRef.current);
      }),
      api.on('notes:changed', setOpenNotes),
      api.on('editor:open', (id) => {
        if (!id) openNew();
        else {
          const target = activeTodos(stateRef.current?.todos || []).find((todo) => todo.id === id);
          if (target) setEditor(target);
        }
        setPanel(null);
      }),
      api.on('widget:quick-add', (titles) => {
        // 桌面输入框创建的待办由原生队列暂存，这里写入正式数据并触发快照回写。
        const names = (titles || []).filter((name) => name.trim().length > 0);
        if (!names.length) return;
        commitTodos((prev) => [
          ...names.map((name) => createTodo({ title: name.trim().slice(0, 120) })),
          ...prev,
        ]);
        setToast(`已从桌面添加 ${names.length} 条待办`);
      }),
      api.on('sync:status', setSyncStatus),
      api.on('app:back', () => {
        const current = overlayRef.current;
        if (current.editor) {
          setEditor(null);
          setEditorDraft(null);
        } else if (current.panel) {
          setPanel(null);
        } else {
          void api.hideWindow();
        }
      }),
      api.on('toast', setToast),
      api.on('reminder:due', (todo) => setToast(`待办提醒：${todo.title}`)),
    ];
    // 事件监听已就绪，通知移动端小组件桥接可以消费「+ 号 / 列表项」动作。
    window.dispatchEvent(new Event('smarttodo:app-ready'));
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
  }, [runAnalyze]);

  const todos = state?.todos || [];
  const settings = state?.settings || DEFAULT_SETTINGS;
  const liveTodos = useMemo(() => activeTodos(todos), [todos]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    liveTodos.forEach((todo) => todo.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [liveTodos]);

  const visibleTodos = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const list = liveTodos.filter((todo) => {
      if (filter === 'active' && todo.done) return false;
      if (filter === 'done' && !todo.done) return false;
      if (filter === 'pinned' && !todo.pinned) return false;
      if (tagFilter && !todo.tags.includes(tagFilter)) return false;
      if (keyword) {
        const haystack = `${todo.title} ${todo.content} ${todo.tags.join(' ')}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });
    return list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.done !== b.done) return a.done ? 1 : -1;
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      if (aDue !== bDue) return aDue - bDue;
      if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [liveTodos, query, filter, tagFilter]);

  const stats = useMemo(() => {
    const done = liveTodos.filter((todo) => todo.done).length;
    const today = new Date().toDateString();
    const dueToday = liveTodos.filter(
      (todo) => !todo.done && todo.dueDate && new Date(todo.dueDate).toDateString() === today,
    ).length;
    return { total: liveTodos.length, done, active: liveTodos.length - done, dueToday, percent: liveTodos.length ? (done / liveTodos.length) * 100 : 0 };
  }, [liveTodos]);

  const upsertTodo = (todo: Todo) => {
    const saved = touchTodo(todo);
    commitTodos((prev) => (prev.some((item) => item.id === saved.id)
      ? prev.map((item) => (item.id === saved.id ? saved : item))
      : [saved, ...prev]));
    setEditor(null);
    setEditorDraft(null);
    setToast('便签已保存');
  };

  const removeTodo = (todo: Todo) => {
    const tombstone = touchTodo(todo, { deletedAt: new Date().toISOString() });
    commitTodos((prev) => prev.map((item) => (item.id === todo.id ? tombstone : item)));
    if (openNotes.includes(todo.id)) api.closeNote(todo.id);
    setEditor(null);
    setEditorDraft(null);
    setToast('便签已删除');
  };

  const toggleDone = (todo: Todo) => {
    const done = !todo.done;
    const now = new Date().toISOString();
    commitTodos((prev) => prev.map((item) => item.id === todo.id
      ? touchTodo(item, { done, completedAt: done ? now : null })
      : item));
  };

  const togglePin = (todo: Todo) => {
    commitTodos((prev) => prev.map((item) => item.id === todo.id
      ? touchTodo(item, { pinned: !item.pinned })
      : item));
  };

  const toggleDetach = (todo: Todo) => {
    if (openNotes.includes(todo.id)) {
      api.closeNote(todo.id);
      setToast('已关闭独立窗口');
    } else {
      api.openNote(todo.id);
      setToast('便签已在新窗口显示');
    }
  };

  const addSelectedItems = () => {
    const chosen = aiItems.filter((_item, index) => aiSelected.has(String(index)));
    if (!chosen.length) return;
    const created = chosen.map((item, index) => createTodo({
      title: item.title,
      content: item.content,
      priority: item.priority,
      tags: item.tags,
      dueDate: dueIso(item.dueDate, item.dueTime),
      color: NOTE_COLORS[index % NOTE_COLORS.length],
    }));
    commitTodos((prev) => [...created, ...prev]);
    setAiItems([]);
    setAiSelected(new Set());
    setAiText('');
    setToast(`已添加 ${created.length} 条待办`);
  };

  const addRawNote = () => {
    const raw = aiText.trim();
    if (!raw) return;
    const title = raw.split('\n')[0].slice(0, 40) || '文本便签';
    commitTodos((prev) => [createTodo({ title, content: raw }), ...prev]);
    setAiText('');
    setAiItems([]);
    setToast('已保存原文便签');
  };

  const runOrganize = async () => {
    const current = activeTodos(stateRef.current?.todos || []);
    if (!current.length) { setToast('还没有便签可以整理'); return; }
    setPanel('ai');
    setBusy('organize');
    setAiReport(null);
    try {
      const data = await api.aiOrganize(current);
      setAiReport({ kind: 'organize', data });
    } catch (error) {
      setToast(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const runSummary = async () => {
    const current = activeTodos(stateRef.current?.todos || []);
    if (!current.length) { setToast('还没有便签可以总结'); return; }
    setPanel('ai');
    setBusy('summary');
    setAiReport(null);
    try {
      const data = await api.aiSummary(current);
      setAiReport({ kind: 'summary', data });
    } catch (error) {
      setToast(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const applyUpdates = () => {
    if (aiReport?.kind !== 'organize') return;
    const updates = new Map(aiReport.data.updates.map((item) => [item.id, item]));
    const now = new Date().toISOString();
    commitTodos((prev) => prev.map((todo) => {
      const update = updates.get(todo.id);
      if (!update) return todo;
      return {
        ...todo,
        ...(update.title ? { title: update.title } : {}),
        ...(update.priority ? { priority: update.priority } : {}),
        ...(update.tags ? { tags: update.tags } : {}),
        ...(update.dueDate !== undefined ? { dueDate: dueIso(update.dueDate) } : {}),
        updatedAt: now,
      };
    }));
    setToast(`已应用 ${updates.size} 条整理建议`);
  };

  const copyReport = () => {
    if (!aiReport) return;
    const content = aiReport.kind === 'summary'
      ? aiReport.data
      : `${aiReport.data.summary}\n${aiReport.data.insights.join('\n')}`;
    navigator.clipboard?.writeText(content);
    setToast('已复制到剪贴板');
  };

  const addAtDate = (key: string) => {
    openNew(createTodo({ dueDate: dueIso(key) }));
  };

  const testApi = async () => {
    setTesting(true);
    try {
      const result = await api.aiTest();
      setToast(result.message);
    } catch (error) {
      setToast(errorMessage(error));
    } finally {
      setTesting(false);
    }
  };

  const exportData = async () => {
    try {
      const result = await api.exportData();
      if (result.ok) setToast('备份已导出');
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  const importData = async () => {
    try {
      const imported = await api.importData();
      if (imported) setToast(`已导入 ${imported.length} 条便签`);
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  const syncConfigure = async (input: SyncConfigInput) => {
    try {
      const result = await api.syncConfigure(input);
      setToast(result.message);
      setSyncConfig(await api.syncGetConfig());
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  const syncTest = async (input: SyncConfigInput) => {
    try {
      const result = await api.syncTest(input);
      setToast(result.message);
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  const syncNow = async () => {
    try {
      const result = await api.syncNow();
      setToast(result.message);
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  const syncDisable = async () => {
    try {
      await api.syncDisable();
      setSyncConfig(await api.syncGetConfig());
      setToast('已断开坚果云同步，本机数据保留');
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  if (!state) {
    return <div className="app-shell loading-shell"><BrandLogo size={30} /><span>正在加载便签…</span></div>;
  }

  return (
    <div className="app-shell">
      <header className="titlebar drag">
        <div className="brand">
          <span className="brand-logo"><BrandLogo size={19} /></span>
          <div className="brand-text"><b>SmartTodo</b><small>轻巧便签 · 智能待办</small></div>
        </div>
        <div className="titlebar-actions no-drag">
          <button className="icon-button" title="AI 工作台" onClick={() => setPanel('ai')}><Sparkles size={16} /></button>
          <button className="icon-button" title="设置" onClick={() => setPanel('settings')}><Settings size={16} /></button>
          {!mobile && <button className="icon-button" title="隐藏到系统托盘" onClick={() => api.minimizeWindow()}><Minus size={16} /></button>}
        </div>
      </header>

      <section className="stats">
        <div className="stats-line">
          <span><b>{stats.active}</b> 待办</span>
          <span><b>{stats.done}</b> 已完成</span>
          <span className={stats.dueToday ? 'accent-text' : ''}><b>{stats.dueToday}</b> 今日到期</span>
          <span className="stats-percent">{Math.round(stats.percent)}%</span>
        </div>
        <div className="progress-track"><i style={{ width: `${stats.percent}%` }} /></div>
      </section>

      <div className="search-row">
        <Search size={15} />
        <input value={query} placeholder="搜索标题、内容、标签…" onChange={(event) => setQuery(event.target.value)} />
        {query && <button className="icon-button tiny" onClick={() => setQuery('')}><X size={13} /></button>}
      </div>

      <nav className="tabs">
        {FILTERS.map((item) => (
          <button key={item.key} className={filter === item.key ? 'active' : ''} onClick={() => setFilter(item.key)}>
            {item.label}
          </button>
        ))}
      </nav>

      {allTags.length > 0 && (
        <div className="tag-filter no-scrollbar">
          <button className={`filter-chip ${!tagFilter ? 'active' : ''}`} onClick={() => setTagFilter(null)}>
            <LayoutGrid size={11} /> 全部标签
          </button>
          {allTags.map(([tag, count]) => (
            <button key={tag} className={`filter-chip ${tagFilter === tag ? 'active' : ''}`} onClick={() => setTagFilter(tagFilter === tag ? null : tag)}>
              #{tag} <i>{count}</i>
            </button>
          ))}
        </div>
      )}

      <main className="todo-list no-scrollbar">
        {visibleTodos.length ? visibleTodos.map((todo) => (
          <TodoCard
            key={todo.id}
            todo={todo}
            detached={openNotes.includes(todo.id)}
            allowDetach={!mobile}
            onToggle={toggleDone}
            onEdit={setEditor}
            onPin={togglePin}
            onDelete={removeTodo}
            onDetach={toggleDetach}
          />
        )) : (
          <div className="empty-state">
            <div className="empty-icon"><ListTodo size={26} /></div>
            <h3>{liveTodos.length ? '没有符合条件的便签' : '开始你的第一张便签'}</h3>
            <p>{liveTodos.length ? '换个关键词或筛选条件试试' : '记录灵感、安排任务，或粘贴文字让 AI 帮你拆解'}</p>
            {!liveTodos.length && <button className="button primary" onClick={() => openNew()}><Plus size={15} /> 新建便签</button>}
          </div>
        )}
      </main>

      <footer className="toolbar">
        <button className="tool-button new-button" onClick={() => openNew()} title={mobile ? '新建便签' : '新建便签 (Ctrl+Alt+N)'}><Plus size={17} /></button>
        <button className="tool-button" title="日历（周 / 月）" onClick={() => setPanel('calendar')}><CalendarDays size={17} /></button>
      </footer>

      {editor && (
        <Editor
          key={editor === 'new' ? (editorDraft?.id || 'new') : editor.id}
          value={editor}
          initialDraft={editorDraft}
          onSave={upsertTodo}
          onDelete={(id) => {
            const target = liveTodos.find((todo) => todo.id === id);
            if (target) removeTodo(target);
          }}
          onClose={() => { setEditor(null); setEditorDraft(null); }}
        />
      )}

      {panel === 'settings' && (
        <SettingsPanel
          settings={settings}
          onChange={commitSettings}
          onTest={testApi}
          onExport={exportData}
          onImport={importData}
          onClose={() => setPanel(null)}
          testing={testing}
          syncConfig={syncConfig}
          syncStatus={syncStatus}
          onSyncConfigure={syncConfigure}
          onSyncTest={syncTest}
          onSyncNow={syncNow}
          onSyncDisable={syncDisable}
        />
      )}

      {panel === 'calendar' && (
        <CalendarPanel
          todos={liveTodos}
          onEdit={(todo) => { setPanel(null); setEditor(todo); }}
          onToggle={toggleDone}
          onAddAt={addAtDate}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === 'ai' && (
        <AiPanel
          text={aiText}
          onText={setAiText}
          items={aiItems}
          selected={aiSelected}
          onToggleItem={(key) => setAiSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
          })}
          onToggleAll={() => setAiSelected((prev) => prev.size === aiItems.length ? new Set() : new Set(aiItems.map((_item, i) => String(i))))}
          report={aiReport}
          busy={busy}
          onAnalyze={() => runAnalyze(aiText)}
          onOrganize={runOrganize}
          onSummary={runSummary}
          onAddSelected={addSelectedItems}
          onAddRaw={addRawNote}
          onApplyUpdates={applyUpdates}
          onCopyReport={copyReport}
          onClose={() => setPanel(null)}
        />
      )}

      {toast && <div className="toast"><CheckCircle2 size={14} /> {toast}</div>}
    </div>
  );
}
