import type {
  OpenTableSearchPanelOptions,
  TableSearchPanelOptions,
  TableSearchPanelText
} from './types.js'

const DEFAULT_TEXT: TableSearchPanelText = {
  panelLabel: '表格查找和替换',
  findPlaceholder: '查找',
  replacePlaceholder: '替换',
  noResults: '无结果',
  expandReplace: '展开替换',
  collapseReplace: '收起替换',
  matchCase: '区分大小写',
  wholeWord: '全词匹配',
  regularExpression: '使用正则表达式',
  preserveCase: '保留大小写',
  previousMatch: '上一个匹配项',
  nextMatch: '下一个匹配项',
  searchOptions: '更多查找选项',
  close: '关闭',
  replace: '替换',
  replaceAll: '全部替换'
}

interface PendingPanelState {
  visible: boolean
  openOptions?: OpenTableSearchPanelOptions
}

interface PanelElements {
  panel: HTMLElement
  expander: HTMLButtonElement
  findInput: HTMLInputElement
  replaceRow: HTMLElement
}

interface DocumentRegistry {
  document: Document
  bindings: Set<TableSearchPanelBinding>
  activeBinding: TableSearchPanelBinding | null
  onPointerDown: (event: Event) => void
  onFocusIn: (event: Event) => void
  onKeyDown: (event: KeyboardEvent) => void
}

interface TableSearchPanelBinding {
  $table: any
  root: HTMLElement
  options: TableSearchPanelOptions
  text: TableSearchPanelText
  elements: PanelElements | null
  visible: boolean
  expanded: boolean
  registry: DocumentRegistry
  resizeObserver: ResizeObserver | null
  onWindowResize: () => void
}

const tableBindingMap = new WeakMap<object, TableSearchPanelBinding>()
const pendingPanelMap = new WeakMap<object, PendingPanelState>()
const documentRegistryMap = new WeakMap<Document, DocumentRegistry>()

function isTableObject(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}

function getRootElement($table: any): HTMLElement | null {
  const root = $table?.getRefMaps?.().refElem?.value
  return root && root.nodeType === 1 ? root as HTMLElement : null
}

function resolveText(options: TableSearchPanelOptions): TableSearchPanelText {
  return {
    ...DEFAULT_TEXT,
    ...(options.text ?? {})
  }
}

function createButton(
  document: Document,
  className: string,
  label: string,
  content: string
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.setAttribute('aria-label', label)
  button.title = label
  button.textContent = content
  return button
}

function createOptionButton(
  document: Document,
  label: string,
  content: string,
  extraClassName = ''
): HTMLButtonElement {
  const button = createButton(
    document,
    `vxe-table-search-panel__option ${extraClassName}`.trim(),
    label,
    content
  )
  button.setAttribute('aria-pressed', 'false')
  button.addEventListener('click', () => {
    button.setAttribute(
      'aria-pressed',
      button.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'
    )
  })
  return button
}

function createInputShell(
  document: Document,
  input: HTMLInputElement,
  options: HTMLButtonElement[]
): HTMLElement {
  const shell = document.createElement('div')
  shell.className = 'vxe-table-search-panel__input-shell'
  shell.append(input, ...options)
  return shell
}

