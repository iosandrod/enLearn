# @enlearn/mobile-table

独立可发布的 Hippy/Vue 移动虚拟表格控件。支持行与中心列虚拟化、固定左右列、本地排序、行选择、行操作和自定义滚动条。

```ts
import { MobileVirtualTable, getRowWindow } from '@enlearn/mobile-table';
```

算法也可单独使用：`@enlearn/mobile-table/virtual-table`。

发布（在仓库根目录执行）：

```bash
pnpm --filter @enlearn/mobile-table publish --access public
```

`pnpm publish` 会将工作区依赖协议替换为已发布版本。
