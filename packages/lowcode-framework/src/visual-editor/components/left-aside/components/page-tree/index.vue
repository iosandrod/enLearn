<!--页面树-->
<template>
  <div class="page-tree">
    <vxe-button status="primary" class="page-tree-add" @click="addPage">
      <Plus />
      添加页面
    </vxe-button>

    <div class="page-tree-list">
      <button
        v-for="page in pages"
        :key="page.path"
        type="button"
        class="page-tree-node"
        :class="{ 'is-active': page.path === currentNodeKey }"
        @click="handleNodeClick(page)"
      >
        <span class="page-tree-node-main">
          <span class="page-title">{{ page.title }}</span>
          <span class="page-path">{{ page.path }}</span>
          <vxe-tag v-if="page.isDefault" size="mini" status="primary">默认</vxe-tag>
        </span>
        <span class="page-tree-actions" @click.stop>
          <vxe-button mode="text" status="primary" title="编辑" @click="editPage(page)">
            <Edit />
          </vxe-button>
          <vxe-button mode="text" status="error" title="删除" @click="delPage(page)">
            <Delete />
          </vxe-button>
          <vxe-button mode="text" title="设为首页" @click="setDefaultPage(page)">
            <Link />
          </vxe-button>
        </span>
      </button>
    </div>
  </div>
</template>

  <script lang="tsx" setup>
  import { ref, computed } from 'vue';
  import { VxeUI } from 'vxe-pc-ui';
  import { ElMessage, ElForm, ElFormItem, ElInput } from '../../../common/designer-ui';
  import { Tickets, Plus, Edit, Delete, Link } from '../../../common/remix-icons';
  import type { VisualEditorPage } from '../../../../visual-editor.utils';
  import { useModal } from '../../../../hooks/useModal';
  import { useVisualData, createNewPage } from '../../../../hooks/useVisualData';

  defineOptions({
    name: 'PageTree',
    label: '页面',
    order: 1,
    icon: Tickets,
  });

  const rules = {
    title: [{ required: true, message: '请输入页面标题', trigger: 'blur' }],
    path: [{ required: true, message: '请输入页面路径', trigger: 'blur' }],
  };

  const { jsonData, currentPath, setCurrentPage, deletePage, updatePage, incrementPage } =
    useVisualData();

  const ruleFormRef = ref<InstanceType<typeof ElForm>>();

  const currentNodeKey = computed(() => currentPath.value);
  // 当前要增加或修改的页面
  const operatePageData = ref<VisualEditorPage | null>(null);
  // 增改页面表单数据
  const form = ref({
    title: '',
    path: '',
  });

  // 所有的页面
  const pages = computed(() =>
    Object.keys(jsonData.pages).map((key) => ({
      title: jsonData.pages[key].title,
      path: key,
      isDefault: Boolean(jsonData.pages[key].isDefault),
    })),
  );

  // 点击当前节点
  const handleNodeClick = (data) => {
    setCurrentPage(data.path);
  };

  /**
   * @description 显示新增/编辑模态框
   */
  const showOparateModal = () =>
    useModal({
      title: operatePageData.value ? '编辑页面' : '新增页面',
      props: {
        width: 380,
      },
      content: () => (
        <ElForm ref={ruleFormRef} model={form.value} rules={rules}>
          <ElFormItem prop={'title'} label={'页面标题'} labelWidth={'80px'}>
            <ElInput v-model={form.value.title} />
          </ElFormItem>
          <ElFormItem prop={'path'} label={'页面路径'} labelWidth={'80px'}>
            <ElInput v-model={form.value.path} />
          </ElFormItem>
        </ElForm>
      ),
      onConfirm: () => {
        return new Promise((resolve, reject) => {
          ruleFormRef.value?.validate(async (valid) => {
            if (valid) {
              const { title, path } = form.value;
              if ([title.trim(), path.trim()].includes('')) {
                ElMessage.error('标题或路径不能为空！');
                return;
              }
              if (operatePageData.value) {
                updatePage({
                  newPath: path,
                  oldPath: operatePageData.value.path || path,
                  page: { title },
                });
                setCurrentPage(path);
              } else {
                incrementPage(path, createNewPage({ title }));
              }
              resolve(true);
            } else {
              console.log('error submit!!');
              reject();
              return;
            }
          });
        });
      },
    });

  // 新增页面
  const addPage = () => {
    operatePageData.value = null;
    form.value = {
      title: '',
      path: '',
    };
    showOparateModal();
  };
  // 编辑页面
  const editPage = (data) => {
    operatePageData.value = data;
    form.value = {
      title: data.title,
      path: data.path,
    };
    showOparateModal();
    console.log('子页面数据：', data);
  };
  // 删除子页面
  const delPage = async (data) => {
    console.log('删除子页面数据', data);
    const confirmResult = await VxeUI.modal.confirm({
      title: '删除页面',
      content: '确定要删除该页面吗？',
    });
    if (confirmResult !== 'confirm') return;
    deletePage(data.path, '/');
  };
  // 设置为默认页面
  const setDefaultPage = (data) => {
    console.log('设置该页面为默认页面', data);
  };
</script>

<style lang="scss" scoped>
  .page-tree {
    display: grid;
    gap: 8px;
    padding: 10px 8px;
  }

  .page-tree-add {
    justify-self: start;
  }

  .page-tree-list {
    display: grid;
    gap: 6px;
  }

  .page-tree-node {
    display: flex;
    width: 100%;
    min-height: 42px;
    padding: 7px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: #fff;
    color: #334155;
    font-size: 13px;
    cursor: pointer;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    text-align: left;

    &:hover,
    &.is-active {
      border-color: #bfdbfe;
      background: #eff6ff;
    }
  }

  .page-tree-node-main {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .page-title,
  .page-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .page-path {
    color: #64748b;
    font-size: 12px;
  }

  .page-tree-actions {
    display: inline-flex;
    flex: none;
    gap: 2px;
  }
</style>
