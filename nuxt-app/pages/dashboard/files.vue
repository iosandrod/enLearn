<template>
  <section class="file-page" @click="closeContextMenu">
    <header class="file-toolbar">
      <div>
        <h1>文件管理</h1>
        <p>集中管理已上传的图片、文档、音视频和业务附件。</p>
      </div>

      <div class="file-toolbar-actions">
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          multiple
          @change="handleFileInput"
        />
        <button
          class="file-button file-button-primary"
          type="button"
          :disabled="loading || uploading"
          @click.stop="openPicker"
        >
          <i class="ri-upload-cloud-2-line" aria-hidden="true"></i>
          {{ uploading ? '上传中' : '上传' }}
        </button>
        <button
          class="file-button"
          type="button"
          :disabled="loading || uploading"
          @click.stop="loadAll"
        >
          <i class="ri-refresh-line" aria-hidden="true"></i>
          刷新
        </button>
      </div>
    </header>

    <div class="file-workbench">
      <aside class="file-tree-panel">
        <div class="file-panel-title">
          <span>文件树</span>
          <strong>{{ files.length }}</strong>
        </div>

        <div class="folder-actions">
          <button class="icon-button" type="button" title="新建文件夹" @click.stop="createFolder">
            <i class="ri-folder-add-line" aria-hidden="true"></i>
          </button>
          <button
            class="icon-button danger"
            type="button"
            title="删除文件夹"
            :disabled="!canDeleteSelectedFolder"
            @click.stop="deleteSelectedFolder"
          >
            <i class="ri-folder-reduce-line" aria-hidden="true"></i>
          </button>
        </div>

        <nav class="file-tree">
          <button
            v-for="node in flatTreeNodes"
            :key="node.key"
            class="file-tree-item"
            :class="{ active: selectedNodeKey === node.key }"
            :style="{ paddingLeft: `${8 + node.level * 16}px` }"
            type="button"
            @click.stop="selectNode(node)"
          >
            <i :class="node.level === 0 ? 'ri-folder-2-line' : 'ri-folder-line'" aria-hidden="true"></i>
            <span>{{ node.label }}</span>
            <small>{{ node.count }}</small>
          </button>
        </nav>
      </aside>

      <main class="file-content-panel">
        <div class="file-list-header">
          <div>
            <h2>{{ selectedNodeLabel }}</h2>
            <p>{{ filteredFiles.length }} 个文件 · {{ formatBytes(filteredTotalBytes) }}</p>
          </div>

          <label class="file-search">
            <i class="ri-search-line" aria-hidden="true"></i>
            <input v-model="keyword" type="search" placeholder="搜索文件名或类型" />
          </label>
        </div>

        <div v-if="loading" class="file-empty">
          <i class="ri-loader-4-line" aria-hidden="true"></i>
          正在加载文件
        </div>

        <div v-else-if="errorMessage" class="file-empty error">
          <i class="ri-error-warning-line" aria-hidden="true"></i>
          {{ errorMessage }}
        </div>

        <div v-else-if="!filteredFiles.length" class="file-empty">
          <i class="ri-folder-open-line" aria-hidden="true"></i>
          当前目录没有文件
        </div>

        <div v-else class="file-grid">
          <button
            v-for="file in filteredFiles"
            :key="file.id"
            class="file-card"
            :class="{ active: selectedFile?.id === file.id, locked: file.locked }"
            type="button"
            @click.stop="selectedFileId = file.id"
            @dblclick.stop="download(file)"
            @contextmenu.prevent.stop="openFileContextMenu($event, file)"
          >
            <span class="file-thumb">
              <img
                v-if="thumbnailUrls[file.id]"
                :src="thumbnailUrls[file.id]"
                :alt="file.originalName"
              />
              <i v-else :class="typeIcon(file)" aria-hidden="true"></i>
            </span>

            <span class="file-card-main">
              <strong>{{ file.originalName }}</strong>
              <span>{{ typeLabel(file) }} · {{ formatBytes(file.sizeBytes) }}</span>
            </span>

            <span class="file-badges">
              <span class="file-status" :class="file.status">{{ statusLabel(file.status) }}</span>
              <span v-if="file.locked" class="file-status locked">
                <i class="ri-lock-line" aria-hidden="true"></i>
                已锁定
              </span>
            </span>
          </button>
        </div>
      </main>

      <aside class="file-detail-panel">
        <div class="file-panel-title">
          <span>文件信息</span>
        </div>

        <div v-if="selectedFile" class="file-detail">
          <div class="file-detail-preview">
            <img
              v-if="thumbnailUrls[selectedFile.id]"
              :src="thumbnailUrls[selectedFile.id]"
              :alt="selectedFile.originalName"
            />
            <i v-else :class="typeIcon(selectedFile)" aria-hidden="true"></i>
          </div>

          <h3>{{ selectedFile.originalName }}</h3>

          <dl>
            <dt>类型</dt>
            <dd>{{ typeLabel(selectedFile) }}</dd>
            <dt>MIME</dt>
            <dd>{{ selectedFile.mimeType || '未知' }}</dd>
            <dt>大小</dt>
            <dd>{{ formatBytes(selectedFile.sizeBytes) }}</dd>
            <dt>状态</dt>
            <dd>{{ statusLabel(selectedFile.status) }}</dd>
            <dt>锁定</dt>
            <dd>{{ selectedFile.locked ? '已锁定' : '未锁定' }}</dd>
            <dt>可见性</dt>
            <dd>{{ selectedFile.visibility === 'public' ? '公开' : '私有' }}</dd>
            <dt>上传时间</dt>
            <dd>{{ formatDate(selectedFile.createdAt) }}</dd>
          </dl>

          <div class="file-detail-actions">
            <button class="file-button file-button-primary" type="button" @click.stop="download(selectedFile)">
              <i class="ri-download-2-line" aria-hidden="true"></i>
              下载
            </button>
            <button class="file-button" type="button" @click.stop="toggleLock(selectedFile)">
              <i :class="selectedFile.locked ? 'ri-lock-unlock-line' : 'ri-lock-line'" aria-hidden="true"></i>
              {{ selectedFile.locked ? '解锁' : '锁定' }}
            </button>
            <button
              class="file-button danger"
              type="button"
              :disabled="selectedFile.locked"
              @click.stop="remove(selectedFile)"
            >
              <i class="ri-delete-bin-line" aria-hidden="true"></i>
              删除
            </button>
          </div>
        </div>

        <div v-else class="file-empty compact">
          <i class="ri-file-list-3-line" aria-hidden="true"></i>
          选择一个文件查看详情
        </div>
      </aside>
    </div>

    <div
      v-if="contextMenu.visible && contextMenu.file"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button type="button" @click="download(contextMenu.file)">
        <i class="ri-download-2-line" aria-hidden="true"></i>
        下载文件
      </button>
      <button type="button" @click="toggleLock(contextMenu.file)">
        <i :class="contextMenu.file.locked ? 'ri-lock-unlock-line' : 'ri-lock-line'" aria-hidden="true"></i>
        {{ contextMenu.file.locked ? '解锁文件' : '锁定文件' }}
      </button>
      <button
        class="danger"
        type="button"
        :disabled="contextMenu.file.locked"
        @click="remove(contextMenu.file)"
      >
        <i class="ri-delete-bin-line" aria-hidden="true"></i>
        删除文件
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { FileFolder, FileObject } from '~/composables/useFilesApi';

