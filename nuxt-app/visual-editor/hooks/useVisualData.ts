/**
 * @name: useVisualData
 * @author: 卜启缘
 * @date: 2021/5/6 11:59
 * @description：useVisualData
 * @update: 2021/5/6 11:59
 */
import { reactive, inject, readonly, computed, ref, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import type { InjectionKey } from 'vue';
import type {
  VisualEditorModelValue,
  VisualEditorBlockData,
  VisualEditorPage,
  FetchApiItem,
  VisualEditorModel,
} from '@/visual-editor/visual-editor.utils';

import { visualConfig } from '@/visual.config';
import { CacheEnum } from '@/enums';

// 保存到本地JSON数据的key
export const localKey = CacheEnum.PAGE_DATA_KEY;

// 注入jsonData的key
export const injectKey: InjectionKey<ReturnType<typeof initVisualData>> = Symbol();

interface IState {
  currentBlock: VisualEditorBlockData; // 当前正在操作的组件
  currentPage: VisualEditorPage; // 当前正在操作的页面
  jsonData: VisualEditorModelValue; // 整棵JSON树
}

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
});

const defaultValue: VisualEditorModelValue = {
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

type InitVisualDataOptions = {
  initialData?: VisualEditorModelValue | null;
  initialPath?: string;
};

type VisualHistorySnapshot = {
  model: VisualEditorModelValue;
  currentPath: string;
  signature: string;
};

const HISTORY_LIMIT = 80;

function readLocalVisualData() {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  try {
    return JSON.parse(sessionStorage.getItem(localKey) as string);
  } catch {
    return null;
  }
}

function cloneDefaultValue() {
  return JSON.parse(JSON.stringify(defaultValue)) as VisualEditorModelValue;
}

function cloneVisualData(value: VisualEditorModelValue) {
  return JSON.parse(JSON.stringify(value)) as VisualEditorModelValue;
}

function normalizeLegacyBlock(block: VisualEditorBlockData) {
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
}

function normalizeLegacyVisualData(value: VisualEditorModelValue) {
  Object.values(value.pages || {}).forEach((page) => {
    if (Array.isArray(page.blocks)) {
      page.blocks.forEach(normalizeLegacyBlock);
    }
  });

  return value;
}

function normalizeHistoryValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeHistoryValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (result, [key, item]) => {
        if (key === 'focus' || key === 'focusWithChild') return result;
        result[key] = normalizeHistoryValue(item);
        return result;
      },
      {},
    );
  }

  return value;
}

function createHistorySignature(value: VisualEditorModelValue) {
  return JSON.stringify(normalizeHistoryValue(value));
}

function findFocusedBlock(blocks: VisualEditorBlockData[] = []): VisualEditorBlockData | undefined {
  for (const block of blocks) {
    if (block.focus) return block;

    const slots = block.props?.slots || {};
    for (const slotKey of Object.keys(slots)) {
      const child = findFocusedBlock(slots[slotKey]?.children || []);
      if (child) return child;
    }
  }

  return undefined;
}

