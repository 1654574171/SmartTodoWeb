/**
 * 全局浮层滚动指示条：滚动时淡入，停止滚动后淡出，纵向 / 横向都支持拖动。
 *
 * 只接管明确的横向输入（触控板横向手势、Shift + 滚轮），不再把普通纵向滚轮
 * 强行转换成横向滚动：否则鼠标停在标签栏上时主列表滚不动，滚到尽头还会
 * 突然变向，这是横向滚动最别扭的地方。横向指示条加粗并常驻于悬停期间，
 * 让只有纵向滚轮的用户也能直接抓住拖动。
 */
const MIN_THUMB = 28;
const MAX_THUMB = 56;
const HIDE_DELAY = 900;
const EDGE = 5;

type Axis = 'x' | 'y';

export function initOverlayScrollbar(): () => void {
  const thumb = document.createElement('div');
  thumb.className = 'overlay-scrollbar';
  document.body.appendChild(thumb);

  let container: HTMLElement | null = null;
  let axis: Axis = 'y';
  let trackSize = 0;
  let thumbSize = 0;
  let dragging = false;
  let dragStart = 0;
  let dragScrollStart = 0;
  let hideTimer = 0;
  let hoverHorizontal: HTMLElement | null = null;
  let hoverThumb = false;
  const lastOffsets = new WeakMap<HTMLElement, { top: number; left: number }>();

  const hide = () => thumb.classList.remove('is-visible', 'is-dragging', 'is-horizontal');

  const scheduleHide = () => {
    window.clearTimeout(hideTimer);
    if (dragging || hoverThumb || hoverHorizontal) return;
    hideTimer = window.setTimeout(hide, HIDE_DELAY);
  };

  const overflow = (el: HTMLElement) => ({
    x: el.scrollWidth - el.clientWidth,
    y: el.scrollHeight - el.clientHeight,
  });

  /** 找以横向滚动为主的祖先（标签栏）；纯纵向容器不接管。 */
  const horizontalAncestor = (node: HTMLElement | null): HTMLElement | null => {
    let el = node;
    while (el && el !== document.body) {
      const size = overflow(el);
      if (size.x >= 6 && (size.y < 6 || size.x > size.y)) return el;
      el = el.parentElement;
    }
    return null;
  };

  const scrollOffset = (el: HTMLElement): number =>
    axis === 'y' ? el.scrollTop : el.scrollLeft;

  const update = () => {
    if (!container) return;
    const el = container;
    if (!el.isConnected) {
      hide();
      return;
    }
    const rect = el.getBoundingClientRect();
    const size = overflow(el);
    const max = axis === 'y' ? size.y : size.x;
    if (max < 6 || rect.width < 16 || rect.height < 16) {
      hide();
      return;
    }

    const visible = axis === 'y' ? el.clientHeight : el.clientWidth;
    trackSize = Math.max(1, (axis === 'y' ? rect.height : rect.width) - EDGE * 2);
    thumbSize = Math.round(Math.min(MAX_THUMB, Math.max(MIN_THUMB, trackSize * (visible / (visible + max)))));
    const progress = Math.min(1, Math.max(0, scrollOffset(el) / max));
    const offset = EDGE + progress * (trackSize - thumbSize);

    thumb.classList.toggle('is-horizontal', axis === 'x');
    if (axis === 'y') {
      thumb.style.width = '5px';
      thumb.style.height = `${thumbSize}px`;
      thumb.style.left = `${Math.round(rect.right - 9)}px`;
      thumb.style.top = `${Math.round(rect.top + offset)}px`;
    } else {
      thumb.style.width = `${thumbSize}px`;
      thumb.style.height = '7px';
      thumb.style.left = `${Math.round(rect.left + offset)}px`;
      thumb.style.top = `${Math.round(rect.bottom - 12)}px`;
    }
    thumb.classList.add('is-visible');
    scheduleHide();
  };

  const onScroll = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target === document.documentElement || target === document.body) return;
    if (dragging && container && target !== container) return;

    // 用实际滚动方向决定显示哪根指示条，兼顾同时存在两个方向溢出的容器。
    const previous = lastOffsets.get(target) || { top: target.scrollTop, left: target.scrollLeft };
    const movedY = Math.abs(target.scrollTop - previous.top);
    const movedX = Math.abs(target.scrollLeft - previous.left);
    lastOffsets.set(target, { top: target.scrollTop, left: target.scrollLeft });
    const size = overflow(target);
    if (movedX > 0 && movedX >= movedY && size.x >= 6) axis = 'x';
    else if (movedY > 0 && size.y >= 6) axis = 'y';
    else axis = size.y >= 6 ? 'y' : 'x';

    container = target;
    update();
  };

  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target === thumb || thumb.contains(target)) return;
    const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
    if (!horizontalIntent) return;
    const el = horizontalAncestor(target);
    if (!el) return;
    const delta = event.shiftKey && Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;
    if (!delta) return;
    const before = el.scrollLeft;
    el.scrollLeft += delta;
    // 只在确实产生了横向滚动时才拦截，滚到尽头后纵滚轮可以正常滚动页面。
    if (el.scrollLeft === before) return;
    event.preventDefault();
    container = el;
    axis = 'x';
    update();
  };

  /** 横向容器在鼠标移入时预显示指示条，避免「要先滚动才看得到滚动条」。 */
  const onPointerOver = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target === thumb || thumb.contains(target)) return;
    const el = horizontalAncestor(target);
    if (el === hoverHorizontal) return;
    hoverHorizontal = el;
    if (el) {
      container = el;
      axis = 'x';
      update();
    } else {
      scheduleHide();
    }
  };

  const onThumbEnter = () => {
    hoverThumb = true;
    window.clearTimeout(hideTimer);
  };

  const onThumbLeave = () => {
    hoverThumb = false;
    scheduleHide();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!container || !thumb.classList.contains('is-visible')) return;
    event.preventDefault();
    dragging = true;
    window.clearTimeout(hideTimer);
    try { thumb.setPointerCapture(event.pointerId); } catch { /* 指针已释放时忽略 */ }
    dragStart = axis === 'y' ? event.clientY : event.clientX;
    dragScrollStart = scrollOffset(container);
    thumb.classList.add('is-dragging');
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging || !container) return;
    const delta = (axis === 'y' ? event.clientY : event.clientX) - dragStart;
    const max = axis === 'y'
      ? container.scrollHeight - container.clientHeight
      : container.scrollWidth - container.clientWidth;
    const next = dragScrollStart + (delta / Math.max(1, trackSize - thumbSize)) * max;
    if (axis === 'y') container.scrollTop = next;
    else container.scrollLeft = next;
  };

  const onPointerEnd = () => {
    if (!dragging) return;
    dragging = false;
    thumb.classList.remove('is-dragging');
    scheduleHide();
  };

  const onResize = () => {
    window.clearTimeout(hideTimer);
    if (hoverHorizontal) {
      container = hoverHorizontal;
      axis = 'x';
      update();
    } else {
      hide();
    }
  };

  document.addEventListener('scroll', onScroll, true);
  document.addEventListener('wheel', onWheel, { capture: true, passive: false });
  document.addEventListener('pointerover', onPointerOver, true);
  window.addEventListener('resize', onResize);
  thumb.addEventListener('pointerdown', onPointerDown);
  thumb.addEventListener('pointermove', onPointerMove);
  thumb.addEventListener('pointerup', onPointerEnd);
  thumb.addEventListener('pointercancel', onPointerEnd);
  thumb.addEventListener('pointerenter', onThumbEnter);
  thumb.addEventListener('pointerleave', onThumbLeave);

  return () => {
    window.clearTimeout(hideTimer);
    document.removeEventListener('scroll', onScroll, true);
    document.removeEventListener('wheel', onWheel, true);
    document.removeEventListener('pointerover', onPointerOver, true);
    window.removeEventListener('resize', onResize);
    thumb.remove();
  };
}
