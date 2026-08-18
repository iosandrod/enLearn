# vxe-table-plugin-advanced-filter

Excel-like local advanced filtering for `vxe-table` and `vxe-grid`. The plugin
uses VXE's native filter lifecycle, so it filters only rows that are already
loaded in the table and never performs a remote request.

```ts
import { VxeUI } from 'vxe-table'
import AdvancedFilterPlugin from 'vxe-table-plugin-advanced-filter'
import 'vxe-table-plugin-advanced-filter/style.css'

VxeUI.use(AdvancedFilterPlugin)
```

Enable it for a table through `params`:

```ts
const gridOptions = {
  params: { advancedFilter: true },
  columns: [
    { field: 'name', title: '名称' },
    { field: 'score', title: '分数', params: { advancedFilter: { dataType: 'number' } } }
  ]
}
```

Set `autoEnable: true` during installation to enable every eligible table, or
set `params.advancedFilter.enabled` per table. Sequence, checkbox, radio,
expand, HTML, action, and fieldless columns are skipped automatically.

Custom conditions are shown in the filter panel after they are confirmed.
While one or two conditions are active, they are the column's filter mode and
the value checklist is disabled. Removing the last condition restores value
selection.

Injected table and grid methods:

- `openAdvancedFilter(field)`
- `getAdvancedFilterState(field?)`
- `setAdvancedFilterState(field, state, options?)`
- `clearAdvancedFilter(field?)`
- `isAdvancedFilterActive(field?)`
- `refreshAdvancedFilterValues(field?)`
- `configureAdvancedFilter(options?)`