function createPanel(binding: TableSearchPanelBinding): PanelElements {
  const { root, text } = binding
  const document = root.ownerDocument
  const panel = document.createElement('section')
  panel.className = [
    'vxe-table-search-panel',
    binding.options.className?.trim() ?? ''
  ].filter(Boolean).join(' ')
  panel.hidden = true
  panel.setAttribute('role', 'search')
  panel.setAttribute('aria-label', text.panelLabel)
  panel.dataset.visible = 'false'

  const findRow = document.createElement('div')
  findRow.className = 'vxe-table-search-panel__row vxe-table-search-panel__find-row'

  const expander = createButton(
    document,
    'vxe-table-search-panel__icon-button vxe-table-search-panel__expander',
    text.collapseReplace,
    '>'
  )
  expander.setAttribute('aria-expanded', 'true')

  const findInput = document.createElement('input')
  findInput.className = 'vxe-table-search-panel__input'
  findInput.type = 'text'
  findInput.placeholder = text.findPlaceholder
  findInput.setAttribute('aria-label', text.findPlaceholder)
  findInput.autocomplete = 'off'
  findInput.spellcheck = false
  findInput.dataset.role = 'find-input'

  const findShell = createInputShell(document, findInput, [
    createOptionButton(document, text.matchCase, 'Aa'),
    createOptionButton(document, text.wholeWord, 'ab', 'is--whole-word'),
    createOptionButton(document, text.regularExpression, '.*')
  ])

  const status = document.createElement('span')
  status.className = 'vxe-table-search-panel__status'
  status.textContent = text.noResults
  status.setAttribute('aria-live', 'polite')

  const findActions = document.createElement('div')
  findActions.className = 'vxe-table-search-panel__actions'
  const previousButton = createButton(
    document,
    'vxe-table-search-panel__icon-button',
    text.previousMatch,
    '↑'
  )
  const nextButton = createButton(
    document,
    'vxe-table-search-panel__icon-button',
    text.nextMatch,
    '↓'
  )
  const optionsButton = createButton(
    document,
    'vxe-table-search-panel__icon-button vxe-table-search-panel__menu-button',
    text.searchOptions,
    ''
  )
  const closeButton = createButton(
    document,
    'vxe-table-search-panel__icon-button vxe-table-search-panel__close-button',
    text.close,
    '×'
  )
  previousButton.disabled = true
  nextButton.disabled = true
  optionsButton.disabled = true
  findActions.append(previousButton, nextButton, optionsButton, closeButton)
  findRow.append(expander, findShell, status, findActions)

  const replaceRow = document.createElement('div')
  replaceRow.className = 'vxe-table-search-panel__row vxe-table-search-panel__replace-row'
  const replaceSpacer = document.createElement('span')
  replaceSpacer.className = 'vxe-table-search-panel__replace-spacer'

  const replaceInput = document.createElement('input')
  replaceInput.className = 'vxe-table-search-panel__input'
  replaceInput.type = 'text'
  replaceInput.placeholder = text.replacePlaceholder
  replaceInput.setAttribute('aria-label', text.replacePlaceholder)
  replaceInput.autocomplete = 'off'
  replaceInput.spellcheck = false
  replaceInput.dataset.role = 'replace-input'

  const replaceShell = createInputShell(document, replaceInput, [
    createOptionButton(document, text.preserveCase, 'AB')
  ])
  const replaceActions = document.createElement('div')
  replaceActions.className = 'vxe-table-search-panel__replace-actions'
  const replaceButton = createButton(
    document,
    'vxe-table-search-panel__icon-button vxe-table-search-panel__replace-button',
    text.replace,
    '↪'
  )
  const replaceAllButton = createButton(
    document,
    'vxe-table-search-panel__icon-button vxe-table-search-panel__replace-all-button',
    text.replaceAll,
    '↪'
  )
  replaceButton.disabled = true
  replaceAllButton.disabled = true
  replaceActions.append(replaceButton, replaceAllButton)
  replaceRow.append(replaceSpacer, replaceShell, replaceActions)

  panel.append(findRow, replaceRow)
  root.append(panel)

  const elements = { panel, expander, findInput, replaceRow }
  expander.addEventListener('click', () => {
    binding.expanded = !binding.expanded
    applyExpandedState(binding, elements)
  })
  closeButton.addEventListener('click', () => {
    void closeTableSearchPanel(binding.$table)
  })
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      void closeTableSearchPanel(binding.$table)
    }
  })
  applyExpandedState(binding, elements)
  return elements
}

function applyExpandedState(
  binding: TableSearchPanelBinding,
  elements = binding.elements
) {
  if (!elements) return
  elements.replaceRow.hidden = !binding.expanded
  elements.expander.classList.toggle('is--expanded', binding.expanded)
  elements.expander.setAttribute('aria-expanded', String(binding.expanded))
  elements.expander.setAttribute(
    'aria-label',
    binding.expanded ? binding.text.collapseReplace : binding.text.expandReplace
  )
  elements.expander.title = binding.expanded
    ? binding.text.collapseReplace
    : binding.text.expandReplace
  updatePanelPosition(binding)
}

