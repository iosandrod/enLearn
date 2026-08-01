import { renderSlot, useSlots, watchEffect } from 'vue';
import { Col, Row } from '../../../components/LegacyWidgets';
import styleModule from './index.module.scss';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { createEditorInputProp, createEditorSelectProp } from '../../../visual-editor/visual-editor.props';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

interface SlotItem {
  key: string;
  span: number;
  children: any[];
  [prop: string]: any;
}

type LayoutSlots = Record<string, SlotItem | string | undefined> & {
  value?: string;
};

const DEFAULT_RATIO = '12:12';
const MAX_COLUMNS = 24;
const MIN_SPAN = 1;
const MAX_SPAN = 24;
const slotsTemp = {} as any;

const clampSpan = (value: unknown, fallback = MIN_SPAN) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(MAX_SPAN, Math.max(MIN_SPAN, Math.round(numeric)));
};

const stringifySpans = (spans: unknown[]) =>
  spans.map((span) => String(clampSpan(span))).join(':');

const parseRatio = (value: unknown, fallback: number[] = [12, 12]) => {
  if (Array.isArray(value)) {
    const spans = value.map((span) => clampSpan(span)).filter(Boolean).slice(0, MAX_COLUMNS);
    return spans.length ? spans : fallback;
  }

  const spans = String(value || '')
    .split(/[:锛?\s]+/)
    .map((span) => clampSpan(span, 0))
    .filter((span) => span > 0)
    .slice(0, MAX_COLUMNS);

  return spans.length ? spans : fallback;
};

const isSlotItem = (value: unknown): value is SlotItem =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sortSlotEntries = (slots: LayoutSlots) =>
  Object.entries(slots)
    .filter(([key, value]) => key !== 'value' && isSlotItem(value))
    .sort(([prevKey], [nextKey]) => {
      const prevIndex = Number(prevKey.replace('slot', ''));
      const nextIndex = Number(nextKey.replace('slot', ''));
      return prevIndex - nextIndex;
    }) as [string, SlotItem][];

const readSlotItems = (slots: unknown): SlotItem[] => {
  if (!isSlotItem(slots)) return [];

  return sortSlotEntries(slots as LayoutSlots).map(([key, item], index) => ({
    ...item,
    key: item.key || key || `slot${index}`,
    span: clampSpan(item.span),
    children: Array.isArray(item.children) ? item.children : [],
  }));
};

const createSlotsFromSpans = (spans: number[], previousSlots?: unknown): LayoutSlots => {
  const previousItems = readSlotItems(previousSlots);
  return spans.reduce(
    (prev, curr, index) => {
      const previousItem = previousItems[index];
      prev[`slot${index}`] = {
        key: `slot${index}`,
        span: clampSpan(curr),
        children: previousItem?.children || [],
      };
      return prev;
    },
    { value: stringifySpans(spans) } as LayoutSlots,
  );
};

const createSlots = (str: string) => createSlotsFromSpans(parseRatio(str));

const getSlotRatioText = (slots: unknown, fallbackItems: SlotItem[]) => {
  if (isSlotItem(slots) && typeof (slots as LayoutSlots).value === 'string') {
    return String((slots as LayoutSlots).value);
  }

  return fallbackItems.length ? stringifySpans(fallbackItems.map((item) => item.span)) : DEFAULT_RATIO;
};

