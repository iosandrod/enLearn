/*
 * @Author: 卜启缘
 * @Date: 2021-06-11 18:08:01
 * @LastEditTime: 2021-07-07 21:53:06
 * @LastEditors: 卜启缘
 * @Description: 动画组件
 * @FilePath: \vite-vue3-lowcode\src\visual-editor\components\right-attribute-panel\components\animate\Animate.tsx
 */
import { defineComponent, onMounted, reactive, ref, watchEffect } from 'vue';
import { ElTabs, ElTabPane, ElRow, ElCol, ElButton, ElAlert, ElIcon } from '../../../common/designer-ui';
import { onClickOutside } from '@vueuse/core';
import { Plus, CaretRight } from '../../../common/remix-icons';
import { animationTabs } from './animateConfig';
import styles from './animate.module.scss';
import type { Animation } from '../../../../visual-editor.utils';
import { useVisualData } from '../../../../hooks/useVisualData';
import { useAnimate } from '../../../../../hooks/useAnimate';
import LowCodeForm from '../../../../../components/LowCodeForm.vue';
import { useLowCodeHost } from '../../../../../core/host';
import { isLowCodeFormSchema } from '../../../../../lowcode/form-schema';
import type { LowCodeFormSchema, LowCodeField } from '../../../../../types/lowcode';
export const Animate = defineComponent({
  setup() {
    const { currentBlock } = useVisualData();
    const host = useLowCodeHost();
    const target = ref<InstanceType<typeof HTMLDivElement>>();
    const animationFormSchema = ref<LowCodeFormSchema | null>(null);
    const schemaLoadError = ref('');

    const state = reactive({
      activeName: '',
      isAddAnimates: false, // 是否显示添加动画集
      changeTargetIndex: -1, // 要修改的动画的索引
    });

    onClickOutside(target, () => (state.isAddAnimates = false));

    onMounted(async () => {
      try {
        const rows = await host.getServiceApi().invoke<Array<{ schema?: unknown }>>(
          'lowcode',
          'listItems',
          {
            resource: 'lowcode_form_definitions',
            filters: { code: 'visual-editor.animation', enabled: true },
            limit: 1,
          },
        );
        const schema = Array.isArray(rows) ? rows[0]?.schema : undefined;
        if (!isLowCodeFormSchema(schema)) {
          throw new Error('动画表单 schema 不存在或格式无效');
        }
        animationFormSchema.value = schema;
      } catch (error) {
        schemaLoadError.value = error instanceof Error ? error.message : '动画表单加载失败';
      }
    });

    watchEffect((onInvalidate) => {
      if (state.isAddAnimates) {
        state.activeName = 'in';
      } else {
        state.changeTargetIndex = -1;
      }
      onInvalidate(() => {
        console.log('onInvalidate');
      });
    });

    /**
     * @description 运行动画
     */
    const runAnimation = (animation: Animation | Animation[] = []) => {
      const blockRef = window.$$refs[currentBlock.value._vid] as
        | HTMLElement
        | { $el?: HTMLElement }
        | undefined;
      let animateEl =
        (blockRef && '$el' in blockRef ? blockRef.$el : undefined) ??
        (blockRef as HTMLElement | undefined);

      animateEl = animateEl?.closest('.list-group-item')?.firstChild as HTMLElement;

      if (animateEl) {
        useAnimate(animateEl, animation);
      }
    };

    /**
     * @description 点击要修改的动画名称
     */
    const clickAnimateName = (index) => {
      state.changeTargetIndex = index;
      state.isAddAnimates = true;
    };

    /**
     * @description 删除动画
     * @param index 要删除的动画的索引
     * @returns
     */
    const delAnimate = (index: number) => currentBlock.value.animations?.splice(index, 1);

    /**
     * @description 添加/修改 动画
     */
    const addOrChangeAnimate = (animateItem: Animation) => {
      const animation: Animation = {
        ...animateItem,
      };
      if (state.changeTargetIndex == -1) {
        currentBlock.value.animations?.push(animation);
      } else {
        // 修改动画
        currentBlock.value.animations![state.changeTargetIndex] = animation;
        state.changeTargetIndex = -1;
      }
      state.isAddAnimates = false;
      console.log(currentBlock.value.animations, '当前组件的动画');
    };

    const updateAnimationField = (
      index: number,
      payload: { field: LowCodeField; value: unknown },
    ) => {
      const animation = currentBlock.value.animations?.[index];
      if (!animation || !['duration', 'delay', 'count', 'infinite'].includes(payload.field.field)) {
        return;
      }

      if (payload.field.field === 'infinite') {
        animation.infinite = payload.value === true;
        return;
      }

      const value = Number(payload.value);
      if (Number.isFinite(value)) {
        animation[payload.field.field] = value;
      }
    };

    // 已添加的动画列表组件
    const AddedAnimateList = () => (
      <>
        {currentBlock.value.animations?.map((item, index) => (
          <ElAlert
            key={item.value}
            type={'info'}
            style={{ marginTop: '12px' }}
            onClose={() => delAnimate(index)}
          >
            {{
              title: () => (
                <div>
                  <span class={'title'}>{`动画${index + 1}`}</span>
                  <span onClick={() => clickAnimateName(index)} class={'label'}>
                    {item.label}
                  </span>

                  <span onClick={() => runAnimation(item)} class={'play'} title={'播放'}>
                    <ElIcon size={20}>
                      <CaretRight></CaretRight>
                    </ElIcon>
                  </span>
                </div>
              ),
              default: () => (
                <>
                  {animationFormSchema.value ? (
                    <LowCodeForm
                      schema={animationFormSchema.value}
                      modelValue={item}
                      vertical
                      onFieldChange={(payload) => updateAnimationField(index, payload)}
                    />
                  ) : schemaLoadError.value ? (
                    <div class={styles.schemaError}>{schemaLoadError.value}</div>
                  ) : (
                    <div class={styles.schemaLoading}>正在加载动画表单...</div>
                  )}
                </>
              ),
            }}
          </ElAlert>
        ))}
      </>
    );

    // 可添加的动画列表组件
    const AnimateList = () => (
      <ElTabs v-model={state.activeName} stretch>
        {Object.entries(animationTabs).map(([tabKey, animationBox]) => (
          <ElTabPane label={animationTabs[tabKey].label} name={tabKey} key={tabKey}>
            <ElRow gutter={10}>
              {animationBox.value.map((animateItem: Animation) => (
                <ElCol span={8} key={animateItem.value}>
                  <div
                    class={'animate-item'}
                    onClick={() => addOrChangeAnimate(animateItem)}
                    onMouseenter={() => runAnimation(animateItem)}
                  >
                    {animateItem.label}
                  </div>
                </ElCol>
              ))}
            </ElRow>
          </ElTabPane>
        ))}
      </ElTabs>
    );

    return () => (
      <div ref={target} class={styles.animate}>
        <div v-show={!state.isAddAnimates}>
          <ElButton
            type={'primary'}
            disabled={!currentBlock.value.animations}
            plain
            icon={Plus}
            onClick={() => (state.isAddAnimates = true)}
          >
            添加动画
          </ElButton>
          <ElButton
            type={'primary'}
            disabled={!currentBlock.value.animations?.length}
            plain
            icon={CaretRight}
            onClick={() => runAnimation(currentBlock.value.animations)}
          >
            播放动画
          </ElButton>
          <AddedAnimateList />
        </div>
        <AnimateList v-show={state.isAddAnimates} />
      </div>
    );
  },
});
