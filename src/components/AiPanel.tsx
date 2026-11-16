import { Bot, Check, FileText, Loader2, Plus, Sparkles, Wand2, X } from 'lucide-react';
import MarkdownLite from './MarkdownLite';
import type { AiItem, AiOrganizeResult } from '../types';
import { PRIORITY_META } from '../types';

export type AiReport =
  | { kind: 'organize'; data: AiOrganizeResult }
  | { kind: 'summary'; data: string };

interface Props {
  text: string;
  onText: (value: string) => void;
  items: AiItem[];
  selected: Set<string>;
  onToggleItem: (key: string) => void;
  onToggleAll: () => void;
  report: AiReport | null;
  busy: string | null;
  onAnalyze: () => void;
  onOrganize: () => void;
  onSummary: () => void;
  onAddSelected: () => void;
  onAddRaw: () => void;
  onApplyUpdates: () => void;
  onCopyReport: () => void;
  onClose: () => void;
}

function Spinner() {
  return <Loader2 size={14} className="spin" />;
}

export default function AiPanel(props: Props) {
  const {
    text, onText, items, selected, onToggleItem, onToggleAll, report, busy,
    onAnalyze, onOrganize, onSummary, onAddSelected, onAddRaw, onApplyUpdates,
    onCopyReport, onClose,
  } = props;

  return (
    <div className="panel-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="side-panel ai-panel">
        <header className="panel-header">
          <div>
            <span className="eyebrow">DEEPSEEK · AI WORKSPACE</span>
            <h2>智能工作台</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="关闭"><X size={17} /></button>
        </header>

        <div className="panel-scroll">
          <div className="ai-quick-grid">
            <button className="ai-quick" onClick={onOrganize} disabled={!!busy}>
              {busy === 'organize' ? <Spinner /> : <Wand2 size={16} />}<span>智能整理</span>
            </button>
            <button className="ai-quick" onClick={onSummary} disabled={!!busy}>
              {busy === 'summary' ? <Spinner /> : <FileText size={16} />}<span>分析总结</span>
            </button>
          </div>

          {busy && (
            <div className="busy-banner">
              <Bot size={14} />
              <span>DeepSeek 正在思考，请稍候…</span>
              <Loader2 size={13} className="spin" />
            </div>
          )}

          <div className="section-title"><Sparkles size={14} /> 文本</div>
          <textarea
            className="text-input textarea ai-textarea" rows={5}
            value={text}
            placeholder="粘贴会议记录、聊天内容或待办草稿，让 AI 帮你拆解…"
            onChange={(event) => onText(event.target.value)}
          />
          <div className="button-row">
            <button className="button primary" onClick={onAnalyze} disabled={!!busy || !text.trim()}>
              {busy === 'ai' ? <Spinner /> : <Sparkles size={14} />} 智能提取待办
            </button>
            <button className="button soft" onClick={onAddRaw} disabled={!text.trim()}>
              <Plus size={14} /> 存为原文便签
            </button>
          </div>

          {items.length > 0 && (
            <>
              <div className="section-title ai-list-title">
                <span>识别到 {items.length} 条任务（已选 {selected.size}）</span>
                <button className="link-button" onClick={onToggleAll}>
                  {selected.size === items.length ? '取消全选' : '全选'}
                </button>
              </div>
              <div className="ai-items">
                {items.map((item, index) => {
                  const key = String(index);
                  return (
                    <button
                      key={key}
                      className={`ai-item ${selected.has(key) ? 'selected' : ''}`}
                      onClick={() => onToggleItem(key)}
                    >
                      <span className="ai-check">{selected.has(key) && <Check size={11} strokeWidth={3} />}</span>
                      <span className="ai-item-body">
                        <b>{item.title}</b>
                        {item.content && <small>{item.content}</small>}
                        <span className="ai-item-meta">
                          <i className={`priority priority-${item.priority}`}>{PRIORITY_META[item.priority].label}</i>
                          {item.dueDate && <i>{item.dueDate}{item.dueTime ? ` ${item.dueTime}` : ''}</i>}
                          {item.tags.map((tag) => <i key={tag}>#{tag}</i>)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <button className="button primary full" onClick={onAddSelected} disabled={selected.size === 0}>
                <Plus size={15} /> 添加选中的 {selected.size} 条待办
              </button>
            </>
          )}

          {report && (
            <div className="report-card">
              <div className="report-head">
                <span><Bot size={14} /> {report.kind === 'organize' ? '整理建议' : '分析报告'}</span>
                <button className="link-button" onClick={onCopyReport}>复制</button>
              </div>
              {report.kind === 'organize' ? (
                <>
                  <p className="report-summary">{report.data.summary}</p>
                  {report.data.insights.length > 0 && (
                    <ul className="report-insights">
                      {report.data.insights.map((insight, index) => <li key={index}>{insight}</li>)}
                    </ul>
                  )}
                  <button className="button soft full" onClick={onApplyUpdates} disabled={report.data.updates.length === 0}>
                    <Wand2 size={14} /> 应用 {report.data.updates.length} 条调整建议
                  </button>
                </>
              ) : (
                <MarkdownLite text={report.data} />
              )}
            </div>
          )}

          {!items.length && !report && !busy && (
            <div className="empty-ai">
              <Bot size={26} />
              <p>让 AI 帮你把零散文字变成可执行的待办，<br />或一键梳理、总结当前所有便签。</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
