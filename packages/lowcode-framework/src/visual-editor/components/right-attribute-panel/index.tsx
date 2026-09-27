/*
 * @Author: 卜启缘
 * @Date: 2021-06-01 13:22:14
 * @LastEditTime: 2021-07-05 11:06:49
 * @LastEditors: 卜启缘
 * @Description: 属性编辑器
 * @FilePath: \vite-vue3-lowcode\src\visual-editor\components\right-attribute-panel\index.tsx
 * RightAttributePanel
 */

import { defineComponent, onBeforeUnmount, onMounted, reactive, watch } from 'vue';
import { ElTabPane, ElTabs } from '../common/designer-ui';
import { DArrowLeft, DArrowRight } from '../common/remix-icons';
import styles from './index.module.scss';
import { AttrEditor, Animate, PageSetting, EventAction, FormRule, HooksEditor } from './components';
import { useVisualData } from '../../hooks/useVisualData';

export default defineComponent({
  name: 'RightAttributePanel',
  props: {
    showPageSetting: {
      type: Boolean,
      default: true,
    },
  },
  setup(props) {
    const { currentBlock } = useVisualData();
    const isFormBlock = () => {
      const block = currentBlock.value;
      return (
        ['form', 'lowcode-search-form', 'lowcode-edit-form'].includes(block.componentKey) ||
        Array.isArray(block.props?.fields)
      );
    };

    const state = reactive({
      activeName: 'attr',
      isOpen: true,
    });

    const syncViewport = () => {
      if (typeof window === 'undefined') return;
      const isMobile = window.matchMedia('(max-width: 1024px)').matches;
      state.isOpen = !isMobile;
    };
    let mediaQuery: MediaQueryList | null = null;

    onMounted(() => {
      mediaQuery = window.matchMedia('(max-width: 1024px)');
      syncViewport();
      mediaQuery.addEventListener('change', syncViewport);
    });

    onBeforeUnmount(() => {
      mediaQuery?.removeEventListener('change', syncViewport);
    });

    watch(
      () => currentBlock.value.componentKey,
      () => {
        if (!isFormBlock() && state.activeName == 'form-rule') {
          state.activeName = 'attr';
        }
      },
    );

    return () => (
      <>
        <div class={[styles.drawer, { [styles.isOpen]: state.isOpen }]}>
          <div
            class={styles.floatingActionBtn}
            role="button"
            tabindex={0}
            aria-label={state.isOpen ? '收起属性面板' : '打开属性面板'}
            onClick={() => (state.isOpen = !state.isOpen)}
            onKeydown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') state.isOpen = !state.isOpen;
            }}
          >
            {state.isOpen ? <DArrowRight /> : <DArrowLeft />}
          </div>
          <div class={styles.attrs}>
            <ElTabs
              v-model={state.activeName}
              type="border-card"
              stretch={true}
              class={styles.tabs}
            >
              <ElTabPane label="属性" name="attr">
                <div class={styles.panelBody}>
                  <AttrEditor />
                </div>
              </ElTabPane>
              <ElTabPane label="动画" name="animate" lazy>
                <div class={styles.panelBody}>
                  <Animate />
                </div>
              </ElTabPane>
              <ElTabPane label="事件" name="events">
                <div class={styles.panelBody}>
                  <EventAction />
                </div>
              </ElTabPane>
              <ElTabPane label="钩子" name="hooks" lazy>
                <div class={styles.panelBody}>
                  <HooksEditor />
                </div>
              </ElTabPane>
              {isFormBlock() ? (
                <ElTabPane label="规则" name="form-rule" lazy>
                  <div class={styles.panelBody}>
                    <FormRule />
                  </div>
                </ElTabPane>
              ) : null}
              {props.showPageSetting ? (
                <ElTabPane label="页面设置" name="page-setting">
                  <div class={styles.panelBody}>
                    <PageSetting />
                  </div>
                </ElTabPane>
              ) : null}
            </ElTabs>
          </div>
        </div>
      </>
    );
  },
});
