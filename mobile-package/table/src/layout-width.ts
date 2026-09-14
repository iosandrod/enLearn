export type LayoutFrameDriver = {
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
};

export function createLayoutWidthScheduler(
  readCurrentWidth: () => number,
  commitWidth: (width: number) => void,
  frameDriver?: LayoutFrameDriver,
) {
  let frameHandle: number | undefined;
  let pendingWidth = 0;

  function flush() {
    frameHandle = undefined;
    if (Math.abs(readCurrentWidth() - pendingWidth) < 0.5) return;
    commitWidth(pendingWidth);
  }

  function schedule(width: unknown) {
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return;
    pendingWidth = width;

    if (!frameDriver) {
      flush();
      return;
    }

    // Hippy Web emits layout events from ResizeObserver. Commit on the next frame
    // so responsive style changes cannot feed back into the same observer cycle.
    if (frameHandle === undefined) frameHandle = frameDriver.request(flush);
  }

  function cancel() {
    if (frameHandle === undefined || !frameDriver) return;
    frameDriver.cancel(frameHandle);
    frameHandle = undefined;
  }

  return { cancel, schedule };
}

export function getWebLayoutFrameDriver(): LayoutFrameDriver | undefined {
  if (
    __PLATFORM__ !== 'web'
    || typeof window === 'undefined'
    || typeof window.requestAnimationFrame !== 'function'
  ) {
    return undefined;
  }

  return {
    request: (callback) => window.requestAnimationFrame(callback),
    cancel: (handle) => window.cancelAnimationFrame(handle),
  };
}
