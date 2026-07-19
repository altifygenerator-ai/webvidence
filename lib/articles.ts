import fs from 'node:fs';
import path from 'node:path';

export type ArticleFaq = {
  question: string;
  answer: string;
};

export type ArticleHeading = {
  id: string;
  text: string;
  level: 2 | 3;
};

export type Article = {
  slug: string;
  title: string;
  metaTitle: string;
  description: string;
  excerpt: string;
  category: string;
  publishedAt: string;
  updatedAt: string;
  keywords: string[];
  markdown: string;
  headings: ArticleHeading[];
  faqs: ArticleFaq[];
  readingMinutes: number;
  wordCount: number;
};

type ArticleDefinition = Omit<Article, 'markdown' | 'headings' | 'faqs' | 'readingMinutes' | 'wordCount'> & {
  fileName: string;
};

const ARTICLE_DIRECTORY = path.join(process.cwd(), 'content', 'articles');

const articleDefinitions: ArticleDefinition[] = [
  {
    slug: 'how-to-pitch-web-design-without-sounding-salesy',
    title: 'How to Pitch Web Design Without Sounding Like a Salesperson',
    metaTitle: 'How to Pitch Web Design Without Sounding Salesy',
    description: 'Learn how to start real conversations with small business owners, write better first messages, and build an outreach profile that stays personal.',
    excerpt: 'A plainspoken guide to starting conversations before pitching, writing first messages people will answer, and building an outreach profile that keeps the sales talk human.',
    category: 'Outreach',
    publishedAt: '2026-07-19',
    updatedAt: '2026-07-19',
    keywords: [
      'web design outreach',
      'how to pitch web design',
      'web design cold message',
      'freelance web design sales',
      'small business outreach',
      'web design pitch examples',
      'outreach prompt for web designers',
      'find web design clients',
    ],
    fileName: 'how-to-pitch-web-design-without-sounding-salesy.md',
  },
  {
    slug: 'how-to-find-businesses-that-actually-need-web-help',
    title: 'How to Find Businesses That Actually Need Web Help',
    metaTitle: 'How to Find Businesses That Need Websites',
    description: 'Learn how to find local web design leads, review what each business needs, send better cold messages, and follow up without sounding like spam.',
    excerpt: 'A practical guide to finding active local businesses, spotting problems you can clearly explain, choosing the right contact method, and keeping outreach organized.',
    category: 'Finding clients',
    publishedAt: '2026-07-18',
    updatedAt: '2026-07-18',
    keywords: [
      'find businesses that need websites',
      'find web design clients',
      'local web design leads',
      'web design cold outreach',
      'freelance web developer marketing',
      'Google Maps prospecting',
      'website lead research',
    ],
    fileName: 'how-to-find-businesses-that-actually-need-web-help.md',
  },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanSource(markdown: string) {
  return markdown
    .replace(/^#\s+.*?(?:\r?\n){2}/, '')
    .replace(/^\*\*Meta title:\*\*.*?(?:\r?\n){2}/m, '')
    .replace(/^\*\*Meta description:\*\*.*?(?:\r?\n){2}/m, '')
    .trim();
}

function extractHeadings(markdown: string): ArticleHeading[] {
  const used = new Map<string, number>();

  return markdown
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^(##|###)\s+(.+)$/.exec(line.trim());
      if (!match) return [];

      const text = match[2].trim();
      const baseId = slugify(text);
      const count = used.get(baseId) || 0;
      used.set(baseId, count + 1);

      return [{
        id: count === 0 ? baseId : `${baseId}-${count + 1}`,
        text,
        level: match[1] === '##' ? 2 : 3,
      } satisfies ArticleHeading];
    });
}

function extractFaqs(markdown: string): ArticleFaq[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === '## Frequently Asked Questions');
  if (start === -1) return [];

  const faqs: ArticleFaq[] = [];
  let index = start + 1;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (line.startsWith('## ')) break;

    if (line.startsWith('### ')) {
      const question = line.slice(4).trim();
      const answerLines: string[] = [];
      index += 1;

      while (index < lines.length) {
        const next = lines[index].trim();
        if (next.startsWith('### ') || next.startsWith('## ')) break;
        if (next) answerLines.push(next);
        index += 1;
      }

      if (question && answerLines.length) {
        faqs.push({ question, answer: answerLines.join(' ') });
      }
      continue;
    }

    index += 1;
  }

  return faqs;
}

function loadArticle(definition: ArticleDefinition): Article {
  const source = fs.readFileSync(path.join(ARTICLE_DIRECTORY, definition.fileName), 'utf8');
  const markdown = cleanSource(source);
  const plainText = markdown
    .replace(/\[[^\]]+\]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, ''))
    .replace(/[#>*_`\d.\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = plainText ? plainText.split(' ').length : 0;

  return {
    ...definition,
    markdown,
    headings: extractHeadings(markdown),
    faqs: extractFaqs(markdown),
    wordCount,
    readingMinutes: Math.max(1, Math.ceil(wordCount / 225)),
  };
}

export function getAllArticles(): Article[] {
  return articleDefinitions
    .map(loadArticle)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function getArticleBySlug(slug: string): Article | undefined {
  const definition = articleDefinitions.find((article) => article.slug === slug);
  return definition ? loadArticle(definition) : undefined;
}