definePageMeta({
  layout: 'dashboard',
  middleware: 'auth'
});

type FileTreeNode = {
  key: string;
  label: string;
  prefix: string;
  count: number;
  level: number;
  children: FileTreeNode[];
};

const filesApi = useFilesApi();
const fileInput = ref<HTMLInputElement | null>(null);
const files = ref<FileObject[]>([]);
const folders = ref<FileFolder[]>([]);
const loading = ref(false);
const uploading = ref(false);
const errorMessage = ref('');
const keyword = ref('');
const selectedNodeKey = ref('all');
const selectedPrefix = ref('');
const selectedNodeLabel = ref('全部文件');
const selectedFileId = ref('');
const thumbnailUrls = reactive<Record<string, string>>({});
const contextMenu = reactive<{
  visible: boolean;
  x: number;
  y: number;
  file: FileObject | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  file: null
});

const rootNode = computed<FileTreeNode>(() => buildTree(files.value, folders.value));
const flatTreeNodes = computed(() => flattenTree(rootNode.value));
const selectedNode = computed(() => findNode(rootNode.value, selectedNodeKey.value));
const selectedFile = computed(() =>
  filteredFiles.value.find((file) => file.id === selectedFileId.value) ??
  filteredFiles.value[0] ??
  null
);
const filteredTotalBytes = computed(() =>
  filteredFiles.value.reduce((total, file) => total + (file.sizeBytes ?? 0), 0)
);
const filteredFiles = computed(() => {
  const search = keyword.value.trim().toLowerCase();
  return files.value.filter((file) => {
    const folderPath = getDisplayFolder(file).join('/');
    const inFolder =
      !selectedPrefix.value ||
      folderPath === selectedPrefix.value ||
      folderPath.startsWith(`${selectedPrefix.value}/`);
    if (!inFolder) return false;
    if (!search) return true;

    return [
      file.originalName,
      file.mimeType ?? '',
      typeLabel(file),
      file.objectKey
    ]
      .join(' ')
      .toLowerCase()
      .includes(search);
  });
});
const filteredFolderChildren = computed(() =>
  flatTreeNodes.value.filter(
    (node) =>
      Boolean(selectedPrefix.value) &&
      node.prefix.startsWith(`${selectedPrefix.value}/`)
  )
);
const canDeleteSelectedFolder = computed(
  () =>
    Boolean(selectedPrefix.value) &&
    filteredFiles.value.length === 0 &&
    filteredFolderChildren.value.length === 0
);

