# vxe-table-plugin-search-panel

Injects a compact find/replace panel shell into every `vxe-table` and `vxe-grid`.
After a table has focus, press `Ctrl+F` (or `Cmd+F`) to open the panel in the
table's upper-right corner.

The current version provides the panel UI and lifecycle only. Matching,
navigation, and replacement behavior can be added without changing host tables.

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
