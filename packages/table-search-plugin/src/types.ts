export interface TableSearchPanelText {
  panelLabel: string
  findPlaceholder: string
  replacePlaceholder: string
  noResults: string
  expandReplace: string
  collapseReplace: string
  matchCase: string
  wholeWord: string
  regularExpression: string
  preserveCase: string
  previousMatch: string
  nextMatch: string
  searchOptions: string
  filter: string
  cancelFilter: string
  resultCount: string
  invalidPattern: string
  close: string
  replace: string
  replaceAll: string
}

export interface TableSearchPanelOptions {
  defaultExpanded?: boolean
  shortcut?: boolean
  offset?: number
  className?: string
  text?: Partial<TableSearchPanelText>
}

export interface OpenTableSearchPanelOptions {
  expanded?: boolean
  focus?: boolean
  select?: boolean
}

export interface VxeUILike {
  hooks?: {
    add: (name: string, options: Record<string, any>) => void
  }
  interceptor?: {
    add: (type: string, callback: (params: any) => any) => void
  }
}
