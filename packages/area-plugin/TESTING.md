# Testing

The plugin is developed in:

```text
C:\Users\11516\Downloads\vxe-table-main\area-plugin
```

The independent Vue test project is:

```text
C:\Users\11516\Downloads\vxe-table-main\area-plugin-vue-test
```

## Install

The test project uses Yarn and installs the published `vxe-table` package plus the local plugin package:

```shell
cd C:\Users\11516\Downloads\vxe-table-main\area-plugin-vue-test
yarn install
```

Because the published `vxe-table` ESM package imports these runtime packages directly, the test app also installs:

- `@vxe-ui/core`
- `vxe-pc-ui`
- `xe-utils`
- `dom-zindex`

## Run Automated Tests

```shell
cd C:\Users\11516\Downloads\vxe-table-main\area-plugin-vue-test
yarn test:e2e
```

The e2e script rebuilds the plugin first:

```shell
yarn --cwd ../area-plugin build
```

Then Playwright starts the Vue app on a dedicated local port and verifies:

- `vxe-table` renders with `mouse-config.area`.
- The local plugin is installed through `VxeUI.use(...)`.
- A disabled column rejects area selection.
- A normal body cell creates a cell area.
- At least one cell-area overlay becomes visible.
