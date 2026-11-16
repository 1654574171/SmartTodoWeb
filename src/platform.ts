/** 运行时判断：android 由原生 WebView 与网页版在渲染前打标记，用于复用移动端界面。 */
export function isMobile(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.platform === 'android';
}

/** 纯浏览器网页版：界面沿用安卓版，但没有原生小组件、状态栏等能力。 */
export function isWebApp(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.shell === 'web';
}
