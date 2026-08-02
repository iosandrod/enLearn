# ExtendCellArea Plugin Development Plan

## 1. Target

Create an independent vxe-table plugin that adds Excel/WPS-like cell area operations:

- Drag to select a rectangular cell area.
- Ctrl / Meta + left click to create multiple selected areas.
- Drag the bottom-right fill handle to extend the active area.
- Fill extended cells by copying source values.
- Fill extended cells by numeric series increment.
- Disable selection for specified columns.
- Support area selection across fixed-left, main, and fixed-right table sections.

The plugin should live outside the core repository at:

```text
C:\Users\11516\Downloads\vxe-table-main\area-plugin
```

## 2. Integration Strategy

The current vxe-table code already reserves the key entry points for a cell-area plugin. We should use `VxeUI.hooks.add(...)` and inject methods into `$xeTable` / `$xeGrid`, instead of modifying the large `packages/table/src/table.ts` file directly.

Main host methods to implement:

- `triggerCelllAreaMnEvent`
- `triggerCellAreaExtendMousedownEvent`
- `handleRecalculateCellAreaEvent`
- `handleKeyboardCellAreaEvent`
- `handlePeClAreaEvent`
- `handleCyClAreaEvent`
- `handleCutCellAreaEvent`
- `getCellAreas`
- `getActiveCellArea`
- `clearCellAreas`
- `clearCopyCellArea`

The host already renders the area overlay nodes:

- `.vxe-table--cell-main-area`
- `.vxe-table--cell-clip-area`
- `.vxe-table--cell-extend-area`
- `.vxe-table--cell-multi-area`
- `.vxe-table--cell-active-area`
- `.vxe-table--cell-main-area-btn`

So the plugin should focus on state, geometry, event handling, and fill rules.

## 3. Proposed Directory Structure

```text
area-plugin/
  DEVELOPMENT_PLAN.md
  package.json
  tsconfig.json
  src/
    index.ts
    install.ts
    types.ts
    hook.ts
    core/
      store.ts
      geometry.ts
      selection.ts
      extension.ts
      fill.ts
      clipboard.ts
      guards.ts
    dom/
      overlay.ts
      pointer.ts
      scroll.ts
    style/
      index.scss
  examples/
    vue3-basic/
      App.vue
      main.ts
  tests/
    unit/
      geometry.spec.ts
      fill.spec.ts
      guards.spec.ts
```

Initial implementation can skip `examples/` and `tests/` scaffolding if we want to move quickly, but the source layout should leave room for them.

## 4. Public API Draft

```ts
import VxeUITable, { VxeUI } from 'vxe-table'
import ExtendCellArea from 'vxe-table-plugin-extend-cell-area'
import 'vxe-table-plugin-extend-cell-area/style.css'

app.use(VxeUITable)
VxeUI.use(ExtendCellArea, {
  disabledMethod ({ column }) {
    return column.field === 'id'
  },
  fillMode: 'auto'
})
```

Plugin options:

```ts
export interface ExtendCellAreaOptions {
  disabledMethod?: (params: ExtendCellAreaGuardParams) => boolean
  beforeSelectMethod?: (params: ExtendCellAreaSelectParams) => boolean | void
  beforeExtendMethod?: (params: ExtendCellAreaExtendParams) => boolean | void
  fillMode?: 'copy' | 'series' | 'auto'
  allowMulti?: boolean
  allowHeader?: boolean
  allowBody?: boolean
}
```

Column-level opt-out can be supported through `column.params`:

```ts
{
  field: 'id',
  title: 'ID',
  params: {
    extendCellAreaDisabled: true
  }
}
```

## 5. State Model

```ts
export interface CellAreaRange {
  type: 'body' | 'header'
  fixed: 'left' | 'right' | null
  startRow: any | null
  endRow: any | null
  startColumn: any
  endColumn: any
  activeRow: any | null
  activeColumn: any
  rows: any[]
  columns: any[]
}

export interface ExtendCellAreaStore {
  cellAreas: CellAreaRange[]
  activeArea: CellAreaRange | null
  copyArea: CellAreaRange | null
  extendArea: CellAreaRange | null
  isSelecting: boolean
  isExtending: boolean
}
```

Store placement:

- Keep plugin state in a `WeakMap<table, store>` to avoid mutating vxe-table internal data shape.
- Expose state through injected methods only.
- Clear store on table unmount through the hook lifecycle if available, otherwise use the existing `clearCellAreas` path.

## 6. Core Algorithms

Selection:

1. On body/header cell `mousedown`, validate target cell.
2. If not Ctrl / Meta, clear existing areas.
3. Create a draft area from start cell.
4. On `mousemove`, locate hovered cell and normalize row/column bounds.
5. Update overlay position and dispatch `cell-area-selection-drag`.
6. On `mouseup`, finalize area and dispatch `cell-area-selection-end`.

Fixed columns:

- Treat left, main, and right wrappers as three coordinate spaces.
- Split one logical range into one or more visual overlay rectangles.
- Use `half="1"` on fixed-side overlay when the range crosses into the main section.

