export function createLowCodeEventBus() {
    const subscribers = new Set();
    return {
        subscribe(subscriber) {
            subscribers.add(subscriber);
            return () => subscribers.delete(subscriber);
        },
        async publish(event) {
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
function readPayloadString(event, key) {
    const value = event.payload?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}
export function normalizeLowCodeDirectives(value) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === 'object' &&
            item !== null &&
            !Array.isArray(item) &&
            typeof item.type === 'string')
        : [];
}
export function runtimeEventMatchesHandler(event, handler) {
    if (handler.disabled)
        return false;
    if (handler.event !== '*' && handler.event !== event.name)
        return false;
    if (handler.blockId && handler.blockId !== event.blockId)
        return false;
    if (handler.blockKind && handler.blockKind !== event.blockKind)
        return false;
    if (handler.actionCode && handler.actionCode !== readPayloadString(event, 'actionCode')) {
        return false;
    }
    if (handler.field && handler.field !== readPayloadString(event, 'field')) {
        return false;
    }
    return true;
}
export function resolveEventDirectives(event, handlers = []) {
    const inlineDirectives = normalizeLowCodeDirectives(event.payload?.directives);
    const subscribedDirectives = handlers
        .filter((handler) => runtimeEventMatchesHandler(event, handler))
        .flatMap((handler) => handler.directives ?? []);
    return [...inlineDirectives, ...subscribedDirectives].filter((directive) => !directive.disabled);
}
