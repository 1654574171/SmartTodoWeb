import { createRoot } from 'react-dom/client';
import App from './App';
import NoteWindow from './components/NoteWindow';
import './styles.css';
import { initOverlayScrollbar } from './overlayScrollbar';
import { isMobile } from './platform';

const route = window.location.hash.replace(/^#\/?/, '');

function Root() {
  if (route.startsWith('note/')) return <NoteWindow id={decodeURIComponent(route.slice(5))} />;
  return <App />;
}

async function boot() {
  // Electron 由 preload 注入 window.api；原生 WebView 与纯浏览器分别初始化对应桥接。
  if (!(window as Window & { api?: unknown }).api) {
    const capacitor = (window as Window & {
      Capacitor?: { isNativePlatform?: () => boolean };
    }).Capacitor;
    if (capacitor?.isNativePlatform?.()) {
      const { initMobile } = await import('./mobile/bootstrap');
      await initMobile();
    } else {
      const { initWeb } = await import('./web/bootstrap');
      await initWeb();
    }
  }
  const container = document.getElementById('root');
  if (container) {
    // Android 使用原生触摸滚动与系统手势，桌面端才需要自定义浮层滚动条。
    if (!isMobile()) initOverlayScrollbar();
    createRoot(container).render(<Root />);
  }
}

void boot();
