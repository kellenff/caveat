var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// skills/decision-logging/src/append-observation.ts
var exports_append_observation = {};
__export(exports_append_observation, {
  validate: () => validate,
  appendObservation: () => appendObservation,
  TYPES: () => TYPES,
  SOURCE_SKILLS: () => SOURCE_SKILLS,
  SOURCES: () => SOURCES,
  CONFIDENCES: () => CONFIDENCES
});
module.exports = __toCommonJS(exports_append_observation);
var fs = __toESM(require("node:fs"));
var path = __toESM(require("node:path"));

// skills/decision-logging/src/git-root.ts
var import_node_child_process = require("node:child_process");
function detectGitRoot(startDir) {
  try {
    const out = import_node_child_process.execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: startDir || process.cwd(),
      stdio: ["ignore", "pipe", "ignore"]
    });
    return out.toString().trim();
  } catch {
    return null;
  }
}

// skills/decision-logging/src/append-observation.ts
var TYPES = ["observation", "implementation-choice", "hypothesis", "constraint"];
var CONFIDENCES = ["high", "medium", "low"];
var SOURCES = ["agent", "subagent"];
var SOURCE_SKILLS = [
  "brainstorming",
  "writing-plans",
  "systematic-debugging",
  "code-review",
  "ambient"
];
function validate(obs) {
  const errors = [];
  const o = obs;
  const requireString = (field) => {
    if (typeof o[field] !== "string" || !o[field]) {
      errors.push(`${field} required (non-empty string)`);
    }
  };
  requireString("schema_version");
  requireString("timestamp");
  requireString("session_id");
  requireString("content");
  requireString("rationale");
  if (o.schema_version !== "1.0")
    errors.push('schema_version must be "1.0"');
  if (!TYPES.includes(o.type)) {
    errors.push(`type must be one of ${TYPES.join(", ")}`);
  }
  if (!CONFIDENCES.includes(o.confidence)) {
    errors.push(`confidence must be one of ${CONFIDENCES.join(", ")}`);
  }
  if (!SOURCES.includes(o.source)) {
    errors.push(`source must be one of ${SOURCES.join(", ")}`);
  }
  if (!Array.isArray(o.tags) || o.tags.length < 1) {
    errors.push("tags must be a non-empty array");
  } else if (!SOURCE_SKILLS.includes(o.tags[0])) {
    errors.push(`tags[0] must be one of ${SOURCE_SKILLS.join(", ")}`);
  }
  if (!Array.isArray(o.related_files)) {
    errors.push("related_files must be an array");
  }
  if (o.related_decision !== null && typeof o.related_decision !== "string") {
    errors.push("related_decision must be string or null");
  }
  return { valid: errors.length === 0, errors };
}
function appendObservation(obs, opts = {}) {
  const result = validate(obs);
  if (!result.valid) {
    throw new Error(`validation failed: ${result.errors.join("; ")}`);
  }
  const gitRoot = opts.gitRoot ?? detectGitRoot();
  if (!gitRoot)
    throw new Error("not in a git repo");
  const dir = path.join(gitRoot, "docs", "snowball", "decisions");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "observations.jsonl");
  fs.appendFileSync(file, `${JSON.stringify(obs)}
`);
  return file;
}
if (require.main == module) {
  let raw = "";
  process.stdin.on("data", (chunk) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    const trimmed = raw.trim();
    if (!trimmed)
      return;
    const lines = trimmed.includes(`
`) ? trimmed.split(`
`) : [trimmed];
    for (const line of lines) {
      if (!line.trim())
        continue;
      try {
        appendObservation(JSON.parse(line));
      } catch (err) {
        process.stderr.write(`append-observation skipped line: ${err.message}
`);
      }
    }
  });
}
