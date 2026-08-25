<template>
  <div class="admin-menu-node">
    <div class="admin-menu-row" :class="[`level-${level}`]">
      <button
        v-if="hasChildren"
        class="admin-menu-group admin-menu-main"
        :class="[`level-${level}`, { 'router-link-active': isCurrentPageActive, 'is-inactive': isInactive }]"
        type="button"
        :aria-expanded="isExpanded"
        @click="emit('toggle', item.code)"
        @contextmenu="handleContextMenu"
      >
        <span class="admin-menu-title">{{ item.title }}</span>
        <span class="admin-menu-state">{{ isExpanded ? '-' : '+' }}</span>
      </button>

      <RouterLink
        v-else-if="mode === 'link'"
        class="admin-menu-link admin-menu-main"
        :class="[`level-${level}`, { 'router-link-active': isCurrentPageActive, 'is-inactive': isInactive }]"
        :to="item.path"
        role="menuitem"
        @click="handleLinkClick"
        @contextmenu="handleContextMenu"
      >
        <span class="admin-menu-title">{{ item.title }}</span>
      </RouterLink>

      <button
        v-else
        class="admin-menu-link admin-menu-main"
        :class="[`level-${level}`, { 'router-link-active': isActive, 'is-disabled': mode !== 'action' && !hasPageCode, 'is-inactive': isInactive }]"
        type="button"
        :disabled="mode !== 'action' && !hasPageCode"
        :title="hasPageCode ? item.title : (mode === 'action' ? '点击创建低代码页面' : '未关联低代码页面')"
        @click="handleSelect"
        @contextmenu="handleContextMenu"
      >
        <span class="admin-menu-title">{{ item.title }}</span>
      </button>

      <div v-if="showActions" class="admin-menu-actions">
        <button
          class="admin-menu-action"
          type="button"
          :disabled="isActionLoading('edit-page') || !canEditPage"
          :aria-label="canEditPage ? '编辑关联页面' : '父级菜单无编辑页面'"
          :title="canEditPage ? '编辑关联页面' : '父级菜单无编辑页面'"
          @click.stop="handleEditPage"
        >
          <i
            :class="isActionLoading('edit-page') ? 'ri-loader-4-line admin-spin' : 'ri-pencil-line'"
            aria-hidden="true"
          />
        </button>
        <button
          class="admin-menu-action"
          type="button"
          :disabled="isActionLoading('add-child')"
          aria-label="新增子菜单"
          title="新增子菜单"
          @click.stop="emit('add-child', item)"
        >
          <i
            :class="isActionLoading('add-child') ? 'ri-loader-4-line admin-spin' : 'ri-add-line'"
            aria-hidden="true"
          />
        </button>
        <button
          class="admin-menu-action"
          type="button"
          :disabled="isActionLoading('toggle-visible')"
          :aria-label="isInactive ? '显示菜单' : '隐藏菜单'"
          :title="isInactive ? '显示菜单' : '隐藏菜单'"
          @click.stop="emit('toggle-visible', item)"
        >
          <i
            :class="
              isActionLoading('toggle-visible')
                ? 'ri-loader-4-line admin-spin'
                : (isInactive ? 'ri-eye-line' : 'ri-eye-off-line')
            "
            aria-hidden="true"
          />
        </button>
      </div>
    </div>

    <div v-if="hasChildren && isExpanded" class="admin-submenu">
      <SystemMenuTreeNode
        v-for="child in item.children"
        :key="child.code"
        :item="child"
        :expanded-groups="expandedGroups"
        :accordion="accordion"
        :filtering="filtering"
        :level="level + 1"
        :mode="mode"
        :active-code="activeCode"
        :show-actions="showActions"
        :action-loading-code="actionLoadingCode"
        @context="(payload) => emit('context', payload)"
        @toggle="(code) => emit('toggle', code)"
        @select="(node) => emit('select', node)"
        @edit-page="(node) => emit('edit-page', node)"
        @add-child="(node) => emit('add-child', node)"
        @toggle-visible="(node) => emit('toggle-visible', node)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { AdminRouteNode } from '../utils/admin-navigation';

defineOptions({
  name: 'SystemMenuTreeNode',
});

type MenuContextPayload = {
  event: MouseEvent;
  item: AdminRouteNode;
};

const props = withDefaults(defineProps<{
  item: AdminRouteNode;
  expandedGroups: Record<string, boolean>;
  accordion?: boolean;
  filtering?: boolean;
  level?: number;
  mode?: 'link' | 'action';
  activeCode?: string;
  showActions?: boolean;
  actionLoadingCode?: string;
}>(), {
  accordion: false,
  filtering: false,
  level: 0,
  mode: 'link',
  activeCode: '',
  showActions: false,
  actionLoadingCode: '',
});

const emit = defineEmits<{
  context: [payload: MenuContextPayload];
  toggle: [code: string];
  select: [item: AdminRouteNode];
  'edit-page': [item: AdminRouteNode];
  'add-child': [item: AdminRouteNode];
  'toggle-visible': [item: AdminRouteNode];
}>();

const hasChildren = computed(() => Boolean(props.item.children?.length));
const isExpanded = computed(
  () => props.filtering || (
    props.accordion
      ? props.expandedGroups[props.item.code] === true
      : props.expandedGroups[props.item.code] !== false
  )
);
const hasPageCode = computed(() => Boolean(props.item.page_code?.trim()));
const canEditPage = computed(() => hasPageCode.value && !hasChildren.value);
const isInactive = computed(
  () => props.item.status === 'inactive' || props.item.visible === false
);
const isActive = computed(
  () => props.activeCode.trim() !== '' && props.item.page_code?.trim() === props.activeCode.trim()
);
const isCurrentPageActive = computed(
  () => props.activeCode.trim() !== '' && props.item.page_code?.trim() === props.activeCode.trim()
);

function isActionLoading(action: 'edit-page' | 'add-child' | 'toggle-visible') {
  return props.actionLoadingCode === `${action}:${props.item.code}`;
}

function handleContextMenu(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  emit('context', { event, item: props.item });
}

function handleSelect() {
  if (props.mode !== 'action' || props.item.route_type === 'link' || props.item.route_type === 'group') return;
  emit('select', props.item);
}

function handleLinkClick(event: MouseEvent) {
  if (hasPageCode.value || props.item.route_type === 'link' || props.item.route_type === 'group') return;
  event.preventDefault();
  event.stopPropagation();
  emit('select', props.item);
}

function handleEditPage() {
  if (!canEditPage.value) return;
  emit('edit-page', props.item);
}
</script>
