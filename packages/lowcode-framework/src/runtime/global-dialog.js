import { reactive, shallowReactive, } from 'vue';
export const globalDialogInstances = shallowReactive([]);
export const globalDialogHostStack = shallowReactive([]);
let globalDialogSeed = 0;
let globalDialogHostSeed = 0;
function createDialogId(id) {
    if (id && !globalDialogInstances.some((dialog) => dialog.id === id)) {
        return id;
    }
    globalDialogSeed += 1;
    return `lc-global-dialog-${Date.now().toString(36)}-${globalDialogSeed}`;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function cloneValue(value) {
    if (!isRecord(value) && !Array.isArray(value))
        return value;
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch {
        return value;
    }
}
function createInitialModel(config) {
    const model = config.model ?? config.form?.model ?? {};
    return reactive(cloneValue(model));
}
function assignModel(target, value, replace = false) {
    if (replace) {
        Object.keys(target).forEach((key) => delete target[key]);
    }
    Object.assign(target, value);
}
export function findGlobalDialog(id) {
    return globalDialogInstances.find((dialog) => dialog.id === id);
}
export function createGlobalDialogContext(instance) {
    return {
        id: instance.id,
        model: instance.model,
        config: instance.config,
        close: (result) => closeGlobalDialog(instance.id, result),
        updateModel: (value) => assignModel(instance.model, value),
        setModel: (value) => assignModel(instance.model, value, true),
    };
}
export function openGlobalDialog(config) {
    const id = createDialogId(config.id);
    return new Promise((resolve) => {
        const instance = reactive({
            id,
            visible: true,
            config: {
                ...config,
                id,
            },
            model: createInitialModel(config),
            busyAction: '',
            createdAt: Date.now(),
            resolve,
        });
        globalDialogInstances.push(instance);
    });
}
export function updateGlobalDialog(id, patch) {
    const instance = findGlobalDialog(id);
    if (!instance)
        return false;
    instance.config = {
        ...instance.config,
        ...patch,
        id,
    };
    return true;
}
export async function closeGlobalDialog(id, result = {}) {
    const index = globalDialogInstances.findIndex((dialog) => dialog.id === id);
    if (index < 0)
        return;
    const [instance] = globalDialogInstances.splice(index, 1);
    instance.visible = false;
    const finalResult = {
        id,
        action: result.action ?? 'close',
        values: (result.values ?? cloneValue(instance.model)),
        payload: result.payload,
    };
    const context = createGlobalDialogContext(instance);
    if (finalResult.action === 'cancel') {
        await instance.config.onCancel?.(context);
    }
    await instance.config.onClose?.(finalResult, context);
    instance.resolve(finalResult);
}
export function closeAllGlobalDialogs(action = 'close') {
    return Promise.all([...globalDialogInstances].map((dialog) => closeGlobalDialog(dialog.id, {
        action,
    })));
}
export function registerGlobalDialogHost() {
    globalDialogHostSeed += 1;
    const hostId = `lc-global-dialog-host-${globalDialogHostSeed}`;
    globalDialogHostStack.push(hostId);
    return {
        hostId,
        unregister() {
            const index = globalDialogHostStack.indexOf(hostId);
            if (index >= 0) {
                globalDialogHostStack.splice(index, 1);
            }
        },
    };
}
export function isActiveGlobalDialogHost(hostId) {
    return globalDialogHostStack[globalDialogHostStack.length - 1] === hostId;
}
