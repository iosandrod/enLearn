import { isPlainRecord, readBoolean, readDimension, readString, readVisualBlockProps, toBlockId, } from '../helpers';
const runtimeKinds = new Set(['container', 'section', 'modal', 'drawer']);
function normalizeRuntimeKind(value) {
    const kind = readString(value, 'container');
    return runtimeKinds.has(kind) ? kind : 'container';
}
function readSlotChildren(value) {
    if (!isPlainRecord(value))
        return [];
    return Object.entries(value)
        .filter(([key, slot]) => key !== 'value' && isPlainRecord(slot))
        .sort(([prevKey], [nextKey]) => {
        const prevIndex = Number(prevKey.replace('slot', ''));
        const nextIndex = Number(nextKey.replace('slot', ''));
        return prevIndex - nextIndex;
    })
        .flatMap(([, slot]) => {
        const children = slot.children;
        return Array.isArray(children) ? children : [];
    });
}
const converter = {
    type: 'layout',
    componentKey: 'layout',
    order: 5,
    defaultProps: {
        blockId: 'container-block',
        runtimeKind: 'container',
        title: '',
        description: '',
        open: false,
        width: '',
        placement: 'right',
        gutter: '',
    },
    toRuntimeBlock(block, context) {
        const props = readVisualBlockProps(block);
        const id = toBlockId(props.blockId, block._vid);
        const title = readString(props.title);
        const description = readString(props.description);
        const runtimeKind = normalizeRuntimeKind(props.runtimeKind);
        const blocks = context.convertBlocks(readSlotChildren(props.slots));
        const overlays = Array.isArray(props.overlays)
            ? context.convertOverlays(props.overlays)
            : [];
        const width = readDimension(props.width);
        if (runtimeKind === 'modal') {
            return {
                id,
                kind: 'modal',
                ...(title ? { title } : {}),
                ...(description ? { description } : {}),
                open: readBoolean(props.open, false),
                ...(typeof width !== 'undefined' ? { width } : {}),
                blocks,
                ...(overlays.length ? { overlays } : {}),
            };
        }
        if (runtimeKind === 'drawer') {
            const placement = readString(props.placement, 'right');
            return {
                id,
                kind: 'drawer',
                ...(title ? { title } : {}),
                ...(description ? { description } : {}),
                open: readBoolean(props.open, false),
                ...(typeof width !== 'undefined' ? { width } : {}),
                placement: placement === 'left' ? 'left' : 'right',
                blocks,
                ...(overlays.length ? { overlays } : {}),
            };
        }
        if (runtimeKind === 'section') {
            return {
                id,
                kind: 'section',
                ...(title ? { title } : {}),
                ...(description ? { description } : {}),
                panel: readBoolean(props.panel, true),
                blocks,
            };
        }
        const gap = readDimension(props.gutter);
        return {
            id,
            kind: 'container',
            ...(title ? { title } : {}),
            ...(description ? { description } : {}),
            columns: blocks.length ? blocks.length : 1,
            gap: typeof gap === 'number' ? gap : Number(gap) || 8,
            panel: readBoolean(props.panel, false),
            blocks,
        };
    },
};
export default converter;
