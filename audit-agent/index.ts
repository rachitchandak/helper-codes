/**
 * CLI Entry Point — Accessibility Audit Agent
 *
 * Usage:  npx tsx index.ts <file-path>
 *
 * Audits the given file for accessibility issues and outputs a JSON report.
 * Optionally writes the report to <filename>.audit.json.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { auditFile } from "./agent.js";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error(
      "❌  Usage:  npx tsx index.ts <file-path>\n\n" +
        "  Provide the path to the code file you want to audit.\n"
    );
    process.exit(1);
  }

  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    console.error(`❌  File not found: ${resolved}`);
    process.exit(1);
  }

  console.log(`\n🔍  Accessibility Audit Agent`);
  console.log(`   Auditing: ${resolved}\n`);
  console.log(`⏳  Running audit…\n`);

  try {
    const result = await auditFile(resolved);

    // ── Pretty‑print to stdout ──────────────────────────────────────────
    const jsonOutput = JSON.stringify(result, null, 2);
    console.log("━".repeat(60));
    console.log("  AUDIT RESULTS");
    console.log("━".repeat(60));
    console.log(jsonOutput);
    console.log("━".repeat(60));

    // ── Summary line ────────────────────────────────────────────────────
    const { totalIssues, issues } = result;
    const critical = issues.filter((i) => i.severity === "critical").length;
    const major = issues.filter((i) => i.severity === "major").length;
    const minor = issues.filter((i) => i.severity === "minor").length;
    const info = issues.filter((i) => i.severity === "info").length;

    console.log(
      `\n📊  Total: ${totalIssues} issue(s) — ` +
        `🔴 ${critical} critical, 🟠 ${major} major, 🟡 ${minor} minor, 🔵 ${info} info\n`
    );

    // ── Write to file ───────────────────────────────────────────────────
    const outFile = resolved + ".audit.json";
    fs.writeFileSync(outFile, jsonOutput, "utf-8");
    console.log(`💾  Report saved to: ${outFile}\n`);
  } catch (error: unknown) {
    console.error("❌  Audit failed:\n");
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      if (error.message.includes("API key")) {
        console.error(
          "\n   💡  Make sure OPENAI_API_KEY is set in your environment.\n" +
            "      export OPENAI_API_KEY=sk-...\n"
        );
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