function openPicker() {
  fileInput.value?.click();
}

async function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const selected = Array.from(input.files ?? []);
  input.value = '';
  if (!selected.length) return;

  uploading.value = true;
  errorMessage.value = '';

  try {
    for (const file of selected) {
      await filesApi.upload({
        file,
        visibility: 'private',
        folderPath: selectedPrefix.value || undefined
      });
    }
    await loadAll();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '文件上传失败。';
  } finally {
    uploading.value = false;
  }
}

async function loadAll() {
  loading.value = true;
  errorMessage.value = '';

  try {
    const [fileResult, folderResult] = await Promise.all([
      filesApi.list({ limit: 100, offset: 0 }),
      filesApi.listFolders()
    ]);
    files.value = fileResult.items;
    folders.value = folderResult.items;
    if (selectedNodeKey.value !== 'all' && !findNode(rootNode.value, selectedNodeKey.value)) {
      selectNode(rootNode.value);
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '文件列表加载失败。';
  } finally {
    loading.value = false;
  }
}

async function createFolder() {
  const name = window.prompt('请输入文件夹名称');
  if (!name?.trim()) return;

  try {
    await filesApi.createFolder({
      name,
      parentPath: selectedPrefix.value || undefined
    });
    await loadAll();
    const path = selectedPrefix.value ? `${selectedPrefix.value}/${name.trim()}` : name.trim();
    const node = findNode(rootNode.value, `folder:${path}`);
    if (node) selectNode(node);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '文件夹创建失败。';
  }
}

async function deleteSelectedFolder() {
  if (!selectedPrefix.value) return;
  if (!canDeleteSelectedFolder.value) {
    window.alert('只能删除空文件夹。');
    return;
  }
  if (!window.confirm(`确认删除文件夹「${selectedNodeLabel.value}」？`)) return;

  try {
    await filesApi.deleteFolder(selectedPrefix.value);
    selectNode(rootNode.value);
    await loadAll();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '文件夹删除失败。';
  }
}

function selectNode(node: FileTreeNode) {
  selectedNodeKey.value = node.key;
  selectedPrefix.value = node.prefix;
  selectedNodeLabel.value = node.label;
  selectedFileId.value = '';
  closeContextMenu();
}

function getDisplayFolder(file: FileObject) {
  const parts = file.objectKey.split('/').filter(Boolean);
  let display = parts.slice(0, -1);

  if (display[0] === 'users' && display[1] === file.ownerId) {
    display = display.slice(2);
  }

  if (display[0] === 'folders') {
    display = display.slice(1);
  }

  const maybeFileId = display[display.length - 1] ?? '';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(maybeFileId)) {
    display = display.slice(0, -1);
  }

  return display.length ? display : ['未分类'];
}

