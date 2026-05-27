const yaml = require("js-yaml");

function slugify(s) {
  if (typeof s !== "string" || !s.trim()) return "untitled";
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

function assembleFrontmatter(input) {
  const fm = {
    title: input.title,
    status: input.status || "accepted",
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
    sections.push("## Context and Problem Statement\n", b.context + "\n");
  }
  if (b.considered_options && b.considered_options.length) {
    sections.push("## Considered Options\n");
    for (const opt of b.considered_options) {
      sections.push(`- **${opt.name}** — ${opt.description}`);
    }
    sections.push("");
  }
  if (b.decision_outcome) {
    sections.push("## Decision Outcome\n", b.decision_outcome + "\n");
  }
  if (b.consequences && b.consequences.length) {
    sections.push("## Consequences\n");
    for (const c of b.consequences) sections.push(`- ${c}`);
    sections.push("");
  }
  if (b.links && b.links.length) {
    sections.push("## Links\n");
    for (const l of b.links) sections.push(`- ${l}`);
    sections.push("");
  }
  return sections.join("\n");
}

function assembleMadr(input) {
  return `---\n${assembleFrontmatter(input)}---\n\n${assembleBody(input)}`;
}

const fs = require("fs");
const path = require("path");
const { detectGitRoot } = require("./git-root.cjs");

function timestampPrefix(isoDate) {
  // 2026-05-25T14:30:00-07:00 → 2026-05-25T1430
  const m = isoDate.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error(`unparseable date: ${isoDate}`);
  return `${m[1]}T${m[2]}${m[3]}`;
}

function writeMadr(input, opts = {}) {
  const gitRoot = opts.gitRoot || detectGitRoot();
  if (!gitRoot) throw new Error("not in a git repo");

  const dir = path.join(gitRoot, "docs", "snowball", "decisions");
  fs.mkdirSync(dir, { recursive: true });

  const prefix = timestampPrefix(input.date);
  const slug = slugify(input.title);
  let filename = `${prefix}-${slug}.md`;
  let filePath = path.join(dir, filename);

  if (fs.existsSync(filePath)) {
    const suffix = Date.now().toString(36).slice(-4);
    filename = `${prefix}-${slug}-${suffix}.md`;
    filePath = path.join(dir, filename);
  }

  fs.writeFileSync(filePath, assembleMadr(input));
  return filePath;
}

// CLI entry: read JSON from stdin, write MADR, print path on stdout
if (require.main === module) {
  let raw = "";
  process.stdin.on("data", (chunk) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    try {
      const input = JSON.parse(raw);
      const filePath = writeMadr(input);
      process.stdout.write(filePath + "\n");
    } catch (err) {
      process.stderr.write(`write-madr error: ${err.message}\n`);
      process.exit(1);
    }
  });
}

module.exports = {
  assembleMadr,
  assembleFrontmatter,
  assembleBody,
  slugify,
  writeMadr,
  timestampPrefix,
};
