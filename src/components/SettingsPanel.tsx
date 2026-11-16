import { useEffect, useState } from 'react';
import {
  Bell, Cloud, Download, Eye, EyeOff, Keyboard, LayoutGrid, Monitor, Palette, RefreshCw,
  SlidersHorizontal, Upload, X, Zap,
} from 'lucide-react';
import { api } from '../api';
import { isMobile, isWebApp } from '../platform';
import type { WidgetStatus } from '../mobile/widget';
import type { Settings, SyncConfig, SyncConfigInput, SyncStatus, ThemeName } from '../types';
import { ACCENTS, THEMES } from '../types';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onTest: () => void;
  onExport: () => void;
  onImport: () => void;
  onClose: () => void;
  testing: boolean;
  syncConfig: SyncConfig | null;
  syncStatus: SyncStatus | null;
  onSyncConfigure: (input: SyncConfigInput) => void;
  onSyncTest: (input: SyncConfigInput) => void;
  onSyncNow: () => void;
  onSyncDisable: () => void;
}

const SYNC_STATE_LABEL: Record<string, string> = {
  off: '未配置', idle: '已连接', syncing: '同步中', error: '异常', offline: '离线',
};

export default function SettingsPanel({
  settings, onChange, onTest, onExport, onImport, onClose, testing,
  syncConfig, syncStatus, onSyncConfigure, onSyncTest, onSyncNow, onSyncDisable,
}: Props) {
  const mobile = isMobile();
  const web = isWebApp();
  const [showKey, setShowKey] = useState(false);
  const [notificationState, setNotificationState] = useState<NotificationPermission | 'unsupported'>(
    () => api.notificationPermission?.() || 'unsupported',
  );
  const [notificationMessage, setNotificationMessage] = useState('');

  async function enableNotifications(): Promise<void> {
    const result = await api.requestNotifications?.();
    setNotificationState(api.notificationPermission?.() || 'unsupported');
    if (result) setNotificationMessage(result.message);
  }
  const [showSyncPassword, setShowSyncPassword] = useState(false);
  const [syncForm, setSyncForm] = useState<SyncConfigInput>({
    email: '', password: '', remoteDir: 'SmartTodo', autoSync: true, intervalMin: 2,
  });

  useEffect(() => {
    if (!syncConfig) return;
    setSyncForm((prev) => ({
      ...prev,
      email: syncConfig.email,
      password: syncConfig.password,
      remoteDir: syncConfig.remoteDir,
      autoSync: syncConfig.autoSync,
      intervalMin: syncConfig.intervalMin,
      baseUrl: syncConfig.baseUrl || '',
    }));
  }, [syncConfig]);

  const [widgetStatus, setWidgetStatus] = useState<WidgetStatus | null>(null);
  const [widgetMessage, setWidgetMessage] = useState('');

  async function refreshWidgetStatus(): Promise<void> {
    if (!mobile || web) return;
    const { getWidgetStatus } = await import('../mobile/widget');
    setWidgetStatus(await getWidgetStatus());
  }

  useEffect(() => {
    if (!mobile || web) return;
    let cancelled = false;
    void (async () => {
      try {
        const { getWidgetStatus } = await import('../mobile/widget');
        const status = await getWidgetStatus();
        if (!cancelled) setWidgetStatus(status);
      } catch (error) {
        console.warn('[mobile] 小组件自检失败', error);
      }
    })();
    return () => { cancelled = true; };
  }, [mobile, web]);

  async function handlePinWidget(): Promise<void> {
    try {
      const { requestPinWidget } = await import('../mobile/widget');
      const result = await requestPinWidget();
      setWidgetMessage(result.error
        || (result.requested
          ? '已向桌面发起添加请求，请在弹出的确认框中点「添加」。'
          : '桌面未接受添加请求，请改用手动路径添加。'));
      await refreshWidgetStatus();
    } catch (error) {
      setWidgetMessage(`添加失败：${String(error)}`);
    }
  }

  return (
    <div className="panel-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="side-panel">
        <header className="panel-header">
          <div>
            <span className="eyebrow">PREFERENCES</span>
            <h2>设置</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="关闭"><X size={17} /></button>
        </header>

        <div className="panel-scroll">
          <div className="section-title"><Palette size={14} /> 外观主题</div>
          <div className="theme-grid">
            {THEMES.map((theme) => (
              <button
                key={theme.key}
                className={`theme-card ${settings.theme === theme.key ? 'selected' : ''}`}
                data-theme-preview={theme.key}
                onClick={() => onChange({ theme: theme.key as ThemeName, accent: theme.accent })}
              >
                <span className="theme-swatch" style={{ background: theme.accent }} />
                <span>{theme.label}</span>
              </button>
            ))}
          </div>

          <div className="section-title"><SlidersHorizontal size={14} /> 强调色</div>
          <div className="color-row">
            {ACCENTS.map((color) => (
              <button
                key={color}
                className={`color-dot ${settings.accent === color ? 'selected' : ''}`}
                style={{ background: color }}
                onClick={() => onChange({ accent: color })}
              >
                {settings.accent === color && <span className="dot-check">✓</span>}
              </button>
            ))}
          </div>

          {!mobile && (
            <label className="slider-row">
              <span>面板透明度 <b>{Math.round(settings.opacity * 100)}%</b></span>
              <input
                type="range" min={30} max={100} step={1}
                value={Math.round(settings.opacity * 100)}
                onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })}
              />
            </label>
          )}
          <label className="slider-row">
            <span>字号 <b>{settings.fontScale.toFixed(2)}×</b> <small>0.9× – 2.5×</small></span>
            <input
              type="range" min={90} max={250} step={5}
              value={Math.round(settings.fontScale * 100)}
              onChange={(event) => onChange({ fontScale: Number(event.target.value) / 100 })}
            />
          </label>

          {!mobile && (
            <>
              <div className="section-title"><Monitor size={14} /> 窗口行为</div>
              <p className="hint">主面板为普通窗口，不会强制置顶，也不占用任务栏按钮。点标题栏「—」隐藏到系统托盘；单击托盘图标或按 Ctrl+Alt+T 可随时显示窗口。</p>
            </>
          )}

          <div className="section-title"><Zap size={14} /> DeepSeek 智能能力</div>
          <label className="field">
            <span className="field-label">API Key</span>
            <div className="input-with-action">
              <input
                className="text-input" type={showKey ? 'text' : 'password'}
                value={settings.apiKey} placeholder="sk-..."
                onChange={(event) => onChange({ apiKey: event.target.value })}
              />
              <button className="icon-button" onClick={() => setShowKey((v) => !v)} title="显示 / 隐藏">
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field-label">接口地址</span>
              <input className="text-input" value={settings.apiBase} onChange={(event) => onChange({ apiBase: event.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">模型</span>
              <input className="text-input" value={settings.model} onChange={(event) => onChange({ model: event.target.value })} />
            </label>
          </div>
          <button className="button soft full" onClick={onTest} disabled={testing}>
            {testing ? <RefreshCw size={14} className="spin" /> : <Zap size={14} />}
            {testing ? '正在测试…' : '测试连接'}
          </button>
          <p className="hint">
            {web
              ? '密钥仅保存在当前浏览器，请求直接发往所填 API 地址；若浏览器拦截跨域请求，请配置同源代理。'
              : mobile
                ? '密钥仅保存在本机应用数据，请求由应用直接发往 DeepSeek，不经过第三方。'
                : '密钥仅保存在本机用户数据目录，请求由主进程直接发往 DeepSeek，不经过第三方。'}
          </p>

          {!mobile && (
            <>
              <div className="section-title"><Keyboard size={14} /> 全局快捷键</div>
              <div className="shortcut-list">
                <span><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> 新建便签</span>
                <span><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd> 显示 / 隐藏</span>
              </div>
            </>
          )}

          <div className="section-title"><Cloud size={14} /> 坚果云同步</div>
          <p className="hint">每台设备只写自己的快照文件，云端按记录自动合并；仅同步待办，API Key 等本机设置与应用密码都不上云。</p>
          <label className="field">
            <span className="field-label">坚果云账号（邮箱）</span>
            <input
              className="text-input" value={syncForm.email} placeholder="name@example.com"
              onChange={(event) => setSyncForm({ ...syncForm, email: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">应用密码</span>
            <div className="input-with-action">
              <input
                className="text-input" type={showSyncPassword ? 'text' : 'password'}
                value={syncForm.password} placeholder="在坚果云「安全选项 → 添加应用密码」生成"
                onChange={(event) => setSyncForm({ ...syncForm, password: event.target.value })}
              />
              <button className="icon-button" onClick={() => setShowSyncPassword((v) => !v)} title="显示 / 隐藏">
                {showSyncPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field-label">云端目录</span>
              <input
                className="text-input" value={syncForm.remoteDir}
                onChange={(event) => setSyncForm({ ...syncForm, remoteDir: event.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">间隔（分钟）</span>
              <input
                className="text-input" type="number" min={1} max={120} value={syncForm.intervalMin}
                onChange={(event) => setSyncForm({ ...syncForm, intervalMin: Number(event.target.value) || 2 })}
              />
            </label>
          </div>
          {web && (
            <label className="field">
              <span className="field-label">WebDAV 代理地址</span>
              <input
                className="text-input" value={syncForm.baseUrl || ''}
                placeholder="https://dav.jianguoyun.com/dav 或 /dav"
                onChange={(event) => setSyncForm({ ...syncForm, baseUrl: event.target.value })}
              />
            </label>
          )}
          <p className="hint">
            {web
              ? '网站已内置同源代理 /dav，一般无需修改。若部署到非 Netlify 平台，请在此填自己的代理路径（需转发到坚果云 WebDAV，并放行 Authorization 头与 GET / PUT / DELETE / MKCOL 方法）。'
              : '目录必须是坚果云中已存在的同步文件夹。桌面端会自动创建；安卓端请先在坚果云网页端创建同名文件夹，或先在桌面端完成一次同步。'}
          </p>
          <label className="field">
            <span className="field-label">自动同步</span>
            <select
              className="text-input" value={syncForm.autoSync ? 'on' : 'off'}
              onChange={(event) => setSyncForm({ ...syncForm, autoSync: event.target.value === 'on' })}
            >
              <option value="on">开启（后台定时同步）</option>
              <option value="off">关闭（仅手动同步）</option>
            </select>
          </label>
          <div className="sync-state">
            <span className={`sync-dot state-${syncStatus?.state || 'off'}`} />
            <b>{SYNC_STATE_LABEL[syncStatus?.state || 'off']}</b>
            <span>{syncStatus?.message || '未配置'}</span>
            {syncStatus?.lastSyncAt && <i>上次同步 {new Date(syncStatus.lastSyncAt).toLocaleString()}</i>}
          </div>
          <div className="button-row">
            <button className="button soft" onClick={() => onSyncTest(syncForm)}>测试连接</button>
            <button className="button primary" onClick={() => onSyncConfigure(syncForm)}>保存并同步</button>
            <button className="button soft" onClick={onSyncNow}><RefreshCw size={14} /> 立即同步</button>
            <button
              className="button soft" disabled={!syncConfig?.configured}
              onClick={() => { setSyncForm((prev) => ({ ...prev, password: '' })); onSyncDisable(); }}
            >
              断开
            </button>
          </div>
          <p className="hint">
            {web ? '应用密码仅保存在当前浏览器' : mobile ? '应用密码仅保存在本机应用数据' : '应用密码用系统加密单独保存'}，不会写入导出备份。填写后会一直保留在输入框中（默认隐藏），修改其它设置无需重输；点「断开」才会删除本机已保存的密码。
          </p>

          {mobile && !web && (
            <>
              <div className="section-title"><LayoutGrid size={14} /> 桌面小组件</div>
              <div className="sync-state">
                <span className={`sync-dot state-${widgetStatus?.installed ? 'idle' : 'error'}`} />
                <b>{widgetStatus === null ? '检测中…' : widgetStatus.installed ? '系统已识别小组件' : '系统未识别小组件'}</b>
                <span>{widgetStatus ? `已添加 ${widgetStatus.active} 个` : ''}</span>
              </div>
              <div className="button-row">
                <button className="button soft" onClick={() => void refreshWidgetStatus()}>重新检测</button>
                <button
                  className="button primary"
                  disabled={!widgetStatus?.pinSupported}
                  onClick={() => void handlePinWidget()}
                >
                  <LayoutGrid size={14} /> 添加到桌面
                </button>
              </div>
              {widgetMessage && <p className="hint">{widgetMessage}</p>}
              <p className="hint">
                小米 HyperOS 把小组件分成两个池子：「小部件中心」只展示通过小米审核上架的小部件，标准安卓组件归到弱化的「安卓小部件」分类。若上面显示「已识别」但桌面列表里找不到，请长按桌面空白处 →「添加工具 / 小部件」→ 右上角搜索 → 在应用列表或底部找「安卓小部件」分类，搜索 SmartTodo。
              </p>
              <p className="hint">
                {widgetStatus?.pinSupported
                  ? '点「添加到桌面」可直接请桌面放置组件，不必进小部件列表；部分小米桌面不支持该能力，此时请用上面的手动路径。'
                  : '当前桌面不支持应用内添加，请使用上面的手动路径。'}
              </p>
            </>
          )}

          {web && (
            <>
              <div className="section-title"><Bell size={14} /> 到点提醒</div>
              <div className="sync-state">
                <span className={`sync-dot state-${notificationState === 'granted' ? 'idle' : 'off'}`} />
                <b>
                  {notificationState === 'granted'
                    ? '系统通知已开启'
                    : notificationState === 'denied'
                      ? '通知权限被拒绝'
                      : notificationState === 'unsupported'
                        ? '当前浏览器不支持通知'
                        : '系统通知未开启'}
                </b>
              </div>
              {notificationState === 'granted' ? (
                <p className="hint">页面打开期间会弹出系统通知；关闭页面后提醒不会送达，届时仍会在页内提示。</p>
              ) : (
                <>
                  <p className="hint">到点提醒需要浏览器通知权限。点击下方按钮授权；若浏览器拦截，请在地址栏的通知设置中改为允许。</p>
                  <div className="button-row">
                    <button className="button soft" onClick={() => void enableNotifications()}>
                      <Bell size={14} /> 开启通知
                    </button>
                  </div>
                </>
              )}
              {notificationMessage && <p className="hint">{notificationMessage}</p>}
            </>
          )}

          <div className="section-title"><Download size={14} /> 数据管理</div>
          <div className="button-row">
            <button className="button soft" onClick={onExport}><Download size={14} /> 导出备份</button>
            <button className="button soft" onClick={onImport}><Upload size={14} /> 导入数据</button>
          </div>
          <p className="hint">
            {web
              ? '数据保存在当前浏览器中；导出会下载 JSON 文件，可与其他端互通。'
              : mobile
                ? '数据保存在本机应用数据中；导出会写入应用 Documents，并尝试复制到剪贴板。'
                : '数据保存在本机 JSON 文件中，退出托盘图标可完全关闭程序。'}
          </p>
        </div>
      </section>
    </div>
  );
}