function updatePanelPosition(binding: TableSearchPanelBinding) {
  const panel = binding.elements?.panel
  if (!panel || panel.hidden) return

  const { root } = binding
  const offset = Math.max(0, binding.options.offset ?? 8)
  const rootRect = root.getBoundingClientRect()
  const header = root.querySelector<HTMLElement>('.vxe-table--header-wrapper')
  const headerRect = header?.getBoundingClientRect()
  const headerBottom = headerRect
    ? Math.max(offset, headerRect.bottom - rootRect.top + offset)
    : offset
  let top = offset
  const availableHeight = root.clientHeight

  if (availableHeight > panel.offsetHeight + headerBottom + offset) {
    top = headerBottom
  } else if (availableHeight > panel.offsetHeight + offset * 2) {
    top = Math.min(headerBottom, availableHeight - panel.offsetHeight - offset)
  }

  panel.style.setProperty('--vxe-table-search-panel-top', `${Math.max(offset, top)}px`)
  panel.classList.toggle('is--narrow', root.clientWidth < 440)
}

function findBindingForTarget(
  registry: DocumentRegistry,
  target: EventTarget | null
): TableSearchPanelBinding | null {
  if (!(target instanceof registry.document.defaultView!.Node)) return null

  let match: TableSearchPanelBinding | null = null
  registry.bindings.forEach((binding) => {
    if (!binding.root.contains(target)) return
    if (!match || match.root.contains(binding.root)) {
      match = binding
    }
  })
  return match
}

function createDocumentRegistry(document: Document): DocumentRegistry {
  const registry = {} as DocumentRegistry
  registry.document = document
  registry.bindings = new Set()
  registry.activeBinding = null
  registry.onPointerDown = (event) => {
    registry.activeBinding = findBindingForTarget(registry, event.target)
  }
  registry.onFocusIn = (event) => {
    registry.activeBinding = findBindingForTarget(registry, event.target)
  }
  registry.onKeyDown = (event) => {
    if (
      event.key.toLowerCase() !== 'f' ||
      (!event.ctrlKey && !event.metaKey) ||
      event.altKey
    ) {
      return
    }

    const targetBinding = findBindingForTarget(registry, event.target)
    const binding = targetBinding ?? registry.activeBinding
    if (!binding || !binding.root.isConnected || binding.options.shortcut === false) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    registry.activeBinding = binding
    void openTableSearchPanel(binding.$table, { focus: true, select: true })
  }
  document.addEventListener('pointerdown', registry.onPointerDown, true)
  document.addEventListener('focusin', registry.onFocusIn, true)
  document.addEventListener('keydown', registry.onKeyDown, true)
  return registry
}

function getDocumentRegistry(document: Document): DocumentRegistry {
  let registry = documentRegistryMap.get(document)
  if (!registry) {
    registry = createDocumentRegistry(document)
    documentRegistryMap.set(document, registry)
  }
  return registry
}

function releaseDocumentRegistry(registry: DocumentRegistry) {
  if (registry.bindings.size) return
  const { document } = registry
  document.removeEventListener('pointerdown', registry.onPointerDown, true)
  document.removeEventListener('focusin', registry.onFocusIn, true)
  document.removeEventListener('keydown', registry.onKeyDown, true)
  documentRegistryMap.delete(document)
}

