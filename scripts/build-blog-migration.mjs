#!/usr/bin/env node
/**
 * build-blog-migration.mjs
 *
 * Turns the Markdown article sources in docs/content/articles/*.md into a
 * single corrective SQL migration that UPDATEs the seeded blog_post rows,
 * plus a CITATIONS.md checklist of every external reference for the final
 * fact-check pass (no invented studies: every source is verified before ship).
 *
 * Why: the blog articles are authored as Markdown (readable, version-controlled
 * source of truth). The database stores HTML. This script is the bridge:
 * Markdown -> semantic HTML -> one UPDATE per file, matched on slug AND
 * language (RO reuses the same slugs as EN, so slug alone would hit both rows).
 *
 * Front matter (YAML) per file:
 *   ---
 *   slug: how-to-choose-the-right-personal-trainer
 *   language: en                # en | ro
 *   title: ...
 *   excerpt: ...
 *   category: Guide
 *   coverImage: https://images.unsplash.com/...
 *   readTime: 8                 # optional; auto-computed if omitted
 *   tags: [a, b, c]
 *   ---
 *   ## Heading
 *   Body markdown...
 *
 * Markdown subset (we control the source, so this is deliberate):
 *   ## h2, ### h3, paragraphs, **bold**, *italic*, [text](url), > blockquote,
 *   numbered lists (tutorials only), and a final "- " Sources list.
 * Facts and statistics are woven into the prose with an inline [source](url)
 * link, NOT boxed out. Bullet lists are not part of the article body vocabulary
 * (house rule); the only accepted "- " list is the closing Sources bibliography.
 * The first paragraph gets class="lead" to match the blog render.
 *
 * Usage: node scripts/build-blog-migration.mjs
 * Output: migrations/054_blog_content_rewrite.sql, docs/content/CITATIONS.md
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES_DIR = join(ROOT, 'docs', 'content', 'articles');
const MIGRATION = 'migrations/054_blog_content_rewrite.sql';
const CITATIONS = 'docs/content/CITATIONS.md';

// ── Markdown → HTML (constrained subset) ─────────────────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(text) {
  let s = escapeHtml(text);
  // Tokenize links out FIRST so the emphasis passes cannot corrupt generated
  // tag internals (e.g. the `_blank` in target="_blank").
  const links = [];
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const raw = url.replace(/&amp;/g, '&');
    const external = /^https?:/i.test(raw);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    links.push(`<a href="${url}"${attrs}>${label}</a>`);
    return `@@LINK${links.length - 1}@@`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
  s = s.replace(/@@LINK(\d+)@@/g, (_m, i) => links[Number(i)]);
  return s;
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const blank = (l) => l.trim() === '';
  const special = /^(#{2,3}\s|>\s?|[-*]\s+|\d+\.\s+)/;

  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }

    let m;
    if ((m = /^###\s+(.*)$/.exec(line))) { out.push(`<h3>${inline(m[1].trim())}</h3>`); i++; continue; }
    if ((m = /^##\s+(.*)$/.exec(line))) { out.push(`<h2>${inline(m[1].trim())}</h2>`); i++; continue; }

    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote><p>${inline(buf.join(' ').trim())}</p></blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(inline(lines[i].replace(/^[-*]\s+/, '').trim())); i++; }
      out.push(`<ul>\n${items.map((x) => `  <li>${x}</li>`).join('\n')}\n</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(inline(lines[i].replace(/^\d+\.\s+/, '').trim())); i++; }
      out.push(`<ol>\n${items.map((x) => `  <li>${x}</li>`).join('\n')}\n</ol>`);
      continue;
    }

    const buf = [];
    while (i < lines.length && !blank(lines[i]) && !special.test(lines[i])) { buf.push(lines[i].trim()); i++; }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }

  // First paragraph becomes the lead paragraph.
  let leadDone = false;
  return out
    .map((block) => {
      if (!leadDone && block.startsWith('<p>')) { leadDone = true; return '<p class="lead">' + block.slice(3); }
      return block;
    })
    .join('\n\n');
}

// ── Helpers ──────────────────────────────────────────────────────────

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function wordCount(md) {
  return md.replace(/[#>*_`\[\]()-]/g, ' ').split(/\s+/).filter(Boolean).length;
}

function parse(raw) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!m) throw new Error('Missing YAML front matter (--- ... ---)');
  return { meta: yaml.load(m[1]) || {}, body: m[2].trim() };
}

function externalLinks(html) {
  return [...html.matchAll(/<a href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => ({ url: m[1], text: m[2].replace(/<[^>]+>/g, '') }));
}

// ── Build ────────────────────────────────────────────────────────────

if (!existsSync(ARTICLES_DIR)) {
  console.error(`No articles directory at ${ARTICLES_DIR}`);
  process.exit(1);
}

const files = readdirSync(ARTICLES_DIR).filter((f) => f.endsWith('.md')).sort();
if (files.length === 0) {
  console.error('No .md article files found.');
  process.exit(1);
}

const statements = [];
const citations = [];
for (const file of files) {
  const { meta, body } = parse(readFileSync(join(ARTICLES_DIR, file), 'utf-8'));

  for (const k of ['slug', 'language', 'title', 'excerpt', 'category']) {
    if (!meta[k]) throw new Error(`${file}: missing required front matter "${k}"`);
  }

  const html = mdToHtml(body);
  const readTime = meta.readTime || Math.max(1, Math.round(wordCount(body) / 200));
  const tags = Array.isArray(meta.tags) ? JSON.stringify(meta.tags) : '[]';

  statements.push(
    `-- ${file}  (${meta.slug} / ${meta.language})\n` +
    `UPDATE blog_post SET\n` +
    `  title       = ${sqlStr(meta.title)},\n` +
    `  excerpt     = ${sqlStr(meta.excerpt)},\n` +
    `  content     = ${sqlStr(html)},\n` +
    `  category    = ${sqlStr(meta.category)},\n` +
    (meta.coverImage ? `  cover_image = ${sqlStr(meta.coverImage)},\n` : '') +
    `  read_time   = ${readTime},\n` +
    `  tags        = ${sqlStr(tags)}::json,\n` +
    `  updated_at  = now()\n` +
    `WHERE slug = ${sqlStr(meta.slug)} AND language = ${sqlStr(meta.language)};`,
  );

  citations.push({ file, links: externalLinks(html) });
  console.log(`  ${file}  ->  ${meta.slug} (${meta.language}), ${readTime} min read`);
}

const header =
  `-- =========================================================\n` +
  `-- Migration 054: Blog Content Rewrite\n` +
  `-- =========================================================\n` +
  `-- GENERATED by scripts/build-blog-migration.mjs from\n` +
  `-- docs/content/articles/*.md. Do NOT edit by hand; edit the\n` +
  `-- Markdown sources and re-run the build.\n` +
  `-- Updates existing rows only, matched on (slug, language).\n` +
  `-- After running, trigger ONE website rebuild (a migration\n` +
  `-- bypasses blog.service triggerWebsiteRebuild()).\n` +
  `-- =========================================================\n\n` +
  `BEGIN;\n\n`;

writeFileSync(join(ROOT, MIGRATION), header + statements.join('\n\n') + '\n\nCOMMIT;\n');

// Citations checklist for the mandatory final fact-check pass.
let cit =
  `# Citations to verify\n\n` +
  `GENERATED by scripts/build-blog-migration.mjs. Every external reference used\n` +
  `in an article. Before the migration ships, each one MUST be checked: the URL\n` +
  `resolves AND the source genuinely supports the claim it is attached to.\n` +
  `No invented studies. Tick a box only after you have opened the source.\n\n`;
let total = 0;
for (const c of citations) {
  if (!c.links.length) continue;
  const seen = new Set();
  const uniq = c.links.filter((l) => (seen.has(l.url) ? false : seen.add(l.url)));
  cit += `## ${c.file}\n\n`;
  for (const l of uniq) {
    cit += `- [ ] ${l.text} — ${l.url}\n`;
    total++;
  }
  cit += `\n`;
}
writeFileSync(join(ROOT, CITATIONS), cit);

console.log(`\nWrote ${statements.length} UPDATE(s) to ${MIGRATION}`);
console.log(`Wrote ${total} citation(s) to ${CITATIONS} for the final fact-check pass`);
