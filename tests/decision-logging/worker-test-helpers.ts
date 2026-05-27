import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

export interface WorkerEnv {
  root: string;
  home: string;
  gitRoot: string;
  sessionId: string;
  transcriptPath: string;
  observationsPath: string;
  checkpointDir: string;
  cursorPath: string;
  lockPath: string;
  fakeClaudeBin: string;
  claudeStdinSink: string;
  claudeMarker: string;
}

export interface SetupOptions {
  transcriptLines: string[];
  fakeClaudeOutput?: string;
  fakeClaudeExitCode?: number;
  initialCursor?: number;
}

export function setupWorkerEnv(opts: SetupOptions): WorkerEnv {
  // Canonicalize tmpdir so the path matches what `git rev-parse --show-toplevel`
  // returns inside the test repo (macOS resolves /var/folders -> /private/var/folders).
  const rawRoot = fs.mkdtempSync(path.join(os.tmpdir(), "snowball-worker-"));
  const root = fs.realpathSync(rawRoot);
  const home = path.join(root, "home");
  const gitRoot = path.join(root, "repo");
  const sessionId = "test-" + randomBytes(6).toString("hex");

  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(gitRoot, { recursive: true });
  fs.mkdirSync(path.join(gitRoot, "docs", "snowball", "decisions"), {
    recursive: true,
  });
  execFileSync("git", ["init", "-q"], { cwd: gitRoot });

  const encoded = "-" + gitRoot.slice(1).replace(/\//g, "-");
  const transcriptDir = path.join(home, ".claude", "projects", encoded);
  fs.mkdirSync(transcriptDir, { recursive: true });
  const transcriptPath = path.join(transcriptDir, sessionId + ".jsonl");
  const body = opts.transcriptLines.join("\n") + "\n";
  fs.writeFileSync(transcriptPath, body);

  const checkpointDir = path.join(home, ".snowball", "checkpoints");
  fs.mkdirSync(checkpointDir, { recursive: true });
  const cursorPath = path.join(checkpointDir, sessionId + ".cursor");
  if (opts.initialCursor !== undefined) {
    fs.writeFileSync(cursorPath, String(opts.initialCursor));
  }

  const claudeStdinSink = path.join(root, "claude-stdin.txt");
  const claudeMarker = path.join(root, "claude-invoked.marker");
  const fakeClaudeBin = path.join(root, "fake-claude.sh");
  const output = opts.fakeClaudeOutput ?? "";
  const exitCode = opts.fakeClaudeExitCode ?? 0;
  const script =
    "#!/usr/bin/env bash\n" +
    `touch ${shq(claudeMarker)}\n` +
    `cat > ${shq(claudeStdinSink)}\n` +
    `printf '%s' ${shq(output)}\n` +
    `exit ${exitCode}\n`;
  fs.writeFileSync(fakeClaudeBin, script);
  fs.chmodSync(fakeClaudeBin, 0o755);

  return {
    root,
    home,
    gitRoot,
    sessionId,
    transcriptPath,
    observationsPath: path.join(gitRoot, "docs", "snowball", "decisions", "observations.jsonl"),
    checkpointDir,
    cursorPath,
    lockPath: path.join(checkpointDir, sessionId + ".lock"),
    fakeClaudeBin,
    claudeStdinSink,
    claudeMarker,
  };
}

export function runWorker(env: WorkerEnv): SpawnSyncReturns<string> {
  const workerPath = path.resolve(
    __dirname,
    "..",
    "..",
    "skills",
    "decision-logging",
    "scripts",
    "extract-worker.sh",
  );
  return spawnSync("bash", [workerPath, env.sessionId, env.gitRoot], {
    env: {
      ...process.env,
      HOME: env.home,
      SNOWBALL_CLAUDE_BIN: env.fakeClaudeBin,
    },
    encoding: "utf-8",
  });
}

export function cleanupWorkerEnv(env: WorkerEnv): void {
  if (env.root && env.root.startsWith(os.tmpdir())) {
    fs.rmSync(env.root, { recursive: true, force: true });
  }
}

function shq(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
