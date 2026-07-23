import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type {
  ContentHeading,
  ContentSummary,
  RenderedContent
} from '~/types/content';

interface FrontmatterResult {
  data: Record<string, string>;
  body: string;
}

interface MarkdownResult {
  html: string;
  toc: ContentHeading[];
}

const contentRoot = resolve(process.cwd(), '..', 'content');
const blogRoot = join(contentRoot, 'blog');
const docsRoot = join(contentRoot, 'docs');

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

  if (!match) {
    return { data: {}, body: source.trim() };
  }

  const data = match[1].split(/\r?\n/).reduce<Record<string, string>>(
    (frontmatter, line) => {
      const separatorIndex = line.indexOf(':');

      if (separatorIndex === -1) {
        return frontmatter;
      }

      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      frontmatter[key] = rawValue.replace(/^["']|["']$/g, '');
      return frontmatter;
    },
    {}
  );

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
    (_match, label: string, href: string) =>
      `<a href="${escapeAttribute(href)}">${label}</a>`
  );

  html = html
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');

  codeSnippets.forEach((snippet, index) => {
    html = html.replace(`__INLINE_CODE_${index}__`, snippet);
  });

  return html;
}

function parseAttributes(source: string) {
  const attributes: Record<string, string> = {};
  const attrPattern = /(\w+)=["']([^"']*)["']/g;

  for (const match of source.matchAll(attrPattern)) {
    attributes[match[1]] = match[2];
  }

  return attributes;
}

function renderCards(source: string) {
  const cards = [...source.matchAll(/<Card\s+([^>]+?)\/>/g)].map((match) =>
    parseAttributes(match[1])
  );

  if (!cards.length) {
    return '';
  }

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
    '</div>'
  ].join('');
}

function renderMarkdown(source: string): MarkdownResult {
  const cardBlocks = new Map<string, string>();
  const withCardTokens = source.replace(
    /<Cards>([\s\S]*?)<\/Cards>/g,
    (_match, cards: string) => {
      const token = `__DOC_CARD_BLOCK_${cardBlocks.size}__`;
      cardBlocks.set(token, renderCards(cards));
      return `\n${token}\n`;
    }
  );

  const lines = withCardTokens.split(/\r?\n/);
  const blocks: string[] = [];
  const toc: ContentHeading[] = [];
  const usedIds = new Map<string, number>();
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listStart = 1;
  let inCodeBlock = false;
  let codeLanguage = '';
  let codeLines: string[] = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join(' ').trim())}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listType || !listItems.length) return;

    const startAttribute =
      listType === 'ol' && listStart > 1 ? ` start="${listStart}"` : '';
    blocks.push(
      `<${listType}${startAttribute}>${listItems
        .map((item) => `<li>${item}</li>`)
        .join('')}</${listType}>`
    );
    listItems = [];
    listType = null;
    listStart = 1;
  }

  function flushCodeBlock() {
    const languageClass = codeLanguage
      ? ` class="language-${escapeAttribute(codeLanguage)}"`
      : '';
    blocks.push(
      `<pre><code${languageClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`
    );
    codeLines = [];
    codeLanguage = '';
    inCodeBlock = false;
  }

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();

    if (inCodeBlock) {
      if (trimmedLine.startsWith('```')) {
        flushCodeBlock();
      } else {
        codeLines.push(rawLine);
      }
      continue;
    }

    if (cardBlocks.has(trimmedLine)) {
      flushParagraph();
      flushList();
      blocks.push(trimmedLine);
      continue;
    }

    if (trimmedLine.startsWith('```')) {
      flushParagraph();
      flushList();
      inCodeBlock = true;
      codeLanguage = trimmedLine.slice(3).trim();
      continue;
    }

    if (!trimmedLine) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmedLine.match(/^(#{1,3})\s+(.+)$/);

    if (headingMatch) {
      flushParagraph();
      flushList();

      const depth = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const id = uniqueHeadingId(text, usedIds);
      toc.push({ depth, id, text });
      blocks.push(
        `<h${depth} id="${id}">${renderInlineMarkdown(text)}</h${depth}>`
      );
      continue;
    }

    const unorderedMatch = trimmedLine.match(/^[-*]\s+(.+)$/);

    if (unorderedMatch) {
      flushParagraph();

      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }

      listItems.push(renderInlineMarkdown(unorderedMatch[1]));
      continue;
    }

    const orderedMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);

    if (orderedMatch) {
      flushParagraph();

      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
        listStart = Number(orderedMatch[1]);
      }

      listItems.push(renderInlineMarkdown(orderedMatch[2]));
      continue;
    }

    flushList();
    paragraph.push(trimmedLine);
  }

  flushParagraph();
  flushList();

  if (inCodeBlock) {
    flushCodeBlock();
  }

  let html = blocks.join('\n');

  for (const [token, block] of cardBlocks.entries()) {
    html = html.replaceAll(token, block);
  }

  return { html, toc };
}

async function walkMdxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        return walkMdxFiles(fullPath);
      }

      return entry.name.endsWith('.mdx') ? [fullPath] : [];
    })
  );

  return files.flat();
}

function routeSlugFromPath(filePath: string, baseDirectory: string) {
  const relativePath = relative(baseDirectory, filePath).replace(/\\/g, '/');
  const routeParts = relativePath.replace(/\.mdx$/, '').split('/');

  if (routeParts.at(-1) === 'index') {
    routeParts.pop();
  }

  return routeParts;
}

function firstReadableParagraph(markdown: string) {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '');

  for (const line of withoutCode.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (
      !trimmedLine ||
      trimmedLine.startsWith('#') ||
      trimmedLine.startsWith('<') ||
      trimmedLine.startsWith('- ') ||
      /^\d+\.\s/.test(trimmedLine)
    ) {
      continue;
    }

    return trimmedLine
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/[*`]/g, '')
      .slice(0, 180);
  }

  return '';
}

async function parseContentFile(
  filePath: string,
  baseDirectory: string,
  baseHref: string
): Promise<RenderedContent> {
  const source = await readFile(filePath, 'utf8');
  const { data, body } = parseFrontmatter(source);
  const routeParts = routeSlugFromPath(filePath, baseDirectory);
  const slug = routeParts.join('/');
  const rendered = renderMarkdown(body);
  const title = data.title ?? routeParts.at(-1) ?? 'Untitled';
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
    toc: rendered.toc
  };
}

export async function getBlogSummaries(limit?: number) {
  const files = await walkMdxFiles(blogRoot);
  const posts = await Promise.all(
    files.map((filePath) => parseContentFile(filePath, blogRoot, '/blog'))
  );

  const summaries: ContentSummary[] = posts
    .map(({ bodyHtml: _bodyHtml, toc: _toc, ...summary }) => summary)
    .sort((a, b) => {
      const dateA = new Date(a.date ?? a.slug).getTime();
      const dateB = new Date(b.date ?? b.slug).getTime();
      return dateB - dateA;
    });

  return typeof limit === 'number' ? summaries.slice(0, limit) : summaries;
}

export async function getBlogPost(slug: string) {
  const filePath = join(blogRoot, `${slug}.mdx`);
  return parseContentFile(filePath, blogRoot, '/blog');
}

export async function getDocPage(routeParts: string[] = []) {
  const files = await walkMdxFiles(docsRoot);
  const entries = await Promise.all(
    files.map((filePath) => parseContentFile(filePath, docsRoot, '/docs'))
  );
  const slug = routeParts.join('/');

  return entries.find((entry) => entry.slug === slug) ?? null;
}
