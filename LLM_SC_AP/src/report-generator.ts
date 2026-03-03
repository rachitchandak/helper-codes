/**
 * Report Generator Module
 * Takes audit results and generates JSON and HTML reports.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AuditReport, FileAuditResult } from "./types.js";
import { getCriterionById } from "./wcag-criteria.js";

// ── Build the aggregate report object ──────────────────────────────────

export function buildReport(
  projectRoot: string,
  results: FileAuditResult[]
): AuditReport {
  const severityCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const wcagCriteriaSet: Record<string, Set<string>> = { A: new Set(), AA: new Set(), AAA: new Set() };

  let totalRulesChecked = 0;
  let totalViolations = 0;
  let filesWithViolations = 0;

  for (const result of results) {
    if (result.violationCount > 0) filesWithViolations++;
    totalViolations += result.violationCount;

    for (const rule of result.applicableRules) {
      totalRulesChecked++;
      severityCounts[rule.severity] = (severityCounts[rule.severity] || 0) + 1;

      for (const criteriaId of rule.wcagCriteria) {
        const criterion = getCriterionById(criteriaId);
        if (criterion) {
          wcagCriteriaSet[criterion.level]?.add(criteriaId);
        }
      }
    }
  }

  return {
    timestamp: new Date().toISOString(),
    projectRoot: path.resolve(projectRoot),
    totalFilesScanned: results.length,
    filesWithViolations,
    totalRulesChecked,
    totalViolations,
    results,
    severityCounts,
    wcagLevelCounts: {
      A: wcagCriteriaSet.A.size,
      AA: wcagCriteriaSet.AA.size,
      AAA: wcagCriteriaSet.AAA.size,
    },
  };
}

// ── Write JSON report ──────────────────────────────────────────────────

export function writeJsonReport(report: AuditReport, outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, "report.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filePath;
}

// ── Write HTML report ──────────────────────────────────────────────────

export function writeHtmlReport(report: AuditReport, outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, "report.html");

  const severityColor: Record<string, string> = {
    critical: "#ef4444",
    serious: "#f97316",
    moderate: "#eab308",
    minor: "#3b82f6",
  };

  const severityBadge = (s: string) =>
    `<span style="background:${severityColor[s] || "#6b7280"};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;text-transform:uppercase;">${s}</span>`;

  const fileRows = report.results
    .map((r) => {
      const rulesHtml = r.applicableRules.length
        ? r.applicableRules
          .map(
            (rule) => `
          <div class="rule-card ${rule.severity}">
            <div class="rule-header">
              <div class="rule-id-group">
                <code class="rule-id">${escapeHtml(rule.ruleId)}</code>
                ${severityBadge(rule.severity)}
                ${rule.lineNumber ? `<span class="line-badge">Line ${escapeHtml(rule.lineNumber)}</span>` : ""}
              </div>
              <div class="wcag-tags">${rule.wcagCriteria.map((c) => {
              const crit = getCriterionById(c);
              return `<span class="wcag-tag" title="${crit ? escapeHtml(crit.name) : ""}">WCAG ${escapeHtml(c)}${crit ? ` (${crit.level})` : ""}</span>`;
            }).join(" ")}</div>
            </div>
            <p class="rule-desc">${escapeHtml(rule.description)}</p>

            ${rule.codeSnippet ? `
            <div class="detail-block">
              <div class="detail-label">❌ Problematic Code${rule.lineNumber ? ` <span class="line-ref">(line ${escapeHtml(rule.lineNumber)})</span>` : ""}</div>
              <pre class="code-block bad"><code>${escapeHtml(rule.codeSnippet)}</code></pre>
            </div>` : (rule.element ? `
            <div class="detail-block">
              <div class="detail-label">❌ Problematic Element</div>
              <pre class="code-block bad"><code>${escapeHtml(rule.element)}</code></pre>
            </div>` : "")}

            <div class="detail-block">
              <div class="detail-label">⚠️ Impact on Users</div>
              <p class="impact-text">${escapeHtml(rule.impact || "—")}</p>
            </div>

            <div class="detail-block">
              <div class="detail-label">💡 Recommendation (Best Practice)</div>
              <p class="recommendation-text">${escapeHtml(rule.recommendation || "—")}</p>
            </div>

            ${rule.fixExample ? `
            <div class="detail-block">
              <div class="detail-label">✅ Suggested Fix</div>
              <pre class="code-block good"><code>${escapeHtml(rule.fixExample)}</code></pre>
            </div>` : ""}
          </div>`
          )
          .join("")
        : `<p style="text-align:center;color:#6b7280;padding:1rem;">No applicable rules identified.</p>`;

      const statusIcon = r.success ? (r.violationCount > 0 ? "⚠️" : "✅") : "❌";
      const statusText = !r.success
        ? `<span style="color:#ef4444;">Audit failed: ${escapeHtml(r.error || "unknown error")}</span>`
        : r.summary;

      return `
      <div class="file-section">
        <h3>${statusIcon} <code>${escapeHtml(r.filePath)}</code> <span class="file-type">${escapeHtml(r.fileType)}</span></h3>
        <p class="file-summary">${escapeHtml(statusText)}</p>
        <p class="file-stats"><strong>Rules:</strong> ${r.applicableRules.length} &nbsp;|&nbsp; <strong>Violations:</strong> ${r.violationCount}</p>
        ${rulesHtml}
      </div>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WCAG Accessibility Audit Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 2rem;
      line-height: 1.6;
    }
    h1 {
      font-size: 2rem;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }
    .meta { color: #94a3b8; margin-bottom: 2rem; font-size: 14px; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .summary-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 1.25rem;
      text-align: center;
    }
    .summary-card .value {
      font-size: 2rem;
      font-weight: 700;
      color: #818cf8;
    }
    .summary-card .label {
      font-size: 13px;
      color: #94a3b8;
      margin-top: 4px;
    }
    .severity-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .severity-card {
      background: #1e293b;
      border-radius: 12px;
      padding: 1rem;
      text-align: center;
      border-left: 4px solid;
    }
    .severity-card.critical { border-color: #ef4444; }
    .severity-card.serious  { border-color: #f97316; }
    .severity-card.moderate  { border-color: #eab308; }
    .severity-card.minor     { border-color: #3b82f6; }
    .severity-card .value { font-size: 1.5rem; font-weight: 700; }
    .severity-card .label { font-size: 12px; color: #94a3b8; text-transform: uppercase; }
    .file-section {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .file-section h3 {
      font-size: 1rem;
      margin-bottom: 0.75rem;
      color: #c4b5fd;
    }
    .file-type {
      background: #334155;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      color: #94a3b8;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 0.75rem;
      font-size: 13px;
    }
    th {
      background: #334155;
      color: #cbd5e1;
      padding: 8px 12px;
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 8px 12px;
      border-bottom: 1px solid #1e293b;
      color: #cbd5e1;
      vertical-align: top;
    }
    tr:hover td { background: #334155; }
    code {
      background: #0f172a;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      color: #a5b4fc;
    }
    p { margin-bottom: 0.5rem; }
    .file-summary { color: #94a3b8; font-size: 14px; }
    .file-stats { color: #cbd5e1; font-size: 13px; margin-bottom: 1rem; }
    .rule-card {
      background: #0f172a;
      border: 1px solid #334155;
      border-left: 4px solid #6b7280;
      border-radius: 8px;
      padding: 1.25rem;
      margin-top: 1rem;
    }
    .rule-card.critical { border-left-color: #ef4444; }
    .rule-card.serious  { border-left-color: #f97316; }
    .rule-card.moderate  { border-left-color: #eab308; }
    .rule-card.minor     { border-left-color: #3b82f6; }
    .rule-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .rule-id-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .rule-id {
      font-size: 14px;
      font-weight: 700;
      color: #e2e8f0;
      background: #334155;
      padding: 3px 10px;
    }
    .line-badge {
      background: #1e3a5f;
      color: #7dd3fc;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .wcag-tags { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .wcag-tag {
      background: #312e81;
      color: #c4b5fd;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: help;
    }
    .rule-desc {
      color: #e2e8f0;
      font-size: 14px;
      margin-bottom: 0.75rem;
      font-weight: 500;
    }
    .detail-block {
      margin-top: 0.75rem;
    }
    .detail-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
      margin-bottom: 0.35rem;
    }
    .line-ref {
      font-weight: 400;
      text-transform: none;
      color: #7dd3fc;
    }
    .code-block {
      background: #020617;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 0.75rem 1rem;
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.6;
      margin: 0;
    }
    .code-block code {
      background: none;
      padding: 0;
      color: #e2e8f0;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .code-block.bad { border-left: 3px solid #ef4444; }
    .code-block.good { border-left: 3px solid #22c55e; }
    .impact-text {
      color: #fbbf24;
      font-size: 13px;
      line-height: 1.6;
      padding: 0.5rem 0.75rem;
      background: rgba(251,191,36,0.08);
      border-radius: 6px;
      border-left: 3px solid #eab308;
    }
    .recommendation-text {
      color: #67e8f9;
      font-size: 13px;
      line-height: 1.6;
      padding: 0.5rem 0.75rem;
      background: rgba(103,232,249,0.06);
      border-radius: 6px;
      border-left: 3px solid #06b6d4;
    }
  </style>
</head>
<body>
  <h1>♿ WCAG Accessibility Audit Report</h1>
  <p class="meta">
    Project: <code>${escapeHtml(report.projectRoot)}</code><br />
    Generated: ${escapeHtml(report.timestamp)}
  </p>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="value">${report.totalFilesScanned}</div>
      <div class="label">Files Scanned</div>
    </div>
    <div class="summary-card">
      <div class="value">${report.filesWithViolations}</div>
      <div class="label">Files with Violations</div>
    </div>
    <div class="summary-card">
      <div class="value">${report.totalRulesChecked}</div>
      <div class="label">Rules Checked</div>
    </div>
    <div class="summary-card">
      <div class="value">${report.totalViolations}</div>
      <div class="label">Total Violations</div>
    </div>
  </div>

  <h2 style="margin-bottom:1rem;color:#e2e8f0;">Severity Breakdown</h2>
  <div class="severity-grid">
    <div class="severity-card critical">
      <div class="value" style="color:#ef4444;">${report.severityCounts.critical}</div>
      <div class="label">Critical</div>
    </div>
    <div class="severity-card serious">
      <div class="value" style="color:#f97316;">${report.severityCounts.serious}</div>
      <div class="label">Serious</div>
    </div>
    <div class="severity-card moderate">
      <div class="value" style="color:#eab308;">${report.severityCounts.moderate}</div>
      <div class="label">Moderate</div>
    </div>
    <div class="severity-card minor">
      <div class="value" style="color:#3b82f6;">${report.severityCounts.minor}</div>
      <div class="label">Minor</div>
    </div>
  </div>

  <h2 style="margin-bottom:1rem;color:#e2e8f0;">WCAG Level Coverage</h2>
  <div class="summary-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 2rem;">
    <div class="summary-card">
      <div class="value">${report.wcagLevelCounts.A}</div>
      <div class="label">Level A Criteria</div>
    </div>
    <div class="summary-card">
      <div class="value">${report.wcagLevelCounts.AA}</div>
      <div class="label">Level AA Criteria</div>
    </div>
    <div class="summary-card">
      <div class="value">${report.wcagLevelCounts.AAA}</div>
      <div class="label">Level AAA Criteria</div>
    </div>
  </div>

  <h2 style="margin-bottom:1rem;color:#e2e8f0;">File-by-File Results</h2>
  ${fileRows}

  <footer style="margin-top:3rem;padding-top:1rem;border-top:1px solid #334155;color:#64748b;font-size:12px;text-align:center;">
    Generated by WCAG Accessibility Auditor &bull; Powered by Azure OpenAI
  </footer>
</body>
</html>`;

  fs.writeFileSync(filePath, html, "utf-8");
  return filePath;
}

// ── Utility ────────────────────────────────────────────────────────────

function escapeHtml(str: unknown): string {
  const s = String(str ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