function ensureTreePath(root: FileTreeNode, path: string, count = 0) {
  const parts = path.split('/').filter(Boolean);
  let current = root;
  let prefix = '';

  for (const part of parts) {
    prefix = prefix ? `${prefix}/${part}` : part;
    const key = `folder:${prefix}`;
    let node = current.children.find((item) => item.key === key);

    if (!node) {
      node = {
        key,
        label: part,
        prefix,
        count: 0,
        level: current.level + 1,
        children: []
      };
      current.children.push(node);
    }

    node.count += count;
    current = node;
  }

  return current;
}

function buildTree(items: FileObject[], folderItems: FileFolder[]): FileTreeNode {
  const root: FileTreeNode = {
    key: 'all',
    label: '全部文件',
    prefix: '',
    count: items.length,
    level: 0,
    children: []
  };

  for (const folder of folderItems) {
    ensureTreePath(root, folder.path, 0);
  }

  for (const file of items) {
    ensureTreePath(root, getDisplayFolder(file).join('/'), 1);
  }

  sortTree(root);
  return root;
}

function sortTree(node: FileTreeNode) {
  node.children.sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
  for (const child of node.children) {
    sortTree(child);
  }
}

function flattenTree(node: FileTreeNode): FileTreeNode[] {
  return [node, ...node.children.flatMap(flattenTree)];
}

function findNode(node: FileTreeNode, key: string): FileTreeNode | null {
  if (node.key === key) return node;
  for (const child of node.children) {
    const found = findNode(child, key);
    if (found) return found;
  }
  return null;
}

function isImage(file: FileObject) {
  return Boolean(file.mimeType?.startsWith('image/'));
}

function typeLabel(file: FileObject) {
  const mime = file.mimeType ?? '';
  if (mime.startsWith('image/')) return '图片';
  if (mime.startsWith('video/')) return '视频';
  if (mime.startsWith('audio/')) return '音频';
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return '表格';
  if (mime.includes('word') || mime.includes('document')) return '文档';
  if (mime.includes('zip') || mime.includes('compressed')) return '压缩包';
  return '文件';
}

function typeIcon(file: FileObject) {
  const mime = file.mimeType ?? '';
  if (mime.startsWith('image/')) return 'ri-image-line';
  if (mime.startsWith('video/')) return 'ri-movie-line';
  if (mime.startsWith('audio/')) return 'ri-volume-up-line';
  if (mime.includes('pdf')) return 'ri-file-pdf-2-line';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'ri-file-excel-2-line';
  if (mime.includes('word') || mime.includes('document')) return 'ri-file-word-2-line';
  if (mime.includes('zip') || mime.includes('compressed')) return 'ri-file-zip-line';
  return 'ri-file-3-line';
}

function statusLabel(status: FileObject['status']) {
  const labels: Record<FileObject['status'], string> = {
    created: '已创建',
    uploading: '上传中',
    uploaded: '已上传',
    ready: '可用',
    rejected: '已拒绝',
    deleted: '已删除'
  };
  return labels[status] ?? status;
}

