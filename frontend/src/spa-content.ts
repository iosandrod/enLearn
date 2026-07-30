import type { ContentHeading, ContentSummary, RenderedContent } from '../types/content';

type FrontmatterResult = {
  data: Record<string, string>;
  body: string;
};

const blogFiles = import.meta.glob('../../content/blog/**/*.mdx', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const docFiles = import.meta.glob('../../content/docs/**/*.mdx', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

function parseFrontmatter(source: string): FrontmatterResult {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: source.trim() };

  const data = match[1].split(/\r?\n/).reduce<Record<string, string>>((frontmatter, line) => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) return frontmatter;
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    frontmatter[key] = rawValue.replace(/^["']|["']$/g, '');
    return frontmatter;
  }, {});

  return { data, body: match[2].trim() };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueHeadingId(text: string, usedIds: Map<string, number>) {
  const baseId = slugify(text) || 'section';
  const count = usedIds.get(baseId) ?? 0;
  usedIds.set(baseId, count + 1);
  return count === 0 ? baseId : `${baseId}-${count + 1}`;
}

function renderInlineMarkdown(source: string) {
  const codeSnippets: string[] = [];
  let html = escapeHtml(source);

  html = html.replace(/`([^`]+)`/g, (_match, code: string) => {
    const token = `__INLINE_CODE_${codeSnippets.length}__`;
    codeSnippets.push(`<code>${code}</code>`);
    return token;
  });

  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label: string, href: string) => `<a href="${escapeAttribute(href)}">${label}</a>`,
  );

  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  codeSnippets.forEach((snippet, index) => {
    html = html.replace(`__INLINE_CODE_${index}__`, snippet);
  });
  return html;
}

function parseAttributes(source: string) {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(/(\w+)=["']([^"']*)["']/g)) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

function renderCards(source: string) {
  const cards = [...source.matchAll(/<Card\s+([^>]+?)\/>/g)].map((match) => parseAttributes(match[1]));
  if (!cards.length) return '';

  return [
    '<div class="docs-card-grid">',
    ...cards.map((card) => {
      const title = escapeHtml(card.title ?? 'Open page');
      const description = card.description
        ? `<span class="docs-card-description">${escapeHtml(card.description)}</span>`
        : '';
      const href = escapeAttribute(card.href ?? '#');
      return `<a class="docs-card" href="${href}"><span class="docs-card-title">${title}</span>${description}</a>`;
    }),
    '</div>',
  ].join('');
}

function renderMarkdown(source: string) {
  const cardBlocks = new Map<string, string>();
  const withCardTokens = source.replace(/<Cards>([\s\S]*?)<\/Cards>/g, (_match, cards: string) => {
    const token = `__DOC_CARD_BLOCK_${cardBlocks.size}__`;
    cardBlocks.set(token, renderCards(cards));
    return `\n${token}\n`;
  });
  const blocks: string[] = [];
  const toc: ContentHeading[] = [];
  const usedIds = new Map<string, number>();

  for (const rawBlock of withCardTokens.split(/\n{2,}/)) {
    const block = rawBlock.trim();
    if (!block) continue;
    if (cardBlocks.has(block)) {
      blocks.push(block);
      continue;
    }
    if (block.startsWith('```')) {
      const code = block.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '');
      blocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
      continue;
    }
    const heading = block.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const depth = heading[1].length;
      const text = heading[2].trim();
      const id = uniqueHeadingId(text, usedIds);
      toc.push({ depth, id, text });
      blocks.push(`<h${depth} id="${id}">${renderInlineMarkdown(text)}</h${depth}>`);
      continue;
    }
    if (/^[-*]\s+/m.test(block)) {
      blocks.push(`<ul>${block.split(/\r?\n/).map((line) => `<li>${renderInlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`);
      continue;
    }
    blocks.push(`<p>${renderInlineMarkdown(block.replace(/\r?\n/g, ' '))}</p>`);
  }

  let html = blocks.join('\n');
  for (const [token, cardHtml] of cardBlocks.entries()) html = html.replaceAll(token, cardHtml);
  return { html, toc };
}

function routeSlugFromPath(filePath: string, base: 'blog' | 'docs') {
  const normalized = filePath.replace(/\\/g, '/');
  const [, relativePath = ''] = normalized.split(`/content/${base}/`);
  const parts = relativePath.replace(/\.mdx$/, '').split('/');
  if (parts.at(-1) === 'index') parts.pop();
  return parts.join('/');
}

function firstReadableParagraph(markdown: string) {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '');
  for (const line of withoutCode.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('<') || trimmedLine.startsWith('- ') || /^\d+\.\s/.test(trimmedLine)) continue;
    return trimmedLine.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1').replace(/[*`]/g, '').slice(0, 180);
  }
  return '';
}

function parseContentFile(filePath: string, source: string, base: 'blog' | 'docs', baseHref: string): RenderedContent {
  const { data, body } = parseFrontmatter(source);
  const slug = routeSlugFromPath(filePath, base);
  const rendered = renderMarkdown(body);
  const title = data.title ?? slug.split('/').at(-1) ?? 'Untitled';
  const description = data.description ?? firstReadableParagraph(body);

  return {
    slug,
    href: slug ? `${baseHref}/${slug}` : baseHref,
    title,
    description,
    date: data.date,
    author: data.author,
    excerpt: description,
    bodyHtml: rendered.html,
    toc: rendered.toc,
  };
}

function getBlogSummaries(limit?: number) {
  const summaries: ContentSummary[] = Object.entries(blogFiles)
    .map(([path, source]) => {
      const { bodyHtml: _bodyHtml, toc: _toc, ...summary } = parseContentFile(path, source, 'blog', '/blog');
      return summary;
    })
    .sort((a, b) => new Date(b.date ?? b.slug).getTime() - new Date(a.date ?? a.slug).getTime());
  return typeof limit === 'number' ? summaries.slice(0, limit) : summaries;
}

function getBlogPost(slug: string) {
  const entry = Object.entries(blogFiles).find(([path]) => routeSlugFromPath(path, 'blog') === slug);
  if (!entry) throw new Error('Blog post not found');
  return parseContentFile(entry[0], entry[1], 'blog', '/blog');
}

function getDocPage(slug: string) {
  const entry = Object.entries(docFiles).find(([path]) => routeSlugFromPath(path, 'docs') === slug);
  if (!entry) throw new Error('Doc page not found');
  return parseContentFile(entry[0], entry[1], 'docs', '/docs');
}

export async function getContentResponse<T>(url: string) {
  const target = new URL(url, window.location.origin);

  if (target.pathname === '/api/content/blog') {
    const rawLimit = Number(target.searchParams.get('limit'));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;
    return getBlogSummaries(limit) as T;
  }

  if (target.pathname.startsWith('/api/content/blog/')) {
    return getBlogPost(decodeURIComponent(target.pathname.replace('/api/content/blog/', ''))) as T;
  }

  if (target.pathname === '/api/content/docs') {
    return getDocPage('') as T;
  }

  if (target.pathname.startsWith('/api/content/docs/')) {
    return getDocPage(decodeURIComponent(target.pathname.replace('/api/content/docs/', ''))) as T;
  }

  throw new Error(`Unsupported content URL: ${url}`);
}
