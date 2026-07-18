import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ArticleHeading } from '@/lib/articles';

type ArticleContentProps = {
  markdown: string;
  headings: ArticleHeading[];
};

type Block =
  | { type: 'heading'; level: 2 | 3; text: string; id: string }
  | { type: 'paragraph'; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'ordered-list'; items: string[] };

function renderInline(text: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern).filter(Boolean);

  return parts.map((part, index) => {
    const bold = /^\*\*(.+)\*\*$/.exec(part);
    if (bold) return <strong key={`${part}-${index}`}>{bold[1]}</strong>;

    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const href = link[2];
      const external = href.startsWith('http');
      return external ? (
        <a key={`${part}-${index}`} href={href} target="_blank" rel="noreferrer">{link[1]}</a>
      ) : (
        <Link key={`${part}-${index}`} href={href}>{link[1]}</Link>
      );
    }

    return part;
  });
}

function parseBlocks(markdown: string, headings: ArticleHeading[]): Block[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: Block[] = [];
  let index = 0;
  let headingIndex = 0;

  const startsBlock = (line: string) => {
    const value = line.trim();
    return !value
      || /^##\s+/.test(value)
      || /^###\s+/.test(value)
      || /^>\s?/.test(value)
      || /^\*\s+/.test(value)
      || /^\d+\.\s+/.test(value);
  };

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = /^(##|###)\s+(.+)$/.exec(line);
    if (heading) {
      const current = headings[headingIndex];
      blocks.push({
        type: 'heading',
        level: heading[1] === '##' ? 2 : 3,
        text: heading[2].trim(),
        id: current?.id || heading[2].toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      });
      headingIndex += 1;
      index += 1;
      continue;
    }

    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quote.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'blockquote', text: quote.join(' ') });
      continue;
    }

    if (/^\*\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\*\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\*\s+/, ''));
        index += 1;
      }
      blocks.push({ type: 'unordered-list', items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push({ type: 'ordered-list', items });
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && !startsBlock(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

export function ArticleContent({ markdown, headings }: ArticleContentProps) {
  const blocks = parseBlocks(markdown, headings);

  return (
    <div className="article-copy">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          if (block.level === 2) {
            return <h2 id={block.id} key={`${block.id}-${index}`}><a href={`#${block.id}`}>{renderInline(block.text)}</a></h2>;
          }
          return <h3 id={block.id} key={`${block.id}-${index}`}><a href={`#${block.id}`}>{renderInline(block.text)}</a></h3>;
        }

        if (block.type === 'blockquote') {
          return <blockquote key={`quote-${index}`}>{renderInline(block.text)}</blockquote>;
        }

        if (block.type === 'unordered-list') {
          return <ul key={`ul-${index}`}>{block.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>)}</ul>;
        }

        if (block.type === 'ordered-list') {
          return <ol key={`ol-${index}`}>{block.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>)}</ol>;
        }

        return <p key={`p-${index}`}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}
