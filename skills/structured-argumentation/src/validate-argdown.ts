import * as fs from "node:fs";
import {
  ArgdownApplication,
  DataPlugin,
  JSONExportPlugin,
  ModelPlugin,
  ParserPlugin,
  type IArgdownRequest,
} from "@argdown/core";

interface ValidateResponse {
  json?: string;
  exceptions?: Error[];
}

export interface ValidateResult {
  ok: boolean;
  json: string | null;
  errors: string[];
}

export function validate(source: string): ValidateResult {
  const app = new ArgdownApplication();
  app.addPlugin(new ParserPlugin(), "parse-input");
  app.addPlugin(new DataPlugin(), "build-model");
  app.addPlugin(new ModelPlugin(), "build-model");
  app.addPlugin(new JSONExportPlugin(), "export-json");

  const request: IArgdownRequest = {
    input: source,
    process: ["parse-input", "build-model", "export-json"],
    logLevel: "none",
    logExceptions: false,
    throwExceptions: false,
  };

  const response = app.run(request) as ValidateResponse;
  const exceptions = response.exceptions ?? [];
  const errors = exceptions.map((e) => e.message ?? String(e));
  return {
    ok: errors.length === 0,
    json: response.json ?? null,
    errors,
  };
}

const HELP = `usage: validate-argdown <file.argdown>

Validates argdown syntax via @argdown/core. Reads the file at <path>,
parses to the model, and emits JSON on stdout if valid. On failure,
writes one error per line to stderr and exits 1.

Pass '-' as the path to read source from stdin.`;

if (require.main === module) {
  const arg = process.argv[2];
  if (!arg || arg === "-h" || arg === "--help") {
    process.stdout.write(`${HELP}\n`);
    process.exit(arg ? 0 : 1);
  }

  const source = arg === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(arg, "utf8");
  const result = validate(source);
  if (!result.ok) {
    for (const e of result.errors) process.stderr.write(`${e}\n`);
    process.exit(1);
  }
  process.stdout.write(`${result.json ?? "{}"}\n`);
}