function formatBytes(value: number | null | undefined) {
  const bytes = Number(value ?? 0);
  if (!bytes) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / 1024 ** exponent;
  return `${size.toFixed(size >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

async function loadThumbnails() {
  const images = filteredFiles.value.filter(isImage).slice(0, 24);

  await Promise.all(
    images.map(async (file) => {
      if (thumbnailUrls[file.id]) return;

      try {
        const result = await filesApi.getDownloadUrl(file.id, 600);
        thumbnailUrls[file.id] = result.download.signedUrl;
      } catch {
        // Thumbnail failure should not block the file list.
      }
    })
  );
}

function openFileContextMenu(event: MouseEvent, file: FileObject) {
  selectedFileId.value = file.id;
  contextMenu.visible = true;
  contextMenu.file = file;
  contextMenu.x = Math.min(event.clientX, window.innerWidth - 180);
  contextMenu.y = Math.min(event.clientY, window.innerHeight - 130);
}

function closeContextMenu() {
  contextMenu.visible = false;
  contextMenu.file = null;
}

async function download(file: FileObject) {
  closeContextMenu();
  const result = await filesApi.getDownloadUrl(file.id, 300);
  window.open(result.download.signedUrl, '_blank', 'noopener,noreferrer');
}

async function toggleLock(file: FileObject) {
  closeContextMenu();
  const result = await filesApi.setFileLocked(file.id, !file.locked);
  const index = files.value.findIndex((item) => item.id === file.id);
  if (index >= 0) {
    files.value[index] = result.file;
  }
}

async function remove(file: FileObject) {
  closeContextMenu();
  if (file.locked) {
    window.alert('文件已锁定，解锁后才能删除。');
    return;
  }
  if (!window.confirm(`确认删除 ${file.originalName}？`)) return;

  try {
    await filesApi.remove(file.id);
    await loadAll();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '文件删除失败。';
  }
}

onMounted(() => {
  void loadAll();
});

watch(filteredFiles, () => {
  void loadThumbnails();
});
</script>

<style scoped>
.file-page {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: 8px;
}

.file-toolbar,
.file-tree-panel,
.file-content-panel,
.file-detail-panel {
  border: 1px solid #d6dce5;
  background: #ffffff;
}

.file-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 58px;
  flex: none;
  padding: 8px 12px;
}

.file-toolbar h1,
.file-list-header h2,
.file-detail h3 {
  margin: 0;
  color: #111827;
  font-size: 16px;
  line-height: 1.2;
}

.file-toolbar p,
.file-list-header p {
  margin: 4px 0 0;
  color: #667085;
  font-size: 12px;
}

.file-toolbar-actions,
.file-detail-actions,
.folder-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-input {
  display: none;
}

.file-button,
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 30px;
  border: 1px solid #cfd7e3;
  border-radius: 4px;
  background: #ffffff;
  color: #111827;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  padding: 0 10px;
}

.icon-button {
  width: 30px;
  padding: 0;
}

.file-button:disabled,
.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.file-button-primary {
  border-color: #006be6;
  background: #006be6;
  color: #ffffff;
}

.file-button.danger,
.icon-button.danger {
  border-color: #f1b8b5;
  color: #b42318;
}

.file-workbench {
  display: grid;
  flex: 1 1 0;
  grid-template-columns: 220px minmax(0, 1fr) 280px;
  min-height: 0;
  gap: 8px;
}

.file-tree-panel,
.file-content-panel,
.file-detail-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.file-panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  border-bottom: 1px solid #dfe5ec;
  color: #344054;
  flex: none;
  font-size: 13px;
  font-weight: 700;
  padding: 0 10px;
}

.file-panel-title strong {
  color: #667085;
  font-size: 12px;
}

.folder-actions {
  height: 38px;
  border-bottom: 1px solid #dfe5ec;
  flex: none;
  padding: 4px 8px;
}

.file-tree {
  display: grid;
  align-content: start;
  gap: 2px;
  overflow: auto;
  padding: 8px;
}

.file-tree-item {
  display: grid;
  align-items: center;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 6px;
  min-height: 30px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #344054;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
}

.file-tree-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-tree-item small {
  color: #98a2b3;
  font-size: 11px;
}

.file-tree-item.active,
.file-tree-item:hover {
  background: #dceeff;
  color: #006be6;
}

.file-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 54px;
  border-bottom: 1px solid #dfe5ec;
  flex: none;
  padding: 8px 12px;
}

.file-search {
  display: grid;
  align-items: center;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 6px;
  width: min(280px, 44%);
  height: 30px;
  border: 1px solid #cfd7e3;
  border-radius: 4px;
  color: #667085;
  padding: 0 8px;
}

.file-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  font: inherit;
  font-size: 13px;
}

.file-grid {
  display: grid;
  align-content: start;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  overflow: auto;
  padding: 10px;
}

.file-card {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  grid-template-rows: 1fr auto;
  gap: 8px 10px;
  min-height: 82px;
  border: 1px solid #e4e7ec;
  border-radius: 6px;
  background: #ffffff;
  cursor: pointer;
  font: inherit;
  padding: 8px;
  text-align: left;
}

.file-card.active,
.file-card:hover {
  border-color: #6daeea;
  box-shadow: 0 0 0 2px rgb(0 107 230 / 10%);
}

.file-card.locked {
  background: #fbfcfe;
}

.file-thumb {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border: 1px solid #e4e7ec;
  border-radius: 4px;
  background: #f8fafc;
  color: #006be6;
  font-size: 24px;
  overflow: hidden;
}

.file-thumb img,
.file-detail-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.file-card-main {
  display: grid;
  align-content: center;
  min-width: 0;
}

.file-card-main strong {
  overflow: hidden;
  color: #111827;
  font-size: 13px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-card-main span {
  overflow: hidden;
  color: #667085;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-badges {
  display: flex;
  grid-column: 1 / -1;
  flex-wrap: wrap;
  gap: 6px;
}

.file-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  min-height: 20px;
  border-radius: 999px;
  background: #eef2f6;
  color: #475467;
  font-size: 11px;
  line-height: 20px;
  padding: 0 8px;
}

.file-status.ready,
.file-status.uploaded {
  background: #e7f8ef;
  color: #067647;
}

.file-status.rejected,
.file-status.deleted {
  background: #fee4e2;
  color: #b42318;
}

.file-status.locked {
  background: #fff7e6;
  color: #b54708;
}

.file-detail {
  display: grid;
  gap: 12px;
  overflow: auto;
  padding: 12px;
}

.file-detail-preview {
  display: grid;
  width: 100%;
  aspect-ratio: 16 / 10;
  place-items: center;
  border: 1px solid #e4e7ec;
  border-radius: 6px;
  background: #f8fafc;
  color: #006be6;
  font-size: 42px;
  overflow: hidden;
}

.file-detail dl {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  margin: 0;
  border-top: 1px solid #e4e7ec;
}

.file-detail dt,
.file-detail dd {
  min-height: 30px;
  margin: 0;
  border-bottom: 1px solid #e4e7ec;
  font-size: 12px;
  line-height: 30px;
  padding: 0 8px;
}

.file-detail dt {
  background: #f8fafc;
  color: #475467;
  font-weight: 700;
}

.file-detail dd {
  overflow: hidden;
  color: #111827;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 240px;
  color: #667085;
  font-size: 13px;
}

.file-empty i {
  color: #98a2b3;
  font-size: 28px;
}

.file-empty.compact {
  min-height: 180px;
  padding: 16px;
}

.file-empty.error {
  color: #b42318;
}

.context-menu {
  position: fixed;
  z-index: 1000;
  display: grid;
  min-width: 160px;
  border: 1px solid #cfd7e3;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 12px 28px rgb(15 23 42 / 14%);
  padding: 4px;
}

.context-menu button {
  display: grid;
  align-items: center;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 8px;
  min-height: 32px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #111827;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  padding: 0 8px;
  text-align: left;
}

.context-menu button:hover {
  background: #eef2f6;
}

.context-menu button.danger {
  color: #b42318;
}

.context-menu button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 1100px) {
  .file-workbench {
    grid-template-columns: 200px minmax(0, 1fr);
  }

  .file-detail-panel {
    display: none;
  }
}

@media (max-width: 760px) {
  .file-toolbar,
  .file-list-header {
    align-items: stretch;
    flex-direction: column;
  }

  .file-toolbar-actions {
    justify-content: flex-start;
  }

  .file-workbench {
    grid-template-columns: 1fr;
  }

  .file-tree-panel {
    max-height: 220px;
  }

  .file-search {
    width: 100%;
  }
}
</style>
