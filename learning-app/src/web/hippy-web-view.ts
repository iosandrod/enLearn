import {
  NodeProps,
  View,
} from '@hippy/web-renderer';

type MouseSourceCapabilities = {
  firesTouchEvents?: boolean;
};

function cameFromTouchSource(event: MouseEvent) {
  const pointerType = 'pointerType' in event
    ? String((event as PointerEvent).pointerType)
    : '';
  const sourceCapabilities = (event as MouseEvent & {
    sourceCapabilities?: MouseSourceCapabilities;
  }).sourceCapabilities;

  return pointerType === 'touch'
    || Boolean(sourceCapabilities?.firesTouchEvents);
}

/**
 * Hippy 3.3.2 forces TouchInput for View taps, which leaves desktop mouse
 * clicks invisible to Vue. Preserve its touch recognizer and bridge native
 * mouse clicks into the same onClick event on Web.
 */
export class DesktopCompatibleView extends View {
  private nativeClickInstalled = false;

  private lastNativeTouchEnd = 0;

  private handleNativeTouchEnd = () => {
    this.lastNativeTouchEnd = Date.now();
  };

  private handleNativeClick = (event: MouseEvent) => {
    if (!this.onClick) return;
    if (
      cameFromTouchSource(event)
      || Date.now() - this.lastNativeTouchEnd < 500
    ) return;

    this.dispatchEvent(NodeProps.ON_CLICK, { srcEvent: event });
    event.stopPropagation();
  };

  private installNativeClickBridge() {
    if (this.nativeClickInstalled) return;
    this.nativeClickInstalled = true;
    this.dom.addEventListener('click', this.handleNativeClick);
    this.dom.addEventListener('touchend', this.handleNativeTouchEnd, { passive: true });
  }

  private removeNativeClickBridge() {
    if (!this.nativeClickInstalled) return;
    this.nativeClickInstalled = false;
    this.dom.removeEventListener('click', this.handleNativeClick);
    this.dom.removeEventListener('touchend', this.handleNativeTouchEnd);
  }

  override set onClick(value: unknown) {
    if (value) this.installNativeClickBridge();
    else this.removeNativeClickBridge();
    super.onClick = value;
  }

  override get onClick() {
    return super.onClick;
  }

  override async beforeRemove() {
    this.removeNativeClickBridge();
    await super.beforeRemove();
  }

  override destroy() {
    this.removeNativeClickBridge();
    super.destroy();
  }
}