export function bindTableSearchPanel($table: any, options: TableSearchPanelOptions) {
  if (!isTableObject($table) || typeof document === 'undefined') return
  const root = getRootElement($table)
  if (!root) return

  const existing = tableBindingMap.get($table)
  if (existing) {
    existing.options = options
    existing.text = resolveText(options)
    return
  }

  const registry = getDocumentRegistry(root.ownerDocument)
  const binding: TableSearchPanelBinding = {
    $table,
    root,
    options,
    text: resolveText(options),
    elements: null,
    visible: false,
    expanded: options.defaultExpanded !== false,
    registry,
    resizeObserver: null,
    onWindowResize: () => updatePanelPosition(binding)
  }
  tableBindingMap.set($table, binding)
  registry.bindings.add(binding)
  root.dataset.searchPanelBound = 'true'

  const ResizeObserverConstructor = root.ownerDocument.defaultView?.ResizeObserver
  if (ResizeObserverConstructor) {
    binding.resizeObserver = new ResizeObserverConstructor(binding.onWindowResize)
    binding.resizeObserver.observe(root)
  } else {
    root.ownerDocument.defaultView?.addEventListener('resize', binding.onWindowResize)
  }

  const pending = pendingPanelMap.get($table)
  if (pending?.visible) {
    void openTableSearchPanel($table, pending.openOptions)
  }
  pendingPanelMap.delete($table)
}

export function unbindTableSearchPanel($table: any) {
  if (!isTableObject($table)) return
  const binding = tableBindingMap.get($table)
  if (!binding) {
    pendingPanelMap.delete($table)
    return
  }

  binding.resizeObserver?.disconnect()
  binding.root.ownerDocument.defaultView?.removeEventListener(
    'resize',
    binding.onWindowResize
  )
  binding.elements?.panel.remove()
  delete binding.root.dataset.searchPanelBound
  binding.registry.bindings.delete(binding)
  if (binding.registry.activeBinding === binding) {
    binding.registry.activeBinding = null
  }
  tableBindingMap.delete($table)
  pendingPanelMap.delete($table)
  releaseDocumentRegistry(binding.registry)
}

export function openTableSearchPanel(
  $table: any,
  openOptions: OpenTableSearchPanelOptions = {}
): Promise<void> {
  if (!isTableObject($table)) return Promise.resolve()
  const binding = tableBindingMap.get($table)
  if (!binding) {
    pendingPanelMap.set($table, { visible: true, openOptions })
    return Promise.resolve()
  }

  if (!binding.elements) {
    binding.elements = createPanel(binding)
  }
  if (typeof openOptions.expanded === 'boolean') {
    binding.expanded = openOptions.expanded
  }

  binding.visible = true
  binding.registry.activeBinding = binding
  binding.elements.panel.hidden = false
  binding.elements.panel.dataset.visible = 'true'
  binding.elements.panel.classList.add('is--visible')
  applyExpandedState(binding)
  updatePanelPosition(binding)

  if (openOptions.focus !== false) {
    const focusInput = () => {
      if (!binding.visible || binding.elements?.panel.hidden) return
      binding.elements?.findInput.focus({ preventScroll: true })
      if (openOptions.select !== false) {
        binding.elements?.findInput.select()
      }
    }
    const requestFrame = binding.root.ownerDocument.defaultView?.requestAnimationFrame
    if (requestFrame) requestFrame(focusInput)
    else setTimeout(focusInput, 0)
  }
  return Promise.resolve()
}

export function closeTableSearchPanel($table: any): Promise<void> {
  if (!isTableObject($table)) return Promise.resolve()
  const binding = tableBindingMap.get($table)
  if (!binding) {
    pendingPanelMap.set($table, { visible: false })
    return Promise.resolve()
  }
  if (!binding.elements) return Promise.resolve()

  binding.visible = false
  binding.elements.panel.dataset.visible = 'false'
  binding.elements.panel.classList.remove('is--visible')
  binding.elements.panel.hidden = true
  binding.root.focus?.({ preventScroll: true })
  return Promise.resolve()
}

export function toggleTableSearchPanel(
  $table: any,
  force?: boolean
): Promise<void> {
  const visible = isTableSearchPanelVisible($table)
  const nextVisible = typeof force === 'boolean' ? force : !visible
  return nextVisible
    ? openTableSearchPanel($table)
    : closeTableSearchPanel($table)
}

export function isTableSearchPanelVisible($table: any): boolean {
  if (!isTableObject($table)) return false
  const binding = tableBindingMap.get($table)
  if (binding) return binding.visible
  return pendingPanelMap.get($table)?.visible === true
}