Extension:

1. Start from the active area's fill handle.
2. Track extension direction: top, bottom, left, or right.
3. Respect `areaConfig.extendDirection`.
4. Build target cells outside the source range.
5. On mouseup, call fill strategy and dispatch `cell-area-extension-fill`.

Fill:

- `copy`: repeat source matrix into target matrix.
- `series`: infer numeric step from source values.
- `auto`: use `series` only when all participating values are numeric or numeric strings; otherwise use `copy`.

Disabled columns:

- A cell is not selectable if:
  - `options.disabledMethod(params)` returns true.
  - `column.params.extendCellAreaDisabled` is true.
  - the column has no writable field for body-fill operations.
- Selection should emit `cell-area-selection-invalid` instead of silently failing.

Clipboard:

- Copy / cut should serialize selected areas as TSV.
- Paste should map TSV matrix into the active area.
- Multi-area paste should require matching shapes, using existing locale key `vxe.error.area.pasteMultiErr`.

## 7. Implementation Phases

### Phase 1: Plugin Skeleton

- Add `package.json`, `tsconfig.json`, `src/index.ts`, `src/hook.ts`.
- Register `VxeUI.hooks.add('extendCellArea', { setupTable, setupGrid })`.
- Inject no-op methods first to silence host warnings for `mouse-config.area`.

Acceptance:

- `mouse-config.area` no longer triggers missing-plugin warnings.
- Table still renders normally.

### Phase 2: Basic Body Area Selection

- Implement single rectangular selection for body cells.
- Implement `getCellAreas`, `getActiveCellArea`, `clearCellAreas`.
- Implement overlay positioning for non-fixed main body.

Acceptance:

- Dragging over body cells shows one selected rectangle.
- `clearCellAreas` hides overlays.

### Phase 3: Multi-Area And Disabled Columns

- Add Ctrl / Meta multi-area behavior.
- Add `disabledMethod` and `column.params.extendCellAreaDisabled`.
- Dispatch invalid selection events.

Acceptance:

- Ctrl + drag preserves previous areas.
- Disabled columns cannot be selected.

### Phase 4: Fixed Column Support

- Detect fixed wrapper from event params.
- Split logical area into visual segments.
- Recalculate overlays after scroll, sort, filter, column resize, and data refresh.

Acceptance:

- Selection works in left/main/right fixed regions.
- Selection remains aligned after horizontal/vertical scroll.

### Phase 5: Extension Handle And Fill

- Implement `triggerCellAreaExtendMousedownEvent`.
- Implement copy fill.
- Implement numeric series fill.
- Dispatch extension events.

Acceptance:

- Dragging the handle expands area.
- Target cells receive copied or incremented values.

### Phase 6: Clipboard And Keyboard

- Implement copy, cut, paste.
- Implement arrow selection updates in `handleKeyboardCellAreaEvent`.
- Add Escape clearing behavior if not already handled by host.

Acceptance:

- Ctrl+C / Ctrl+X / Ctrl+V work with selected areas.
- Keyboard navigation keeps active area coherent.

### Phase 7: Verification And Packaging

- Add example page using local vxe-table source.
- Add unit tests for geometry and fill rules.
- Build ESM/CJS outputs and CSS.

Acceptance:

- Demo covers body selection, multi-selection, fixed columns, disabled columns, fill copy, fill series.
- `npm run build` passes.

## 8. Local Development Workflow

Recommended approach:

1. Develop plugin in `area-plugin`.
2. Test through the independent Vue project at `C:\Users\11516\Downloads\vxe-table-main\area-plugin-vue-test`.
3. Install the published `vxe-table` package in the test project with Yarn.
4. Install this plugin through `file:../area-plugin`.
5. Keep the host vxe-table source project unchanged until plugin behavior is stable.

Suggested scripts:

```json
{
  "dev": "vite --host 0.0.0.0",
  "build": "tsc -p tsconfig.json",
  "test": "vitest run",
  "typecheck": "tsc -p tsconfig.json --noEmit"
}
```

Current test command:

```shell
cd C:\Users\11516\Downloads\vxe-table-main\area-plugin-vue-test
yarn test:e2e
```

## 9. Risks

- The host type declarations are mostly re-exported from `vxe-pc-ui`, so plugin-specific method typing may need module augmentation.
- Large virtual scroll ranges can make overlay coordinate calculation tricky; selection should use rendered cell positions, not only row/column indexes.
- Fixed columns require multiple overlays for one logical area.
- `mouse-config.area` conflicts with `mouse-config.selected`; the plugin should document this and avoid enabling both.
- Tree tables require `tree-config.transform=true` according to the host checks.

## 10. First Coding Milestone

Create a minimal plugin that:

- Registers `extendCellArea` hook.
- Injects all expected methods.
- Supports one body-cell selection rectangle in the main body area.
- Updates `.vxe-table--cell-main-area`.
- Exposes `getCellAreas()` and `clearCellAreas()`.

This gives us a visible, testable vertical slice before tackling the harder fixed-column and fill behavior.
