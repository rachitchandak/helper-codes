/**
 * Shared TypeScript interfaces for the WCAG Accessibility Auditor.
 */

/** A file discovered during the project scan. */
export interface ScannedFile {
    /** Absolute path to the file. */
    filePath: string;
    /** Path relative to the project root. */
    relativePath: string;
    /** File extension (e.g. ".html", ".tsx"). */
    extension: string;
    /** Full text content of the file. */
    content: string;
}

/** A single WCAG success criterion reference. */
export interface WCAGCriterion {
    /** e.g. "1.1.1" */
    id: string;
    /** e.g. "Non-text Content" */
    name: string;
    /** "A" | "AA" | "AAA" */
    level: "A" | "AA" | "AAA";
    /** Which POUR principle this falls under. */
    principle: "Perceivable" | "Operable" | "Understandable" | "Robust";
}

/** A specific accessibility rule / check identified by the auditor. */
export interface WCAGRule {
    /** Short machine-friendly rule id, e.g. "img-alt" */
    ruleId: string;
    /** Human-readable description of the rule. */
    description: string;
    /** The WCAG criteria this rule maps to. */
    wcagCriteria: string[];
    /** Severity of a violation if found. */
    severity: "critical" | "serious" | "moderate" | "minor";
    /** The element or code snippet that triggered this rule (if applicable). */
    element?: string;
    /** The approximate line number(s) in the source file where the issue occurs. */
    lineNumber?: string;
    /** The exact code snippet from the source that has the problem. */
    codeSnippet?: string;
    /** What real-world issue this creates for users (e.g. screen reader impact, keyboard navigation). */
    impact: string;
    /** Best-practice recommendation for how to fix the issue. */
    recommendation: string;
    /** A concrete code example showing the recommended fix. */
    fixExample?: string;
}

/** The audit result for a single file. */
export interface FileAuditResult {
    /** Path relative to the project root. */
    filePath: string;
    /** File extension. */
    fileType: string;
    /** Rules/checks that are applicable to this file. */
    applicableRules: WCAGRule[];
    /** Summary of findings for this file. */
    summary: string;
    /** Number of potential violations found. */
    violationCount: number;
    /** Whether the audit completed successfully (false if LLM call failed). */
    success: boolean;
    /** Error message if the audit failed. */
    error?: string;
}

/** The complete audit report. */
export interface AuditReport {
    /** Timestamp of when the audit was run. */
    timestamp: string;
    /** The project root that was scanned. */
    projectRoot: string;
    /** How many files were scanned. */
    totalFilesScanned: number;
    /** How many files had potential violations. */
    filesWithViolations: number;
    /** Total number of rules checked across all files. */
    totalRulesChecked: number;
    /** Total potential violations found. */
    totalViolations: number;
    /** Per-file audit results. */
    results: FileAuditResult[];
    /** Summary counts by severity. */
    severityCounts: {
        critical: number;
        serious: number;
        moderate: number;
        minor: number;
    };
    /** Summary counts by WCAG level. */
    wcagLevelCounts: {
        A: number;
        AA: number;
        AAA: number;
    };
}
