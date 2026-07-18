import { describe, expect, it } from 'vitest';
import { getAllArticles, getArticleBySlug } from '../lib/articles';

describe('article library', () => {
  it('loads the published article with indexable metadata', () => {
    const articles = getAllArticles();
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('How to Find Businesses That Actually Need Web Help');
    expect(articles[0].description).toContain('local web design leads');
    expect(articles[0].wordCount).toBeGreaterThan(2500);
    expect(articles[0].readingMinutes).toBeGreaterThan(10);
  });

  it('extracts article sections and FAQ answers', () => {
    const article = getArticleBySlug('how-to-find-businesses-that-actually-need-web-help');
    expect(article).toBeDefined();
    expect(article?.headings.some((heading) => heading.text === 'Where to Find Local Business Leads')).toBe(true);
    expect(article?.faqs.length).toBeGreaterThanOrEqual(8);
    expect(article?.faqs[0].question).toBe('How many cold messages should a freelancer send each day?');
  });
});
