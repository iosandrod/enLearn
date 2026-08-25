import type {
  OpenTableSearchPanelOptions,
  TableSearchPanelOptions,
  TableSearchPanelText
} from './types.js'
import {
  compileTableSearchMatcher,
  findTableSearchMatches,
  type TableSearchMatcher,
  type TableSearchMatcherOptions
} from './search.js'

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
  filter: '过滤匹配行',
  cancelFilter: '取消过滤',
  resultCount: '{current}/{total}',
  invalidPattern: '表达式无效',
  close: '关闭',
  replace: '替换',
  replaceAll: '全部替换'
}

const SEARCH_FILTER_FIELD = '__vxe_table_search_panel_filter__'
const SEARCH_FILTER_VALUE = '__vxe_table_search_panel_filter_value__'
const SEARCH_MARK_ATTRIBUTE = 'data-table-search-mark'

type TableSearchOptionName = 'matchCase' | 'wholeWord' | 'regularExpression'

interface CellSearchMatch {
  row: Record<string, unknown>
  column: any
  label: string
  matches: ReturnType<typeof findTableSearchMatches>
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
  status: HTMLElement
  previousButton: HTMLButtonElement
  nextButton: HTMLButtonElement
  filterButton: HTMLButtonElement
  closeButton: HTMLButtonElement
  optionButtons: Record<TableSearchOptionName, HTMLButtonElement>
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
  host: HTMLElement
  options: TableSearchPanelOptions
  text: TableSearchPanelText
  elements: PanelElements | null
  visible: boolean
  expanded: boolean
  filtering: boolean
  matcher: TableSearchMatcher | null
  patternInvalid: boolean
  matchedCells: CellSearchMatch[]
  matchedRows: Set<unknown>
  currentMatchIndex: number
  filterColumn: any | null
  filterOption: any | null
  filterQueue: Promise<void>
  updateTimer: ReturnType<typeof setTimeout> | null
  highlightFrame: number | null
  bodyObserver: MutationObserver | null
  observerPauseCount: number
  indexedRows: Record<string, unknown>[]
  indexedColumns: any[]
  disposed: boolean
  onBodyScroll: () => void
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

function getPanelHost(root: HTMLElement): HTMLElement {
  return root.closest<HTMLElement>('.vxe-grid') ?? root
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
  extraClassName = '',
  onToggle?: () => void
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
    onToggle?.()
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
  const { host, root, text } = binding
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

  const optionButtons: PanelElements['optionButtons'] = {
    matchCase: createOptionButton(document, text.matchCase, 'Aa', '', () => {
      scheduleSearchUpdate(binding)
    }),
    wholeWord: createOptionButton(document, text.wholeWord, 'ab', 'is--whole-word', () => {
      scheduleSearchUpdate(binding)
    }),
    regularExpression: createOptionButton(document, text.regularExpression, '.*', '', () => {
      scheduleSearchUpdate(binding)
    })
  }
  const findShell = createInputShell(document, findInput, [
    optionButtons.matchCase,
    optionButtons.wholeWord,
    optionButtons.regularExpression
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
  const filterButton = createButton(
    document,
    'vxe-table-search-panel__icon-button vxe-table-search-panel__filter-button',
    text.filter,
    ''
  )
  filterButton.setAttribute('aria-pressed', 'false')
  filterButton.dataset.testid = 'table-search-filter'
  const closeButton = createButton(
    document,
    'vxe-table-search-panel__icon-button vxe-table-search-panel__close-button',
    text.close,
    '×'
  )
  previousButton.disabled = true
  nextButton.disabled = true
  optionsButton.disabled = true
  findActions.append(
    previousButton,
    nextButton,
    optionsButton,
    filterButton,
    closeButton
  )
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
  host.append(panel)

  const elements: PanelElements = {
    panel,
    expander,
    findInput,
    replaceRow,
    status,
    previousButton,
    nextButton,
    filterButton,
    closeButton,
    optionButtons
  }
  expander.addEventListener('click', () => {
    binding.expanded = !binding.expanded
    applyExpandedState(binding, elements)
  })
  closeButton.addEventListener('click', () => {
    void closeTableSearchPanel(binding.$table)
  })
  findInput.addEventListener('input', () => {
    scheduleSearchUpdate(binding)
  })
  previousButton.addEventListener('click', () => {
    void moveToSearchMatch(binding, -1)
  })
  nextButton.addEventListener('click', () => {
    void moveToSearchMatch(binding, 1)
  })
  filterButton.addEventListener('click', () => {
    void setTableSearchFiltering(binding, !binding.filtering)
  })
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      void closeTableSearchPanel(binding.$table)
    } else if (event.key === 'Enter' && event.target === findInput) {
      event.preventDefault()
      void moveToSearchMatch(binding, event.shiftKey ? -1 : 1)
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

  const { host } = binding
  const offset = Math.max(0, binding.options.offset ?? 8)
  panel.style.setProperty('--vxe-table-search-panel-top', `${offset}px`)
  panel.classList.toggle('is--narrow', host.clientWidth < 440)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSearchableColumn(column: any) {
  const field = typeof column?.field === 'string' ? column.field.trim() : ''
  return Boolean(field) && !['seq', 'checkbox', 'radio', 'expand', 'html'].includes(
    String(column?.type ?? '')
  )
}

function getSearchableColumns($table: any) {
  const tableColumn = $table.getTableColumn?.()
  const columns = tableColumn?.visibleColumn ??
    $table.getColumns?.() ??
    $table.getFullColumns?.() ??
    []
  return Array.isArray(columns) ? columns.filter(isSearchableColumn) : []
}

function getSearchRows($table: any) {
  const tableData = $table.getTableData?.()
  const rows = $table.getFullData?.() ??
    tableData?.fullData ??
    $table.getData?.() ??
    []
  return Array.isArray(rows) ? rows.filter(isRecord) : []
}

function getCellLabel($table: any, row: Record<string, unknown>, column: any) {
  try {
    const label = $table.getCellLabel?.(row, column)
    return label == null ? '' : String(label)
  } catch {
    const field = String(column?.field ?? '')
    const value = field.split('.').reduce<unknown>((current, key) => {
      return isRecord(current) ? current[key] : undefined
    }, row)
    return value == null ? '' : String(value)
  }
}

function readMatcherOptions(elements: PanelElements): TableSearchMatcherOptions {
  return {
    matchCase: elements.optionButtons.matchCase.getAttribute('aria-pressed') === 'true',
    wholeWord: elements.optionButtons.wholeWord.getAttribute('aria-pressed') === 'true',
    regularExpression:
      elements.optionButtons.regularExpression.getAttribute('aria-pressed') === 'true'
  }
}

function formatResultCount(text: string, current: number, total: number) {
  return text
    .replace('{current}', String(current))
    .replace('{total}', String(total))
}

function updateSearchStatus(binding: TableSearchPanelBinding) {
  const elements = binding.elements
  if (!elements) return
  const total = binding.matchedCells.length
  const current = total ? binding.currentMatchIndex + 1 : 0
  elements.status.textContent = binding.patternInvalid
    ? binding.text.invalidPattern
    : total
      ? formatResultCount(binding.text.resultCount, current, total)
      : binding.text.noResults
  elements.status.classList.toggle('is--error', binding.patternInvalid)
  elements.previousButton.disabled = total === 0
  elements.nextButton.disabled = total === 0
  elements.filterButton.disabled = binding.patternInvalid || !elements.findInput.value
  elements.filterButton.classList.toggle('is--active', binding.filtering)
  elements.filterButton.setAttribute('aria-pressed', String(binding.filtering))
  elements.filterButton.setAttribute(
    'aria-label',
    binding.filtering ? binding.text.cancelFilter : binding.text.filter
  )
  elements.filterButton.title = binding.filtering
    ? binding.text.cancelFilter
    : binding.text.filter
}

function collectSearchMatches(binding: TableSearchPanelBinding) {
  const elements = binding.elements
  if (!elements) return
  const query = elements.findInput.value
  const compiled = compileTableSearchMatcher(query, readMatcherOptions(elements))
  const cells: CellSearchMatch[] = []
  const rows = new Set<unknown>()
  const searchRows = getSearchRows(binding.$table)
  const searchColumns = getSearchableColumns(binding.$table)

  binding.indexedRows = searchRows
  binding.indexedColumns = searchColumns

  if (compiled.matcher) {
    for (const row of searchRows) {
      for (const column of searchColumns) {
        const label = getCellLabel(binding.$table, row, column)
        const matches = findTableSearchMatches(label, compiled.matcher)
        if (!matches.length) continue
        cells.push({ row, column, label, matches })
        rows.add(row)
      }
    }
  }

  binding.matcher = compiled.matcher
  binding.patternInvalid = compiled.invalid
  binding.matchedCells = cells
  binding.matchedRows = rows
  binding.currentMatchIndex = cells.length
    ? Math.min(Math.max(binding.currentMatchIndex, 0), cells.length - 1)
    : -1
  updateSearchStatus(binding)
}

function removeSearchMarks(binding: TableSearchPanelBinding) {
  binding.root.querySelectorAll(`[${SEARCH_MARK_ATTRIBUTE}]`).forEach((mark) => {
    mark.replaceWith(mark.ownerDocument.createTextNode(mark.textContent ?? ''))
  })
}

const BODY_OBSERVER_OPTIONS: MutationObserverInit = {
  characterData: true,
  childList: true,
  subtree: true
}

function observeTableBody(binding: TableSearchPanelBinding) {
  if (binding.disposed || binding.observerPauseCount || !binding.bodyObserver) return
  binding.bodyObserver.observe(binding.root, BODY_OBSERVER_OPTIONS)
}

function pauseBodyObserver(binding: TableSearchPanelBinding) {
  binding.observerPauseCount += 1
  if (binding.observerPauseCount === 1) binding.bodyObserver?.disconnect()
}

function resumeBodyObserver(binding: TableSearchPanelBinding) {
  binding.observerPauseCount = Math.max(0, binding.observerPauseCount - 1)
  observeTableBody(binding)
}

async function whileBodyObserverPaused<T>(
  binding: TableSearchPanelBinding,
  callback: () => T | Promise<T>
): Promise<T> {
  pauseBodyObserver(binding)
  try {
    return await callback()
  } finally {
    resumeBodyObserver(binding)
  }
}

function hasSearchSourceChanged(binding: TableSearchPanelBinding) {
  const rows = getSearchRows(binding.$table)
  const columns = getSearchableColumns(binding.$table)
  return rows.length !== binding.indexedRows.length ||
    columns.length !== binding.indexedColumns.length ||
    rows.some((row, index) => row !== binding.indexedRows[index]) ||
    columns.some((column, index) => column !== binding.indexedColumns[index])
}

function isPanelMutation(binding: TableSearchPanelBinding, mutation: MutationRecord) {
  const target = mutation.target.nodeType === 1
    ? mutation.target as Element
    : mutation.target.parentElement
  return Boolean(target?.closest('.vxe-table-search-panel'))
}

function getRenderedCellContent(cell: HTMLElement) {
  const label = cell.querySelector<HTMLElement>('.vxe-cell--label')
  if (label) return label
  const wrapper = cell.querySelector<HTMLElement>('.vxe-body-cell--wrapper')
  if (!wrapper || wrapper.querySelector('input, textarea, select, button')) return null
  return wrapper
}

function highlightTextNode(
  document: Document,
  node: Text,
  matcher: TableSearchMatcher,
  activeOffset: number | null,
  offset: number
) {
  const value = node.nodeValue ?? ''
  const matches = findTableSearchMatches(value, matcher)
  if (!matches.length) return
  const fragment = document.createDocumentFragment()
  let cursor = 0
  matches.forEach((match) => {
    if (match.index > cursor) {
      fragment.append(document.createTextNode(value.slice(cursor, match.index)))
    }
    const mark = document.createElement('mark')
    mark.className = 'vxe-table-search-panel__highlight'
    mark.setAttribute(SEARCH_MARK_ATTRIBUTE, 'true')
    mark.classList.toggle('is--current', activeOffset === offset + match.index)
    mark.textContent = value.slice(match.index, match.index + match.length)
    fragment.append(mark)
    cursor = match.index + match.length
  })
  if (cursor < value.length) {
    fragment.append(document.createTextNode(value.slice(cursor)))
  }
  node.replaceWith(fragment)
}

function getTextNodes(content: HTMLElement, nodeFilter: typeof NodeFilter) {
  const walker = content.ownerDocument.createTreeWalker(content, nodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!node.nodeValue || parent?.closest(`[${SEARCH_MARK_ATTRIBUTE}]`)) {
        return nodeFilter.FILTER_REJECT
      }
      return nodeFilter.FILTER_ACCEPT
    }
  })
  const nodes: Text[] = []
  let node = walker.nextNode()
  while (node) {
    nodes.push(node as Text)
    node = walker.nextNode()
  }
  return nodes
}

function highlightCellByLabel(
  document: Document,
  content: HTMLElement,
  match: CellSearchMatch,
  active: boolean,
  nodeFilter: typeof NodeFilter
) {
  const nodes = getTextNodes(content, nodeFilter)
  if (!nodes.length) return
  const renderedText = nodes.map((node) => node.nodeValue ?? '').join('')
  const labelIndex = renderedText.indexOf(match.label)
  if (labelIndex < 0) return

  const matchRanges = match.matches.map((item) => ({
    start: labelIndex + item.index,
    end: labelIndex + item.index + item.length
  }))
  const activeStart = active ? matchRanges[0]?.start ?? null : null
  let offset = 0
  nodes.forEach((node) => {
    const value = node.nodeValue ?? ''
    const nodeStart = offset
    const nodeEnd = nodeStart + value.length
    const ranges = matchRanges
      .filter((range) => range.start >= nodeStart && range.end <= nodeEnd)
      .map((range) => ({
        index: range.start - nodeStart,
        length: range.end - range.start,
        start: range.start
      }))
    if (ranges.length) {
      const fragment = document.createDocumentFragment()
      let cursor = 0
      ranges.forEach((range) => {
        if (range.index > cursor) {
          fragment.append(document.createTextNode(value.slice(cursor, range.index)))
        }
        const mark = document.createElement('mark')
        mark.className = 'vxe-table-search-panel__highlight'
        mark.setAttribute(SEARCH_MARK_ATTRIBUTE, 'true')
        mark.classList.toggle('is--current', activeStart === range.start)
        mark.textContent = value.slice(range.index, range.index + range.length)
        fragment.append(mark)
        cursor = range.index + range.length
      })
      if (cursor < value.length) fragment.append(document.createTextNode(value.slice(cursor)))
      node.replaceWith(fragment)
    }
    offset = nodeEnd
  })
}

function highlightCell(
  binding: TableSearchPanelBinding,
  match: CellSearchMatch,
  active: boolean
) {
  const cell = binding.$table.getCellElement?.(match.row, match.column) as HTMLElement | null
  if (!cell) return
  const content = getRenderedCellContent(cell)
  if (!content) return
  const document = binding.root.ownerDocument
  const nodeFilter = document.defaultView?.NodeFilter
  if (!nodeFilter) return
  const nodes = getTextNodes(content, nodeFilter)
  const renderedText = nodes.map((node) => node.nodeValue ?? '').join('')
  if (renderedText !== match.label) {
    highlightCellByLabel(document, content, match, active, nodeFilter)
    cell.classList.toggle('is--table-search-current', active)
    return
  }
  let offset = 0
  const activeOffset = active ? match.matches[0]?.index ?? null : null
  nodes.forEach((textNode) => {
    highlightTextNode(document, textNode, binding.matcher!, activeOffset, offset)
    offset += textNode.nodeValue?.length ?? 0
  })
  cell.classList.toggle('is--table-search-current', active)
}

function applySearchHighlights(binding: TableSearchPanelBinding) {
  pauseBodyObserver(binding)
  try {
    removeSearchMarks(binding)
    binding.root.querySelectorAll('.is--table-search-current').forEach((cell) => {
      cell.classList.remove('is--table-search-current')
    })
    if (!binding.visible || !binding.matcher) return
    binding.matchedCells.forEach((match, index) => {
      highlightCell(binding, match, index === binding.currentMatchIndex)
    })
  } finally {
    resumeBodyObserver(binding)
  }
}

function scheduleSearchHighlights(binding: TableSearchPanelBinding) {
  const window = binding.root.ownerDocument.defaultView
  if (!window) return
  if (binding.highlightFrame != null) window.cancelAnimationFrame(binding.highlightFrame)
  binding.highlightFrame = window.requestAnimationFrame(() => {
    binding.highlightFrame = null
    applySearchHighlights(binding)
  })
}

function ensureSearchFilter(binding: TableSearchPanelBinding) {
  if (binding.filterColumn && binding.filterOption) return
  const option = {
    label: '',
    value: SEARCH_FILTER_VALUE,
    checked: false,
    _checked: false
  }
  const column = {
    id: SEARCH_FILTER_FIELD,
    field: SEARCH_FILTER_FIELD,
    filters: [option],
    filterMethod: ({ row }: { row: unknown }) => binding.matchedRows.has(row)
  }
  binding.filterColumn = column
  binding.filterOption = option
  const columns = binding.$table.internalData?.tableFullColumn
  if (Array.isArray(columns) && !columns.includes(column)) columns.push(column)
}

function removeSearchFilter(binding: TableSearchPanelBinding) {
  const column = binding.filterColumn
  const columns = binding.$table.internalData?.tableFullColumn
  if (column && Array.isArray(columns)) {
    const index = columns.indexOf(column)
    if (index >= 0) columns.splice(index, 1)
  }
  binding.filterColumn = null
  binding.filterOption = null
}

async function refreshFilteredRows(binding: TableSearchPanelBinding) {
  if (!binding.filtering) return
  const filterOptions = binding.$table.getComputeMaps?.().computeFilterOpts?.value
  if (filterOptions?.remote === true) {
    await (binding.$table.updateData?.() ?? binding.$table.handleTableData?.(true))
    const afterFullData = binding.$table.internalData?.afterFullData
    if (Array.isArray(afterFullData)) {
      binding.$table.internalData.afterFullData = afterFullData.filter(
        (row: unknown) => binding.matchedRows.has(row)
      )
      binding.$table.updateAfterDataIndex?.()
      await binding.$table.handleTableData?.(false)
      await binding.$table.updateFooter?.()
      if (binding.$table.reactData?.scrollYLoad) {
        binding.$table.updateScrollYSpace?.()
      }
      await binding.$table.recalculate?.(true)
    }
    return
  }
  ensureSearchFilter(binding)
  if (!binding.filterOption) return
  binding.filterOption.checked = true
  binding.filterOption._checked = true
  await (binding.$table.updateData?.() ?? binding.$table.handleTableData?.(true))
}

function queueFilterUpdate(
  binding: TableSearchPanelBinding,
  callback: () => Promise<void>
) {
  const queued = binding.filterQueue
    .catch(() => undefined)
    .then(async () => {
      if (binding.disposed) return
      await whileBodyObserverPaused(binding, callback)
    })
  binding.filterQueue = queued.catch(() => undefined)
  return queued
}

function applyFilteringState(binding: TableSearchPanelBinding) {
  return queueFilterUpdate(binding, async () => {
    if (binding.filtering) {
      await refreshFilteredRows(binding)
      return
    }

    if (binding.filterOption) {
      binding.filterOption.checked = false
      binding.filterOption._checked = false
    }
    removeSearchFilter(binding)
    await (binding.$table.updateData?.() ?? binding.$table.handleTableData?.(true))
  })
}

async function setTableSearchFiltering(
  binding: TableSearchPanelBinding,
  filtering: boolean
) {
  if (filtering) {
    if (binding.updateTimer) clearTimeout(binding.updateTimer)
    binding.updateTimer = null
    collectSearchMatches(binding)
  }
  const canFilter = Boolean(binding.elements?.findInput.value) && !binding.patternInvalid
  binding.filtering = filtering && canFilter
  updateSearchStatus(binding)
  await applyFilteringState(binding)
  if (binding.disposed) return
  scheduleSearchHighlights(binding)
}

async function updateSearch(binding: TableSearchPanelBinding) {
  if (binding.disposed || !binding.visible) return
  collectSearchMatches(binding)
  if (binding.filtering) {
    if (!binding.matcher) await setTableSearchFiltering(binding, false)
    else await applyFilteringState(binding)
  }
  if (binding.disposed || !binding.visible) return
  scheduleSearchHighlights(binding)
}

function scheduleSearchUpdate(binding: TableSearchPanelBinding) {
  if (binding.disposed || !binding.visible) return
  if (binding.updateTimer) clearTimeout(binding.updateTimer)
  binding.updateTimer = setTimeout(() => {
    binding.updateTimer = null
    void updateSearch(binding)
  }, 80)
}

async function moveToSearchMatch(binding: TableSearchPanelBinding, step: number) {
  const total = binding.matchedCells.length
  if (!total) return
  binding.currentMatchIndex = (binding.currentMatchIndex + step + total) % total
  const match = binding.matchedCells[binding.currentMatchIndex]
  await binding.$table.scrollToRow?.(match.row, match.column)
  updateSearchStatus(binding)
  scheduleSearchHighlights(binding)
}

function findBindingForTarget(
  registry: DocumentRegistry,
  target: EventTarget | null
): TableSearchPanelBinding | null {
  if (!(target instanceof registry.document.defaultView!.Node)) return null

  let match: TableSearchPanelBinding | null = null
  registry.bindings.forEach((binding) => {
    if (!binding.host.contains(target)) return
    if (!match || match.host.contains(binding.host)) {
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
  const host = getPanelHost(root)
  const binding: TableSearchPanelBinding = {
    $table,
    root,
    host,
    options,
    text: resolveText(options),
    elements: null,
    visible: false,
    expanded: options.defaultExpanded !== false,
    filtering: false,
    matcher: null,
    patternInvalid: false,
    matchedCells: [],
    matchedRows: new Set(),
    currentMatchIndex: -1,
    filterColumn: null,
    filterOption: null,
    filterQueue: Promise.resolve(),
    updateTimer: null,
    highlightFrame: null,
    bodyObserver: null,
    observerPauseCount: 0,
    indexedRows: [],
    indexedColumns: [],
    disposed: false,
    onBodyScroll: () => scheduleSearchHighlights(binding),
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
    binding.resizeObserver.observe(host)
  } else {
    root.ownerDocument.defaultView?.addEventListener('resize', binding.onWindowResize)
  }

  const MutationObserverConstructor = root.ownerDocument.defaultView?.MutationObserver
  if (MutationObserverConstructor) {
    binding.bodyObserver = new MutationObserverConstructor((mutations) => {
      if (!binding.visible || !binding.matcher) return
      const tableMutations = mutations.filter(
        (mutation) => !isPanelMutation(binding, mutation)
      )
      if (!tableMutations.length) return
      if (
        hasSearchSourceChanged(binding) ||
        tableMutations.some((mutation) => mutation.type === 'characterData')
      ) {
        scheduleSearchUpdate(binding)
      } else {
        scheduleSearchHighlights(binding)
      }
    })
    observeTableBody(binding)
  }
  root.addEventListener('scroll', binding.onBodyScroll, true)

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

  binding.disposed = true
  if (binding.updateTimer) clearTimeout(binding.updateTimer)
  const window = binding.root.ownerDocument.defaultView
  if (binding.highlightFrame != null) window?.cancelAnimationFrame(binding.highlightFrame)
  binding.bodyObserver?.disconnect()
  binding.root.removeEventListener('scroll', binding.onBodyScroll, true)
  removeSearchMarks(binding)
  if (binding.filtering) {
    binding.filtering = false
    if (binding.filterOption) {
      binding.filterOption.checked = false
      binding.filterOption._checked = false
    }
    removeSearchFilter(binding)
    void (binding.$table.updateData?.() ?? binding.$table.handleTableData?.(true))
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
  void updateSearch(binding)

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

export async function closeTableSearchPanel($table: any): Promise<void> {
  if (!isTableObject($table)) return
  const binding = tableBindingMap.get($table)
  if (!binding) {
    pendingPanelMap.set($table, { visible: false })
    return
  }
  if (!binding.elements) return

  binding.visible = false
  if (binding.updateTimer) clearTimeout(binding.updateTimer)
  binding.updateTimer = null
  if (binding.filtering) await setTableSearchFiltering(binding, false)
  removeSearchMarks(binding)
  binding.root.querySelectorAll('.is--table-search-current').forEach((cell) => {
    cell.classList.remove('is--table-search-current')
  })

  binding.elements.panel.dataset.visible = 'false'
  binding.elements.panel.classList.remove('is--visible')
  binding.elements.panel.hidden = true
  binding.root.focus?.({ preventScroll: true })
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
