import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

export function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snowball-decisions-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "test"], { cwd: dir });
  return dir;
}

export function cleanupTempRepo(dir: string): void {
  if (dir && dir.startsWith(os.tmpdir())) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function readDecisionsDir(repo: string): string[] {
  const dir = path.join(repo, "docs", "snowball", "decisions");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort();
}
