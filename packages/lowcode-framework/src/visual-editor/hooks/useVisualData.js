/**
 * @name: useVisualData
 * @author: 卜启缘
 * @date: 2021/5/6 11:59
 * @description：useVisualData
 * @update: 2021/5/6 11:59
 */
import { reactive, inject, readonly, computed, ref, watch, nextTick } from 'vue';
import { visualConfig } from '../../visual.config';
import { CacheEnum } from '../../enums';
// 保存到本地JSON数据的key
export const localKey = CacheEnum.PAGE_DATA_KEY;
// 注入jsonData的key
export const injectKey = Symbol();
/**
 * @description 创建空的新页面
 */
export const createNewPage = ({ title = '新页面', path = '/' }) => ({
    title,
    path,
    config: {
        bgColor: '',
        bgImage: '',
        keepAlive: false,
    },
    blocks: [],
    overlays: [],
});
const defaultValue = {
    pages: {
        // 页面
        '/': createNewPage({ title: '首页' }),
    },
    models: [], // 模型实体集合
    actions: {
        // 动作集合
        fetch: {
            name: '接口请求',
            apis: [],
        },
        dialog: {
            name: '对话框',
            handlers: [],
        },
    },
};
const HISTORY_LIMIT = 80;
function readLocalVisualData() {
    if (typeof sessionStorage === 'undefined') {
        return null;
    }
    try {
        return JSON.parse(sessionStorage.getItem(localKey));
    }
    catch {
        return null;
    }
}
function cloneDefaultValue() {
    return JSON.parse(JSON.stringify(defaultValue));
}
function cloneVisualData(value) {
    return JSON.parse(JSON.stringify(value));
}
function normalizeLegacyBlock(block) {
    if (block.componentKey === 'form') {
        if (block.label === '表单容器') {
            block.label = '普通表单';
        }
        if (block.moduleName === 'containerComponents') {
            block.moduleName = 'businessComponents';
        }
    }
    const slots = block.props?.slots || {};
    Object.keys(slots).forEach((slotKey) => {
        const children = slots[slotKey]?.children;
        if (Array.isArray(children)) {
            children.forEach(normalizeLegacyBlock);
        }
    });
    if (Array.isArray(block.props?.overlays)) {
        block.props.overlays.forEach(normalizeLegacyBlock);
    }
}
function normalizeLegacyVisualData(value) {
    Object.values(value.pages || {}).forEach((page) => {
        page.overlays ??= [];
        if (Array.isArray(page.blocks)) {
            page.blocks.forEach(normalizeLegacyBlock);
        }
        page.overlays.forEach(normalizeLegacyBlock);
    });
    return value;
}
function normalizeHistoryValue(value) {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeHistoryValue(item));
    }
    if (value && typeof value === 'object') {
        return Object.entries(value).reduce((result, [key, item]) => {
            if (key === 'focus' || key === 'focusWithChild')
                return result;
            result[key] = normalizeHistoryValue(item);
            return result;
        }, {});
    }
    return value;
}
function createHistorySignature(value) {
    return JSON.stringify(normalizeHistoryValue(value));
}
function findFocusedBlock(blocks = []) {
    for (const block of blocks) {
        if (block.focus)
            return block;
        const slots = block.props?.slots || {};
        for (const slotKey of Object.keys(slots)) {
            const child = findFocusedBlock(slots[slotKey]?.children || []);
            if (child)
                return child;
        }
        const overlay = findFocusedBlock(block.props?.overlays || []);
        if (overlay)
            return overlay;
    }
    return undefined;
}
function findFocusedPageBlock(page) {
    return findFocusedBlock(page?.blocks) ?? findFocusedBlock(page?.overlays);
}
function walkBlocks(blocks = [], callback) {
    blocks.forEach((block) => {
        callback(block);
        const slots = block.props?.slots || {};
        Object.keys(slots).forEach((slotKey) => {
            walkBlocks(slots[slotKey]?.children || [], callback);
        });
        walkBlocks(block.props?.overlays || [], callback);
    });
}
function findBlockPathByVid(vid, blocks = [], path = []) {
    if (!vid)
        return undefined;
    for (const block of blocks) {
        const nextPath = [...path, block];
        if (block._vid === vid)
            return nextPath;
        const slots = block.props?.slots || {};
        for (const slotKey of Object.keys(slots)) {
            const childPath = findBlockPathByVid(vid, slots[slotKey]?.children || [], nextPath);
            if (childPath)
                return childPath;
        }
        const overlayPath = findBlockPathByVid(vid, block.props?.overlays || [], nextPath);
        if (overlayPath)
            return overlayPath;
    }
    return undefined;
}
function findBlockByVid(vid, blocks = []) {
    const path = findBlockPathByVid(vid, blocks);
    return path?.[path.length - 1];
}
function findPageBlockByVid(page, vid) {
    return findBlockByVid(vid, page?.blocks) ?? findBlockByVid(vid, page?.overlays);
}
function findPageBlockPathByVid(page, vid) {
    return findBlockPathByVid(vid, page?.blocks) ?? findBlockPathByVid(vid, page?.overlays);
}
function syncPageFocus(page, vid) {
    if (!page)
        return;
    walkBlocks([...(page.blocks || []), ...(page.overlays || [])], (block) => {
        block.focus = false;
        block.focusWithChild = false;
    });
    const path = findPageBlockPathByVid(page, vid);
    path?.forEach((block) => {
        block.focus = block._vid === vid;
        block.focusWithChild = block._vid !== vid;
    });
}
export const initVisualData = (options = {}) => {
    const localData = readLocalVisualData();
    const jsonData = Object.keys(options.initialData?.pages || {}).length
        ? options.initialData
        : Object.keys(localData?.pages || {}).length
            ? localData
            : cloneDefaultValue();
    normalizeLegacyVisualData(jsonData);
    // 所有页面的path都必须以 / 开发
    const getPrefixPath = (path) => (path.startsWith('/') ? path : `/${path}`);
    const paths = Object.keys(jsonData.pages);
    const initialPath = getPrefixPath(options.initialPath || options.routePath || '/');
    const currentPath = ref(jsonData.pages[initialPath] ? initialPath : paths[0] || '/');
    const currentPage = jsonData.pages[currentPath.value] ?? jsonData.pages['/'];
    let syncCurrentHistoryPath = (_path) => { };
    const state = reactive({
        jsonData,
        currentPage,
        currentBlock: findFocusedPageBlock(currentPage) ?? {},
    });
    if (!state.currentPage) {
        state.currentPage = createNewPage({ title: '首页' });
        state.jsonData.pages['/'] = state.currentPage;
        currentPath.value = '/';
    }
    // 更新page
    const updatePage = ({ newPath = '', oldPath, page }) => {
        if (newPath && newPath != oldPath) {
            page.path = newPath;
            // 如果传了新的路径，则认为是修改页面路由
            state.jsonData.pages[getPrefixPath(newPath)] = { ...state.jsonData.pages[oldPath], ...page };
            deletePage(oldPath, getPrefixPath(newPath));
        }
        else {
            Object.assign(state.jsonData.pages[oldPath], page);
        }
    };
    // 添加page
    const incrementPage = (path = '', page) => {
        state.jsonData.pages[getPrefixPath(path)] ??= page ?? createNewPage({ path });
    };
    // 删除page
    const deletePage = (path = '', redirectPath = '') => {
        delete state.jsonData.pages[path];
        if (redirectPath) {
            setCurrentPage(redirectPath);
        }
    };
    // 设置当前页面
    const setCurrentPage = (path = '/') => {
        const nextPath = getPrefixPath(path);
        state.currentPage = state.jsonData.pages[nextPath];
        if (!state.currentPage) {
            state.currentPage = state.jsonData.pages['/'];
            currentPath.value = '/';
            if (!state.currentPage) {
                state.currentPage = createNewPage({});
                state.jsonData.pages['/'] = state.currentPage;
            }
        }
        else {
            currentPath.value = nextPath;
        }
        const currentFocusBlock = findFocusedPageBlock(state.currentPage);
        setCurrentBlock(currentFocusBlock ?? {});
        syncCurrentHistoryPath(currentPath.value);
    };
    // 设置当前被操作的组件
    const setCurrentBlock = (block) => {
        state.currentBlock = block;
    };
    // 更新pages下面的blocks
    const updatePageBlock = (path = '', blocks = []) => {
        state.jsonData.pages[getPrefixPath(path)].blocks = blocks;
    };
    /**
     * @description 新建API接口请求
     */
    const incrementFetchApi = (api) => {
        state.jsonData.actions.fetch.apis.push(api);
    };
    /**
     * @description 删除某个API接口
     */
    const deleteFetchApi = (key) => {
        const index = state.jsonData.actions.fetch.apis.findIndex((item) => item.key == key);
        if (index !== -1) {
            state.jsonData.actions.fetch.apis.splice(index, 1);
        }
    };
    /**
     * @description 更新某个接口或者批量更新接口
     * @param {FetchApiItem | FetchApiItem[]} api 接口
     * @param {boolean} isCover 是否覆盖全部接口
     */
    const updateFetchApi = (api, isCover = false) => {
        const fetch = state.jsonData.actions.fetch;
        const apis = Array.isArray(api) ? api : [api];
        if (isCover) {
            fetch.apis = apis;
        }
        else {
            apis.forEach((apiItem) => {
                const target = fetch.apis.find((item) => item.key == apiItem.key);
                target && Object.assign(target, api);
            });
        }
    };
    /**
     * @description 新增模型
     */
    const incrementModel = (model) => {
        state.jsonData.models.push(model);
    };
    /**
     * @description 删除某个模型
     */
    const deleteModel = (key) => {
        const index = state.jsonData.models.findIndex((item) => item.key == key);
        if (index !== -1) {
            state.jsonData.models.splice(index, 1);
        }
    };
    /**
     * @param { VisualEditorModel | VisualEditorModel[]} model 模型项或模型数组
     * @param {boolean} isCover 是否覆盖所有模型
     * @description 更新某个模型
     */
    const updateModel = (model, isCover = false) => {
        const jsonData = state.jsonData;
        const models = Array.isArray(model) ? model : [model];
        if (isCover) {
            jsonData.models = models;
        }
        else {
            models.forEach((modelItem) => {
                const index = jsonData.models.findIndex((item) => item.key == modelItem.key);
                if (index !== -1) {
                    state.jsonData.models.splice(index, 1, modelItem);
                }
            });
        }
    };
    // 使用自定义JSON覆盖整个项目
    const overrideProject = (jsonData) => {
        const nextJsonData = normalizeLegacyVisualData(typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData);
        Object.keys(state.jsonData.pages).forEach((path) => delete state.jsonData.pages[path]);
        Object.assign(state.jsonData.pages, nextJsonData.pages || {});
        state.jsonData.models = nextJsonData.models || [];
        state.jsonData.actions = nextJsonData.actions || cloneDefaultValue().actions;
        setCurrentPage(Object.keys(state.jsonData.pages)[0] || '/');
    };
    const historyState = reactive({
        current: 0,
        snapshots: [],
        restoring: false,
        restoreVersion: 0,
    });
    const createHistorySnapshot = () => {
        const model = cloneVisualData(state.jsonData);
        return {
            model,
            currentPath: currentPath.value,
            currentBlockVid: state.currentBlock?._vid,
            signature: createHistorySignature(model),
        };
    };
    const applyHistorySnapshot = (snapshot) => {
        historyState.restoring = true;
        historyState.restoreVersion += 1;
        const targetBlockVid = snapshot.currentBlockVid;
        const nextModel = cloneVisualData(snapshot.model);
        const fallback = cloneDefaultValue();
        const nextPages = Object.keys(nextModel.pages || {}).length ? nextModel.pages : fallback.pages;
        Object.keys(state.jsonData.pages).forEach((path) => delete state.jsonData.pages[path]);
        Object.assign(state.jsonData.pages, nextPages);
        state.jsonData.models = nextModel.models || [];
        state.jsonData.actions = nextModel.actions || fallback.actions;
        setCurrentPage(snapshot.currentPath);
        const selectedBlock = findPageBlockByVid(state.currentPage, targetBlockVid) ??
            findFocusedPageBlock(state.currentPage) ??
            {};
        syncPageFocus(state.currentPage, selectedBlock?._vid);
        setCurrentBlock(selectedBlock);
        void nextTick(() => {
            historyState.restoring = false;
        });
    };
    const pushHistorySnapshot = () => {
        if (historyState.restoring)
            return;
        const snapshot = createHistorySnapshot();
        const currentSnapshot = historyState.snapshots[historyState.current];
        if (currentSnapshot?.signature === snapshot.signature) {
            currentSnapshot.currentPath = snapshot.currentPath;
            currentSnapshot.currentBlockVid = snapshot.currentBlockVid;
            return;
        }
        historyState.snapshots = historyState.snapshots.slice(0, historyState.current + 1);
        historyState.snapshots.push(snapshot);
        if (historyState.snapshots.length > HISTORY_LIMIT) {
            historyState.snapshots.shift();
        }
        historyState.current = historyState.snapshots.length - 1;
    };
    syncCurrentHistoryPath = (path) => {
        const currentSnapshot = historyState.snapshots[historyState.current];
        if (!currentSnapshot || historyState.restoring)
            return;
        currentSnapshot.currentPath = path;
        currentSnapshot.currentBlockVid = state.currentBlock?._vid;
    };
    historyState.snapshots.push(createHistorySnapshot());
    watch(() => state.jsonData, pushHistorySnapshot, {
        deep: true,
        flush: 'post',
    });
    const canUndo = computed(() => historyState.current > 0);
    const canRedo = computed(() => historyState.current < historyState.snapshots.length - 1);
    const undoHistory = () => {
        if (!canUndo.value)
            return false;
        historyState.current -= 1;
        applyHistorySnapshot(historyState.snapshots[historyState.current]);
        return true;
    };
    const redoHistory = () => {
        if (!canRedo.value)
            return false;
        historyState.current += 1;
        applyHistorySnapshot(historyState.snapshots[historyState.current]);
        return true;
    };
    return {
        visualConfig,
        currentPath: computed(() => currentPath.value),
        jsonData: readonly(state.jsonData), // 保护JSONData避免直接修改
        currentPage: computed(() => state.currentPage),
        currentBlock: computed(() => state.currentBlock),
        historyState: readonly(historyState),
        canUndo,
        canRedo,
        undoHistory,
        redoHistory,
        overrideProject,
        incrementFetchApi,
        deleteFetchApi,
        updateFetchApi,
        incrementModel,
        deleteModel,
        updateModel,
        setCurrentPage,
        setCurrentBlock,
        updatePage,
        incrementPage,
        deletePage,
        updatePageBlock,
    };
};
export const useVisualData = () => inject(injectKey);
/**
 * 实体的字段数据类型
 */
export const fieldTypes = [
    {
        label: '字符串',
        value: 'string',
    },
    {
        label: '数字',
        value: 'number',
    },
    {
        label: '数组',
        value: 'array',
    },
    {
        label: '布尔值',
        value: 'boolean',
    },
];
