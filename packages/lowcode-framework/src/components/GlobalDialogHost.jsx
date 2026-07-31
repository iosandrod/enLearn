import { Fragment, defineComponent, h, resolveComponent, unref, } from 'vue';
import LowCodeForm from './LowCodeForm.vue';
import LowCodeGrid from './LowCodeGrid.vue';
import { closeGlobalDialog, createGlobalDialogContext, globalDialogInstances, } from '../runtime/global-dialog';
import '../styles/global-dialog.scss';
function readValue(value, fallback) {
    const resolved = unref(value);
    return typeof resolved === 'undefined' ? fallback : resolved;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function resolveProps(props = {}) {
    return Object.fromEntries(Object.entries(props).map(([key, value]) => [key, unref(value)]));
}
function toHandlerKey(eventName) {
    if (/^on[A-Z]/.test(eventName))
        return eventName;
    const normalized = eventName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return `on${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}
function mapEvents(events = {}) {
    return Object.fromEntries(Object.entries(events).map(([eventName, handler]) => [toHandlerKey(eventName), handler]));
}
function isActionResultObject(result) {
    return isRecord(result);
}
function shouldStayOpen(result) {
    return result === false || (isActionResultObject(result) && result.close === false);
}
function buildCloseResult(instance, action, result) {
    return {
        id: instance.id,
        action: isActionResultObject(result) && result.action ? result.action : action.code,
        values: isActionResultObject(result) && result.values
            ? result.values
            : instance.model,
        payload: isActionResultObject(result) ? result.payload : undefined,
    };
}
async function handleDialogAction(instance, action) {
    if (readValue(action.disabled, false))
        return;
    instance.busyAction = action.code;
    try {
        const context = createGlobalDialogContext(instance);
        const actionResult = await action.onClick?.(context, action);
        if (shouldStayOpen(actionResult))
            return;
        if (action.role === 'cancel' || action.code === 'cancel') {
            await closeGlobalDialog(instance.id, {
                action: action.code,
                values: instance.model,
                payload: isActionResultObject(actionResult) ? actionResult.payload : undefined,
            });
            return;
        }
        if (action.role === 'confirm' || action.code === 'confirm') {
            const confirmResult = await instance.config.onConfirm?.(context);
            if (shouldStayOpen(confirmResult))
                return;
            await closeGlobalDialog(instance.id, buildCloseResult(instance, action, confirmResult ?? actionResult));
            return;
        }
        await instance.config.onAction?.(action, context);
        if (action.closeOnClick ||
            (isActionResultObject(actionResult) && actionResult.close === true)) {
            await closeGlobalDialog(instance.id, buildCloseResult(instance, action, actionResult));
        }
    }
    finally {
        instance.busyAction = '';
    }
}
function renderAction(instance, action) {
    return h(resolveComponent('vxe-button'), {
        key: action.code,
        status: action.status,
        disabled: readValue(action.disabled, false),
        loading: readValue(action.loading, false) || instance.busyAction === action.code,
        ...(action.props ?? {}),
        onClick: () => handleDialogAction(instance, action),
    }, {
        default: () => [
            action.icon ? h('i', { class: action.icon, 'aria-hidden': 'true' }) : null,
            readValue(action.label, ''),
        ],
    });
}
function renderToolbar(instance, node) {
    return h('div', {
        key: node.key,
        class: ['lc-global-dialog__toolbar', node.className],
        style: node.style,
    }, node.actions.map((action) => renderAction(instance, action)));
}
function renderForm(instance, form, node) {
    const context = createGlobalDialogContext(instance);
    return h(LowCodeForm, {
        key: node?.key,
        class: node?.className,
        style: node?.style,
        schema: readValue(form.schema),
        modelValue: instance.model,
        optionSources: readValue(form.optionSources),
        loading: readValue(form.loading, false),
        ...(form.props ?? {}),
        'onUpdate:modelValue': (value) => {
            context.setModel(value);
        },
        onSubmit: (values) => form.onSubmit?.(values, context),
        onAction: (action, values) => form.onAction?.(action, values, context),
        onFieldChange: (payload) => form.onFieldChange?.(payload, context),
    });
}
function renderGrid(grid, node) {
    const events = mapEvents(grid.events);
    if (grid.schema) {
        return h(LowCodeGrid, {
            key: node?.key,
            class: node?.className,
            style: node?.style,
            schema: readValue(grid.schema),
            rows: readValue(grid.rows, []),
            loading: readValue(grid.loading, false),
            ...(grid.props ?? {}),
            ...events,
        });
    }
    return h(resolveComponent('vxe-grid'), {
        key: node?.key,
        class: node?.className,
        style: node?.style,
        ...resolveProps(grid.props),
        data: readValue(grid.rows, resolveProps(grid.props).data),
        columns: readValue(grid.columns, resolveProps(grid.props).columns),
        loading: readValue(grid.loading, Boolean(resolveProps(grid.props).loading)),
        ...events,
    });
}
function normalizeContent(content) {
    if (!content)
        return [];
    return Array.isArray(content) ? content : [content];
}
function renderContentNode(instance, node, index) {
    if (node.type === 'render') {
        return node.render(createGlobalDialogContext(instance));
    }
    if (node.type === 'toolbar') {
        return renderToolbar(instance, node);
    }
    if (node.type === 'form') {
        return renderForm(instance, node.form, node);
    }
    if (node.type === 'grid') {
        return renderGrid(node.grid, node);
    }
    return h(node.tag ?? 'div', {
        key: node.key ?? index,
        class: node.className,
        style: node.style,
        ...(node.props ?? {}),
    }, (node.children ?? []).map((child, childIndex) => renderContentNode(instance, child, childIndex)));
}
function renderBody(instance) {
    const context = createGlobalDialogContext(instance);
    const config = instance.config;
    if (config.body) {
        return config.body(context);
    }
    if (config.content) {
        return normalizeContent(config.content).map((node, index) => renderContentNode(instance, node, index));
    }
    if (config.form) {
        return renderForm(instance, config.form);
    }
    if (config.grid) {
        return renderGrid(config.grid);
    }
    return null;
}
function getFooterActions(config) {
    if (config.actions)
        return config.actions;
    if (!config.showFooter && !config.form)
        return [];
    return [
        {
            code: 'cancel',
            label: '取消',
            role: 'cancel',
        },
        {
            code: 'confirm',
            label: '确定',
            role: 'confirm',
            status: 'primary',
        },
    ];
}
function renderFooter(instance) {
    const config = instance.config;
    const context = createGlobalDialogContext(instance);
    if (config.footer) {
        return config.footer(context);
    }
    const actions = getFooterActions(config);
    if (!actions.length)
        return null;
    return h('div', { class: 'lc-global-dialog__footer' }, actions.map((action) => renderAction(instance, action)));
}
function hasFooter(config) {
    return Boolean(config.footer || getFooterActions(config).length);
}
export default defineComponent({
    name: 'GlobalDialogHost',
    setup() {
        return () => h(Fragment, null, globalDialogInstances.map((instance) => {
            const config = instance.config;
            const modalProps = {
                key: instance.id,
                modelValue: instance.visible,
                title: readValue(config.title, ''),
                width: readValue(config.width),
                height: readValue(config.height),
                className: config.className,
                showFooter: config.showFooter ?? hasFooter(config),
                showZoom: true,
                transfer: true,
                resize: true,
                ...(config.props ?? {}),
                'onUpdate:modelValue': (visible) => {
                    if (!visible) {
                        void closeGlobalDialog(instance.id, {
                            action: 'close',
                            values: instance.model,
                        });
                    }
                    else {
                        instance.visible = visible;
                    }
                },
                onClose: () => {
                    void closeGlobalDialog(instance.id, {
                        action: 'close',
                        values: instance.model,
                    });
                },
            };
            return h(resolveComponent('vxe-modal'), modalProps, {
                default: () => h('div', { class: 'lc-global-dialog__body' }, renderBody(instance)),
                footer: () => renderFooter(instance),
            });
        }));
    },
});