export const initVisualData = (options: InitVisualDataOptions = {}) => {
  const localData = readLocalVisualData();
  const jsonData: VisualEditorModelValue = Object.keys(options.initialData?.pages || {}).length
    ? (options.initialData as VisualEditorModelValue)
    : Object.keys(localData?.pages || {}).length
      ? localData
      : cloneDefaultValue();
  normalizeLegacyVisualData(jsonData);

  const route = options.initialPath ? null : useRoute();

  // 所有页面的path都必须以 / 开发
  const getPrefixPath = (path: string) => (path.startsWith('/') ? path : `/${path}`);

  const paths = Object.keys(jsonData.pages);
  const initialPath = getPrefixPath(options.initialPath || route?.path || '/');
  const currentPath = ref(jsonData.pages[initialPath] ? initialPath : paths[0] || '/');
  const currentPage = jsonData.pages[currentPath.value] ?? jsonData.pages['/'];
  let syncCurrentHistoryPath = (_path: string) => {};

  const state: IState = reactive({
    jsonData,
    currentPage,
    currentBlock: findFocusedBlock(currentPage?.blocks) ?? ({} as VisualEditorBlockData),
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
    } else {
      Object.assign(state.jsonData.pages[oldPath], page);
    }
  };
  // 添加page
  const incrementPage = (path = '', page: VisualEditorPage) => {
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
    } else {
      currentPath.value = nextPath;
    }
    const currentFocusBlock = findFocusedBlock(state.currentPage.blocks);
    setCurrentBlock(currentFocusBlock ?? ({} as VisualEditorBlockData));
    syncCurrentHistoryPath(currentPath.value);
  };

  // 设置当前被操作的组件
  const setCurrentBlock = (block: VisualEditorBlockData) => {
    state.currentBlock = block;
  };

  // 更新pages下面的blocks
  const updatePageBlock = (path = '', blocks: VisualEditorBlockData[] = []) => {
    state.jsonData.pages[getPrefixPath(path)].blocks = blocks;
  };

  /**
   * @description 新建API接口请求
   */
  const incrementFetchApi = (api: FetchApiItem) => {
    state.jsonData.actions.fetch.apis.push(api);
  };

  /**
   * @description 删除某个API接口
   */
  const deleteFetchApi = (key: string) => {
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
  const updateFetchApi = (api: FetchApiItem | FetchApiItem[], isCover = false) => {
    const fetch = state.jsonData.actions.fetch;
    const apis = Array.isArray(api) ? api : [api];
    if (isCover) {
      fetch.apis = apis;
    } else {
      apis.forEach((apiItem) => {
        const target = fetch.apis.find((item) => item.key == apiItem.key);
        target && Object.assign(target, api);
      });
    }
  };

  /**
   * @description 新增模型
   */
  const incrementModel = (model: VisualEditorModel) => {
    state.jsonData.models.push(model);
  };

  /**
   * @description 删除某个模型
   */
  const deleteModel = (key: string) => {
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
  const updateModel = (model: VisualEditorModel | VisualEditorModel[], isCover = false) => {
    const jsonData = state.jsonData;
    const models = Array.isArray(model) ? model : [model];
    if (isCover) {
      jsonData.models = models;
    } else {
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
    const nextJsonData = normalizeLegacyVisualData(
      typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData,
    );
    Object.keys(state.jsonData.pages).forEach((path) => delete state.jsonData.pages[path]);
    Object.assign(state.jsonData.pages, nextJsonData.pages || {});
    state.jsonData.models = nextJsonData.models || [];
    state.jsonData.actions = nextJsonData.actions || cloneDefaultValue().actions;
    setCurrentPage(Object.keys(state.jsonData.pages)[0] || '/');
  };

  const historyState = reactive({
    current: 0,
    snapshots: [] as VisualHistorySnapshot[],
    restoring: false,
  });

  const createHistorySnapshot = (): VisualHistorySnapshot => {
    const model = cloneVisualData(state.jsonData);
    return {
      model,
      currentPath: currentPath.value,
      signature: createHistorySignature(model),
    };
  };

  const applyHistorySnapshot = (snapshot: VisualHistorySnapshot) => {
    historyState.restoring = true;
    const nextModel = cloneVisualData(snapshot.model);
    const fallback = cloneDefaultValue();
    const nextPages = Object.keys(nextModel.pages || {}).length ? nextModel.pages : fallback.pages;

    Object.keys(state.jsonData.pages).forEach((path) => delete state.jsonData.pages[path]);
    Object.assign(state.jsonData.pages, nextPages);
    state.jsonData.models = nextModel.models || [];
    state.jsonData.actions = nextModel.actions || fallback.actions;
    setCurrentPage(snapshot.currentPath);

    void nextTick(() => {
      historyState.restoring = false;
    });
  };

  const pushHistorySnapshot = () => {
    if (historyState.restoring) return;

    const snapshot = createHistorySnapshot();
    const currentSnapshot = historyState.snapshots[historyState.current];
    if (currentSnapshot?.signature === snapshot.signature) {
      currentSnapshot.currentPath = snapshot.currentPath;
      return;
    }

    historyState.snapshots = historyState.snapshots.slice(0, historyState.current + 1);
    historyState.snapshots.push(snapshot);
    if (historyState.snapshots.length > HISTORY_LIMIT) {
      historyState.snapshots.shift();
    }
    historyState.current = historyState.snapshots.length - 1;
  };

  syncCurrentHistoryPath = (path: string) => {
    const currentSnapshot = historyState.snapshots[historyState.current];
    if (currentSnapshot) {
      currentSnapshot.currentPath = path;
    }
  };

  historyState.snapshots.push(createHistorySnapshot());

  watch(() => state.jsonData, pushHistorySnapshot, {
    deep: true,
    flush: 'post',
  });

  const canUndo = computed(() => historyState.current > 0);
  const canRedo = computed(() => historyState.current < historyState.snapshots.length - 1);

  const undoHistory = () => {
    if (!canUndo.value) return false;
    historyState.current -= 1;
    applyHistorySnapshot(historyState.snapshots[historyState.current]);
    return true;
  };

  const redoHistory = () => {
    if (!canRedo.value) return false;
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

export const useVisualData = () => inject<ReturnType<typeof initVisualData>>(injectKey)!;

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
