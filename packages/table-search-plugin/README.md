# vxe-table-plugin-search-panel

Injects a compact find/replace panel into every `vxe-table` and `vxe-grid`.
After a table has focus, press `Ctrl+F` (or `Cmd+F`) to open the panel in the
table's upper-right corner.

The panel searches formatted values across visible data columns. Match case,
whole-word, and regular-expression modes are supported. Use the filter button
to keep only matching rows; matching text is highlighted in yellow. Turning the
filter off or closing the panel restores the rows while preserving the table's
existing column filters.

```ts
import { VxeUI } from 'vxe-table'
import TableSearchPanel from 'vxe-table-plugin-search-panel'
import 'vxe-table-plugin-search-panel/style.css'

VxeUI.use(TableSearchPanel, {
  defaultExpanded: true
})
```

Use the `VxeUI` exported by `vxe-table` so the plugin and table always share
the same hook registry, even when `vxe-pc-ui` resolves a different core patch.

The plugin injects these methods into both table and grid instances:

- `openTableSearchPanel(options?)`
- `closeTableSearchPanel()`
- `toggleTableSearchPanel(force?)`
- `isTableSearchPanelVisible()`
