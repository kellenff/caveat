const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snowball-decisions-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "test"], { cwd: dir });
  return dir;
}

function cleanupTempRepo(dir) {
  if (dir && dir.startsWith(os.tmpdir())) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function readDecisionsDir(repo) {
  const dir = path.join(repo, "docs", "snowball", "decisions");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort();
}

module.exports = { makeTempRepo, cleanupTempRepo, readDecisionsDir };
