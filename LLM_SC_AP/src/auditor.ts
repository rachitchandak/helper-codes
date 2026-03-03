/**
 * Auditor Module
 * Sends file contents to Azure OpenAI and asks the LLM to perform
 * a WCAG accessibility audit, returning structured results.
 */

import { AzureOpenAI } from "openai";
import type { ScannedFile, FileAuditResult, WCAGRule } from "./types.js";
import { WCAG_CRITERIA } from "./wcag-criteria.js";

// ── Azure OpenAI client ────────────────────────────────────────────────

let client: AzureOpenAI | null = null;

function getClient(): AzureOpenAI {
    if (!client) {
        const apiKey = process.env.AZURE_OPENAI_API_KEY;
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
        const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";

        if (!apiKey || !endpoint) {
            throw new Error(
                "Missing AZURE_OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT in environment."
            );
        }

        client = new AzureOpenAI({
            apiKey,
            endpoint,
            apiVersion,
        });
    }
    return client;
}

// ── System prompt ──────────────────────────────────────────────────────

function buildSystemPrompt(): string {
    const criteriaList = WCAG_CRITERIA.map(
        (c) => `  - ${c.id} ${c.name} (Level ${c.level}, ${c.principle})`
    ).join("\n");

    return `You are an expert web accessibility auditor with deep knowledge of WCAG 2.1/2.2, ARIA, assistive technologies, and inclusive design best practices. Your job is to perform a thorough static analysis of source code files and produce a detailed accessibility audit.

For the given file, you MUST:
1. Identify every accessibility rule/check that applies to this file.
2. Map each rule to the relevant WCAG success criteria from the list below.
3. For each issue, identify the EXACT line number(s) and the code snippet that causes the problem.
4. Explain the REAL-WORLD IMPACT — what specific problem this creates for users with disabilities (e.g., "Screen reader users will not know what this image depicts", "Keyboard-only users cannot activate this control").
5. Provide a BEST-PRACTICE recommendation that follows industry standards (WAI-ARIA, HTML5 semantics, WCAG techniques).
6. Include a CONCRETE CODE EXAMPLE showing the recommended fix.
7. Rate severity as: critical (blocks access entirely), serious (major barrier), moderate (causes difficulty), minor (suboptimal but usable).

WCAG success criteria reference:
${criteriaList}

You MUST respond with valid JSON only — no markdown fences, no explanation outside JSON.

{
  "applicableRules": [
    {
      "ruleId": "short-kebab-case-id",
      "description": "Clear description of the accessibility rule being checked",
      "wcagCriteria": ["1.1.1"],
      "severity": "critical",
      "lineNumber": "8",
      "codeSnippet": "<img src=\\"logo.png\\">",
      "impact": "Screen reader users will hear 'image' with no description, making the content meaningless. Users relying on text alternatives will miss important visual information.",
      "recommendation": "Add a descriptive alt attribute to every <img> element. Use alt=\\"\\" only for purely decorative images. Follow WCAG Technique H37.",
      "fixExample": "<img src=\\"logo.png\\" alt=\\"Company Logo\\">"
    }
  ],
  "summary": "Detailed overall summary of all accessibility findings, their combined impact, and priority order for remediation",
  "violationCount": 0
}

IMPORTANT RULES:
- lineNumber must reference the actual line number in the source file provided.
- codeSnippet must be the EXACT code from the source, not paraphrased.
- impact must describe the SPECIFIC user experience problem, not just restate the rule.
- recommendation must cite best practices (WCAG techniques, ARIA patterns, HTML5 semantics).
- fixExample must be a working code fix the developer can directly use.
- Be thorough — check every element, attribute, and pattern in the file.`;
}

// ── Audit a single file ────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function auditFileWithRetry(
    file: ScannedFile,
    maxRetries: number = 3
): Promise<FileAuditResult> {
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5";
    const openai = getClient();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const userMessage = `Analyze this ${file.extension} file for accessibility compliance.\n\nFile: ${file.relativePath}\n\n\`\`\`\n${file.content}\n\`\`\``;

            const response = await openai.chat.completions.create({
                model: deployment,
                messages: [
                    { role: "system", content: buildSystemPrompt() },
                    { role: "user", content: userMessage },
                ],
                max_completion_tokens: 8192,
            });

            const raw = response.choices[0]?.message?.content?.trim();
            if (!raw) {
                throw new Error("Empty response from Azure OpenAI");
            }

            // Extract JSON from the response — the model may wrap it in markdown fences
            let jsonStr = raw;
            const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            }

            const parsed = JSON.parse(jsonStr) as {
                applicableRules: WCAGRule[];
                summary: string;
                violationCount: number;
            };

            return {
                filePath: file.relativePath,
                fileType: file.extension,
                applicableRules: parsed.applicableRules || [],
                summary: parsed.summary || "",
                violationCount: parsed.violationCount || 0,
                success: true,
            };
        } catch (err: any) {
            const isRateLimit =
                err?.status === 429 || err?.code === "429" || err?.type === "rate_limit";

            if (isRateLimit && attempt < maxRetries) {
                const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                console.warn(
                    `⏳ Rate limited on ${file.relativePath}, retrying in ${(backoff / 1000).toFixed(1)}s (attempt ${attempt}/${maxRetries})…`
                );
                await sleep(backoff);
                continue;
            }

            if (attempt < maxRetries) {
                const backoff = Math.pow(2, attempt) * 500;
                console.warn(
                    `⚠  Error auditing ${file.relativePath}: ${err.message}. Retrying in ${(backoff / 1000).toFixed(1)}s…`
                );
                await sleep(backoff);
                continue;
            }

            // All retries exhausted
            return {
                filePath: file.relativePath,
                fileType: file.extension,
                applicableRules: [],
                summary: "",
                violationCount: 0,
                success: false,
                error: err.message || String(err),
            };
        }
    }

    // TypeScript exhaustiveness (should never reach here)
    return {
        filePath: file.relativePath,
        fileType: file.extension,
        applicableRules: [],
        summary: "",
        violationCount: 0,
        success: false,
        error: "Unknown error",
    };
}

// ── Audit multiple files with concurrency control ──────────────────────

export async function auditFiles(
    files: ScannedFile[],
    concurrency: number = 3
): Promise<FileAuditResult[]> {
    const results: FileAuditResult[] = [];
    const queue = [...files];
    let completed = 0;

    async function worker(): Promise<void> {
        while (queue.length > 0) {
            const file = queue.shift();
            if (!file) return;

            const result = await auditFileWithRetry(file);
            results.push(result);
            completed++;

            const status = result.success ? "✅" : "❌";
            console.log(
                `  ${status} [${completed}/${files.length}] ${file.relativePath} — ${result.applicableRules.length} rules, ${result.violationCount} violations`
            );
        }
    }

    // Launch workers up to concurrency limit
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(concurrency, files.length); i++) {
        workers.push(worker());
    }

    await Promise.all(workers);
    return results;
}
