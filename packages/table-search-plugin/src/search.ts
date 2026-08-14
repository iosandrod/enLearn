export interface TableSearchMatcherOptions {
  matchCase: boolean
  wholeWord: boolean
  regularExpression: boolean
}

export interface TableSearchMatcher {
  source: string
  flags: string
}

export interface TableSearchMatch {
  index: number
  length: number
}

export interface TableSearchMatcherResult {
  matcher: TableSearchMatcher | null
  invalid: boolean
}

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function advanceStringIndex(value: string, index: number) {
  const first = value.charCodeAt(index)
  if (first < 0xd800 || first > 0xdbff || index + 1 >= value.length) {
    return index + 1
  }
  const second = value.charCodeAt(index + 1)
  return second >= 0xdc00 && second <= 0xdfff ? index + 2 : index + 1
}

export function compileTableSearchMatcher(
  query: string,
  options: TableSearchMatcherOptions
): TableSearchMatcherResult {
  if (!query) return { matcher: null, invalid: false }

  let source = options.regularExpression
    ? query
    : escapeRegularExpression(query)
  if (options.wholeWord) {
    source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
  }

  const flags = `gu${options.matchCase ? '' : 'i'}`
  try {
    new RegExp(source, flags)
    return { matcher: { source, flags }, invalid: false }
  } catch {
    return { matcher: null, invalid: true }
  }
}

export function findTableSearchMatches(
  value: string,
  matcher: TableSearchMatcher
): TableSearchMatch[] {
  const matches: TableSearchMatch[] = []
  const expression = new RegExp(matcher.source, matcher.flags)
  let match: RegExpExecArray | null

  while ((match = expression.exec(value))) {
    if (match[0].length) {
      matches.push({ index: match.index, length: match[0].length })
    } else {
      expression.lastIndex = advanceStringIndex(value, expression.lastIndex)
    }
  }
  return matches
}
