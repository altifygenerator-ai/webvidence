import { describe, expect, it } from 'vitest';
import { getAllArticles, getArticleBySlug } from '../lib/articles';

describe('article library', () => {
  it('loads the published articles with indexable metadata', () => {
    const articles = getAllArticles();
    expect(articles).toHaveLength(2);
    expect(articles[0].title).toBe('How to Pitch Web Design Without Sounding Like a Salesperson');
    expect(articles[0].description).toContain('real conversations');
    expect(articles[0].wordCount).toBeGreaterThan(2500);
    expect(articles[0].readingMinutes).toBeGreaterThan(10);
  });

  it('extracts sections and FAQ answers from the lead-finding article', () => {
    const article = getArticleBySlug('how-to-find-businesses-that-actually-need-web-help');
    expect(article).toBeDefined();
    expect(article?.headings.some((heading) => heading.text === 'Where to Find Local Business Leads')).toBe(true);
    expect(article?.faqs.length).toBeGreaterThanOrEqual(8);
    expect(article?.faqs[0].question).toBe('How many cold messages should a freelancer send each day?');
  });

  it('loads the conversation-first outreach article and its FAQ', () => {
    const article = getArticleBySlug('how-to-pitch-web-design-without-sounding-salesy');
    expect(article).toBeDefined();
    expect(article?.headings.some((heading) => heading.text === 'Build an Outreach Profile Before You Generate Messages')).toBe(true);
    expect(article?.faqs.length).toBeGreaterThanOrEqual(8);
    expect(article?.markdown).toContain('[Webvidence](https://www.webvidence.app)');
  });
});
