function withOverrides(block, overrides) {
    return {
        ...block,
        ...(overrides ?? {}),
    };
}
export function createDefaultTextBlock(overrides) {
    return withOverrides({
        id: 'text-block',
        kind: 'text',
        content: 'Text block',
        tone: 'default',
    }, overrides);
}
export function createDefaultContainerBlock(overrides) {
    return withOverrides({
        id: 'container-block',
        kind: 'container',
        title: 'Container',
        columns: 1,
        gap: 8,
        panel: true,
        blocks: [],
    }, overrides);
}
export function createDefaultSectionBlock(overrides) {
    return withOverrides({
        id: 'section-block',
        kind: 'section',
        title: 'Section',
        panel: true,
        blocks: [],
    }, overrides);
}
export function createDefaultTabsBlock(overrides) {
    return withOverrides({
        id: 'tabs-block',
        kind: 'tabs',
        defaultKey: 'basic',
        tabs: [
            {
                key: 'basic',
                label: 'Basic',
                blocks: [],
            },
        ],
    }, overrides);
}
export function createDefaultToolbarBlock(overrides) {
    return withOverrides({
        id: 'toolbar-block',
        kind: 'toolbar',
        actions: [
            {
                code: 'refresh',
                label: 'Refresh',
                status: 'primary',
            },
        ],
    }, overrides);
}
export function createDefaultButtonGroupBlock(overrides) {
    return withOverrides({
        id: 'button-group',
        kind: 'buttonGroup',
        title: '按钮组',
        align: 'left',
        gap: 8,
        actions: [
            {
                code: 'create',
                label: '新增',
                status: 'primary',
                type: 'button',
                eventName: 'buttonGroup.create',
            },
            {
                code: 'more',
                label: '更多',
                type: 'button',
                eventName: 'buttonGroup.more',
                children: [
                    {
                        code: 'import',
                        label: '导入',
                        type: 'button',
                        eventName: 'buttonGroup.import',
                    },
                    {
                        code: 'export',
                        label: '导出',
                        type: 'button',
                        eventName: 'buttonGroup.export',
                    },
                ],
            },
        ],
    }, overrides);
}
export function createDefaultFormBlock(overrides) {
    return withOverrides({
        id: 'form-block',
        kind: 'form',
        title: '普通表单',
        sourceKey: 'record',
        submitSourceKey: 'record',
        schema: {
            fields: [],
            actions: [
                {
                    code: 'submit',
                    label: 'Submit',
                    type: 'submit',
                    status: 'primary',
                },
                {
                    code: 'reset',
                    label: 'Reset',
                    type: 'reset',
                },
            ],
        },
    }, overrides);
}
export function createDefaultSearchFormBlock(overrides) {
    return withOverrides({
        id: 'search-form-block',
        kind: 'searchForm',
        title: 'Query Conditions',
        targetSourceKey: 'records',
        schema: {
            fields: [],
            actions: [
                {
                    code: 'submit',
                    label: 'Search',
                    type: 'submit',
                    status: 'primary',
                },
                {
                    code: 'reset',
                    label: 'Reset',
                    type: 'reset',
                },
            ],
        },
    }, overrides);
}
export function createDefaultGridBlock(overrides) {
    return withOverrides({
        id: 'grid-block',
        kind: 'grid',
        title: 'Records',
        sourceKey: 'records',
        schema: {
            title: 'Records',
            grid: {
                border: true,
                stripe: true,
                showOverflow: true,
                rowConfig: { keyField: 'id' },
                columns: [],
            },
        },
    }, overrides);
}
export function createDefaultDetailBlock(overrides) {
    return withOverrides({
        id: 'detail-block',
        kind: 'detail',
        title: 'Detail',
        fields: [],
    }, overrides);
}
export function createDefaultModalBlock(overrides) {
    return withOverrides({
        id: 'modal-block',
        kind: 'modal',
        title: 'Modal',
        open: false,
        width: 640,
        blocks: [],
        overlays: [],
    }, overrides);
}
export function createDefaultDrawerBlock(overrides) {
    return withOverrides({
        id: 'drawer-block',
        kind: 'drawer',
        title: 'Drawer',
        open: false,
        width: 480,
        placement: 'right',
        blocks: [],
        overlays: [],
    }, overrides);
}
export function createDefaultStatCardBlock(overrides) {
    return withOverrides({
        id: 'stat-card-block',
        kind: 'statCard',
        title: 'Stats',
        items: [
            {
                label: 'Total',
                field: 'count',
            },
        ],
    }, overrides);
}
export function createDefaultTreeBlock(overrides) {
    return withOverrides({
        id: 'tree-block',
        kind: 'tree',
        title: 'Tree',
        keyField: 'id',
        titleField: 'title',
        childrenField: 'children',
        rows: [],
    }, overrides);
}
