import type {
  LowCodeEventHandler,
  LowCodeRuntimeDirective,
  LowCodeRuntimeEvent,
} from '~/types/lowcode';

export type LowCodeEventSubscriber = (
  event: LowCodeRuntimeEvent
) => void | Promise<void>;

export function createLowCodeEventBus() {
  const subscribers = new Set<LowCodeEventSubscriber>();

  return {
    subscribe(subscriber: LowCodeEventSubscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    async publish(event: LowCodeRuntimeEvent) {
      const normalizedEvent = {
        ...event,
        timestamp: event.timestamp ?? Date.now(),
        payload: event.payload ?? {},
      };

      await Promise.all([...subscribers].map((subscriber) => subscriber(normalizedEvent)));
    },
    clear() {
      subscribers.clear();
    },
  };
}

function readPayloadString(event: LowCodeRuntimeEvent, key: string) {
  const value = event.payload?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function normalizeLowCodeDirectives(value: unknown): LowCodeRuntimeDirective[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is LowCodeRuntimeDirective =>
          typeof item === 'object' &&
          item !== null &&
          !Array.isArray(item) &&
          typeof (item as { type?: unknown }).type === 'string'
      )
    : [];
}

export function runtimeEventMatchesHandler(
  event: LowCodeRuntimeEvent,
  handler: LowCodeEventHandler
) {
  if (handler.disabled) return false;
  if (handler.event !== '*' && handler.event !== event.name) return false;
  if (handler.blockId && handler.blockId !== event.blockId) return false;
  if (handler.blockKind && handler.blockKind !== event.blockKind) return false;
  if (handler.actionCode && handler.actionCode !== readPayloadString(event, 'actionCode')) {
    return false;
  }
  if (handler.field && handler.field !== readPayloadString(event, 'field')) {
    return false;
  }

  return true;
}

export function resolveEventDirectives(
  event: LowCodeRuntimeEvent,
  handlers: LowCodeEventHandler[] = []
) {
  const inlineDirectives = normalizeLowCodeDirectives(event.payload?.directives);
  const subscribedDirectives = handlers
    .filter((handler) => runtimeEventMatchesHandler(event, handler))
    .flatMap((handler) => handler.directives ?? []);

  return [...inlineDirectives, ...subscribedDirectives].filter(
    (directive) => !directive.disabled
  );
}
