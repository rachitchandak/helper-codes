#!/usr/bin/env node
/**
 * WCAG Accessibility Auditor — CLI Entry Point
 *
 * Usage:
 *   npx tsx src/index.ts --project <path> [--output <path>] [--concurrency <n>]
 */

import "dotenv/config";
import { Command } from "commander";
import chalk from "chalk";
import * as path from "node:path";
import { scanProject } from "./scanner.js";
import { auditFiles } from "./auditor.js";
import { buildReport, writeJsonReport, writeHtmlReport } from "./report-generator.js";

const program = new Command();

program
    .name("wcag-auditor")
    .description("Scan a project codebase and audit files for WCAG accessibility compliance using Azure OpenAI.")
    .version("1.0.0")
    .requiredOption("-p, --project <path>", "Path to the project root to scan")
    .option("-o, --output <path>", "Output directory for the report", "./accessibility-report")
    .option("-c, --concurrency <number>", "Number of concurrent LLM requests", "3")
    .parse(process.argv);

const opts = program.opts<{
    project: string;
    output: string;
    concurrency: string;
}>();

async function main() {
    const projectRoot = path.resolve(opts.project);
    const outputDir = path.resolve(opts.output);
    const concurrency = parseInt(opts.concurrency, 10) || 3;

    console.log();
    console.log(chalk.bold.magenta("♿ WCAG Accessibility Auditor"));
    console.log(chalk.gray("━".repeat(50)));
    console.log(chalk.cyan("  Project: ") + projectRoot);
    console.log(chalk.cyan("  Output:  ") + outputDir);
    console.log(chalk.cyan("  Workers: ") + concurrency);
    console.log(chalk.gray("━".repeat(50)));
    console.log();

    // ── Step 1: Scan ──────────────────────────────────────────────────
    console.log(chalk.bold.yellow("📂 Scanning project for relevant files…"));
    const files = scanProject(projectRoot);

    if (files.length === 0) {
        console.log(chalk.red("\n❌ No relevant files found. Supported extensions:"));
        console.log(chalk.gray("   .html, .htm, .css, .js, .ts, .jsx, .tsx, .mjs, .cjs, .vue, .svelte, .ejs, .hbs, .pug"));
        process.exit(1);
    }

    console.log(chalk.green(`   Found ${files.length} file(s) to audit.\n`));
    for (const f of files) {
        console.log(chalk.gray(`   • ${f.relativePath} (${f.extension})`));
    }
    console.log();

    // ── Step 2: Audit ─────────────────────────────────────────────────
    console.log(chalk.bold.yellow("🤖 Sending files to Azure OpenAI for accessibility audit…\n"));
    const results = await auditFiles(files, concurrency);
    console.log();

    // ── Step 3: Report ────────────────────────────────────────────────
    console.log(chalk.bold.yellow("📊 Generating reports…"));
    const report = buildReport(projectRoot, results);

    const jsonPath = writeJsonReport(report, outputDir);
    const htmlPath = writeHtmlReport(report, outputDir);

    console.log(chalk.green(`   ✅ JSON report: ${jsonPath}`));
    console.log(chalk.green(`   ✅ HTML report: ${htmlPath}`));
    console.log();

    // ── Summary ───────────────────────────────────────────────────────
    console.log(chalk.bold.magenta("📋 Summary"));
    console.log(chalk.gray("━".repeat(50)));
    console.log(`  Files scanned:        ${chalk.bold(String(report.totalFilesScanned))}`);
    console.log(`  Files with violations: ${chalk.bold.red(String(report.filesWithViolations))}`);
    console.log(`  Total rules checked:  ${chalk.bold(String(report.totalRulesChecked))}`);
    console.log(`  Total violations:     ${chalk.bold.red(String(report.totalViolations))}`);
    console.log();
    console.log(`  ${chalk.red("Critical:")} ${report.severityCounts.critical}  ${chalk.hex("#f97316")("Serious:")} ${report.severityCounts.serious}  ${chalk.yellow("Moderate:")} ${report.severityCounts.moderate}  ${chalk.blue("Minor:")} ${report.severityCounts.minor}`);
    console.log(chalk.gray("━".repeat(50)));
    console.log();

    if (report.totalViolations > 0) {
        console.log(chalk.yellow("⚠  Potential accessibility violations detected. Review the HTML report for details."));
    } else {
        console.log(chalk.green("🎉 No violations detected! Your code looks accessible."));
    }
}

main().catch((err) => {
    console.error(chalk.red("\n💥 Fatal error:"), err.message || err);
    process.exit(1);
});