export default {
  key: 'layout',
  moduleName: 'containerComponents',
  label: '甯冨眬瀹瑰櫒',
  preview: () => (
    <Row gutter="20">
      <Col span="8">span: 8</Col>
      <Col span="8">span: 8</Col>
      <Col span="8">span: 8</Col>
    </Row>
  ),
  render: ({ props, styles, block, custom }) => {
    const slots = useSlots();
    const { registerRef } = useGlobalProperties();
    let rowElement: HTMLElement | null = null;

    slotsTemp[block._vid] ??= {};

    const commitSlotItems = (items: SlotItem[]) => {
      const nextSlots = createSlotsFromSpans(
        items.map((item) => item.span),
        items.reduce((prev, item, index) => {
          prev[`slot${index}`] = {
            ...item,
            key: `slot${index}`,
            children: item.children || [],
          };
          return prev;
        }, {} as LayoutSlots),
      );
      props.slots = nextSlots;
      block.props.slots = nextSlots;
      slotsTemp[block._vid] = nextSlots;
    };

    const ensureLayoutSlots = () => {
      const currentItems = readSlotItems(props.slots);
      const fallbackSpans = currentItems.length
        ? currentItems.map((item) => item.span)
        : parseRatio(DEFAULT_RATIO);
      const nextSpans = parseRatio(getSlotRatioText(props.slots, currentItems), fallbackSpans);
      const nextRatio = stringifySpans(nextSpans);
      const currentRatio = stringifySpans(currentItems.map((item) => item.span));
      const currentValue = isSlotItem(props.slots) ? (props.slots as LayoutSlots).value : '';

      if (!isSlotItem(props.slots) || !currentItems.length || currentRatio !== nextRatio || currentValue !== nextRatio) {
        const nextSlots = createSlotsFromSpans(nextSpans, props.slots);
        props.slots = nextSlots;
        block.props.slots = nextSlots;
        slotsTemp[block._vid] = nextSlots;
        return nextSlots;
      }

      return props.slots as LayoutSlots;
    };

    const getLayoutItems = () => readSlotItems(ensureLayoutSlots());

    const addSlotAfter = (event: MouseEvent, index: number) => {
      event.stopPropagation();
      event.preventDefault();

      const items = getLayoutItems();
      if (items.length >= MAX_COLUMNS) return;

      const source = items[index] || items[items.length - 1];
      let newSpan = MIN_SPAN;

      if (source && source.span > MIN_SPAN) {
        newSpan = Math.floor(source.span / 2);
        source.span -= newSpan;
      } else {
        const donor = items.find((item) => item.span > MIN_SPAN);
        if (donor) donor.span -= MIN_SPAN;
      }

      items.splice(index + 1, 0, {
        key: `slot${index + 1}`,
        span: newSpan,
        children: [],
      });
      commitSlotItems(items);
    };

    const removeSlot = (event: MouseEvent, index: number) => {
      event.stopPropagation();
      event.preventDefault();

      const items = getLayoutItems();
      if (items.length <= 1) return;

      const [removed] = items.splice(index, 1);
      const targetIndex = Math.max(0, index - 1);
      const target = items[targetIndex];

      if (target && removed) {
        target.span += removed.span;
        target.children = [...(target.children || []), ...(removed.children || [])];
      }

      commitSlotItems(items);
    };

    const startResize = (event: MouseEvent, index: number) => {
      event.stopPropagation();
      event.preventDefault();

      const items = getLayoutItems();
      const left = items[index];
      const right = items[index + 1];
      if (!left || !right) return;

      const rowWidth = rowElement?.getBoundingClientRect().width || 0;
      const unitWidth = rowWidth / MAX_SPAN;
      if (!unitWidth) return;

      const startX = event.clientX;
      const startLeftSpan = left.span;
      const pairTotal = left.span + right.span;

      const handleMove = (moveEvent: MouseEvent) => {
        moveEvent.preventDefault();
        const delta = Math.round((moveEvent.clientX - startX) / unitWidth);
        const nextLeftSpan = Math.min(
          pairTotal - MIN_SPAN,
          Math.max(MIN_SPAN, startLeftSpan + delta),
        );
        const nextItems = getLayoutItems();
        if (!nextItems[index] || !nextItems[index + 1]) return;
        nextItems[index].span = nextLeftSpan;
        nextItems[index + 1].span = pairTotal - nextLeftSpan;
        commitSlotItems(nextItems);
      };

      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    };

    const setRowRef = (el: unknown) => {
      rowElement = ((el as any)?.$el || el || null) as HTMLElement | null;
      registerRef(el, block._vid);
    };

    watchEffect(() => {
      readSlotItems(props.slots).forEach((slot, index) => {
        const key = `slot${index}`;
        if (slotsTemp[block._vid][key]?.children) {
          slot.children = slotsTemp[block._vid][key].children;
        }
      });
    });

    return () => {
      const layoutSlots = ensureLayoutSlots();
      const slotItems = readSlotItems(layoutSlots);
      const { slots: _layoutSlots, ...rowProps } = props;

      return (
        <div style={styles}>
          <Row
            ref={setRowRef}
            {...custom}
            {...rowProps}
            class={styleModule.vanRow}
          >
            {slotItems.map((spanItem: SlotItem, spanIndex) => {
              slotsTemp[block._vid][`slot${spanIndex}`] = spanItem;
              return (
                <Col
                  key={spanItem.key}
                  span={spanItem.span}
                  class={styleModule.layoutColumn}
                >
                  <div class={styleModule.layoutColumnBody}>
                    <div
                      class={styleModule.layoutColumnToolbar}
                      onMousedown={(event) => event.stopPropagation()}
                    >
                      <span class={styleModule.layoutColumnSpan}>span {spanItem.span}</span>
                      <button
                        type="button"
                        title="Add column"
                        class={styleModule.layoutColumnAction}
                        onClick={(event) => addSlotAfter(event, spanIndex)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        title="Delete column"
                        class={styleModule.layoutColumnAction}
                        disabled={slotItems.length <= 1}
                        onClick={(event) => removeSlot(event, spanIndex)}
                      >
                        x
                      </button>
                    </div>
                    {renderSlot(slots, `slot${spanIndex}`)}
                  </div>
                  {spanIndex < slotItems.length - 1 && (
                    <span
                      class={styleModule.layoutResizeHandle}
                      title="鎷栧姩璋冩暣鍒楀"
                      onMousedown={(event) => startResize(event, spanIndex)}
                    />
                  )}
                </Col>
              );
            })}
          </Row>
        </div>
      );
    };
  },
  resize: {
    height: true,
    width: true,
  },
  props: {
    gutter: createEditorInputProp({ label: 'Gutter' }),
    slots: createEditorInputProp({
      label: 'Column ratio',
      tips: 'Enter span ratios such as 5:7:12, or drag column handles on the canvas.',
      defaultValue: createSlots(DEFAULT_RATIO),
    }),
    justify: createEditorSelectProp({
      label: '涓昏酱瀵归綈鏂瑰紡',
      options: [
        { label: 'Start', value: 'start' },
        { label: '灞呬腑鎺掑垪', value: 'center' },
        { label: '鍧囧寑瀵归綈', value: 'space-around' },
        { label: '涓ょ瀵归綈', value: 'space-between' },
        { label: 'End', value: 'end' },
      ],
    }),
    align: createEditorSelectProp({
      label: 'Cross axis alignment',
      options: [
        { label: '椤堕儴瀵归綈', value: 'top' },
        { label: '鍨傜洿灞呬腑', value: 'center' },
        { label: '搴曢儴瀵归綈', value: 'bottom' },
      ],
    }),
  },
} as VisualEditorComponent;
