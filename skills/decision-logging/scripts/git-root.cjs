const { execFileSync } = require("child_process");

function detectGitRoot(startDir) {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: startDir || process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.toString().trim();
  } catch {
    return null;
  }
}

module.exports = { detectGitRoot };
