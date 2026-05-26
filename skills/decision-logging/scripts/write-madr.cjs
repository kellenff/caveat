const yaml = require('js-yaml');

function slugify(s) {
  if (typeof s !== 'string' || !s.trim()) return 'untitled';
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

function assembleFrontmatter(input) {
  const fm = {
    title: input.title,
    status: input.status || 'accepted',
    date: input.date,
    deciders: input.deciders || [],
    snowball: input.snowball,
  };
  return yaml.dump(fm, { lineWidth: 120, noRefs: true });
}

function assembleBody(input) {
  const b = input.body || {};
  const sections = [`# ${input.title}\n`];

  if (b.context) {
    sections.push('## Context and Problem Statement\n', b.context + '\n');
  }
  if (b.considered_options && b.considered_options.length) {
    sections.push('## Considered Options\n');
    for (const opt of b.considered_options) {
      sections.push(`- **${opt.name}** — ${opt.description}`);
    }
    sections.push('');
  }
  if (b.decision_outcome) {
    sections.push('## Decision Outcome\n', b.decision_outcome + '\n');
  }
  if (b.consequences && b.consequences.length) {
    sections.push('## Consequences\n');
    for (const c of b.consequences) sections.push(`- ${c}`);
    sections.push('');
  }
  if (b.links && b.links.length) {
    sections.push('## Links\n');
    for (const l of b.links) sections.push(`- ${l}`);
    sections.push('');
  }
  return sections.join('\n');
}

function assembleMadr(input) {
  return `---\n${assembleFrontmatter(input)}---\n\n${assembleBody(input)}`;
}

module.exports = { assembleMadr, assembleFrontmatter, assembleBody, slugify };
