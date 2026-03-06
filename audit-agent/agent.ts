/**
 * Accessibility Audit Agent
 *
 * Uses LangChain's createAgent with a role‑based accessibility‑tester prompt,
 * a file‑reading tool, and structured JSON output via Zod.
 * Configured to use Azure OpenAI as the LLM provider.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { createAgent, tool } from "langchain";
import { AzureChatOpenAI } from "@langchain/openai";
import { getAccessibilityPrompt } from "./knowledgebase.js";

// ---------------------------------------------------------------------------
// Azure OpenAI Configuration
// ---------------------------------------------------------------------------

const AZURE_CONFIG = {
  azureOpenAIApiKey:
    "",
  azureOpenAIApiInstanceName: "",
  azureOpenAIApiDeploymentName: "gpt-4o",
  azureOpenAIApiVersion: "2024-08-01-preview",
};

// ---------------------------------------------------------------------------
// Structured Output Schema — defines the JSON the agent must produce
// ---------------------------------------------------------------------------

export const AuditIssueSchema = z.object({
  id: z.string().describe("Unique identifier for this issue instance"),
  rule: z
    .string()
    .describe("Rule ID from the knowledge base (e.g. A11Y-001) or CUSTOM"),
  severity: z
    .enum(["critical", "major", "minor", "info"])
    .describe("Severity level of the issue"),
  line: z
    .number()
    .optional()
    .describe("Approximate line number where the issue occurs"),
  element: z
    .string()
    .describe("The offending element, attribute, or code snippet"),
  description: z.string().describe("Explanation of why this is an issue"),
  recommendation: z.string().describe("Actionable fix recommendation"),
  wcagCriteria: z
    .string()
    .describe("The relevant WCAG success criterion reference"),
});

export const AuditResultSchema = z.object({
  file: z.string().describe("Path of the audited file"),
  summary: z
    .string()
    .describe("Brief overall summary of the file's accessibility posture"),
  totalIssues: z.number().describe("Total number of issues found"),
  issues: z
    .array(AuditIssueSchema)
    .describe("List of accessibility issues found"),
});

export type AuditResult = z.infer<typeof AuditResultSchema>;

// ---------------------------------------------------------------------------
// Tool — Read File
// ---------------------------------------------------------------------------

const readFile = tool(
  ({ filePath }: { filePath: string }) => {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      return `ERROR: File not found at "${resolved}"`;
    }
    const content = fs.readFileSync(resolved, "utf-8");
    const lines = content.split("\n");
    const numbered = lines
      .map((line, i) => `${(i + 1).toString().padStart(4, " ")} | ${line}`)
      .join("\n");
    return `File: ${resolved}\nTotal lines: ${lines.length}\n\n${numbered}`;
  },
  {
    name: "readFile",
    description:
      "Reads a source code file from disk and returns its contents with line numbers. " +
      "Use this tool to retrieve the file that needs to be audited.",
    schema: z.object({
      filePath: z
        .string()
        .describe("Absolute or relative path to the file to read"),
    }),
  }
);

// ---------------------------------------------------------------------------
// Agent Factory
// ---------------------------------------------------------------------------

/**
 * Creates the accessibility audit agent.
 * Uses Azure OpenAI (GPT-4o) as the LLM provider,
 * the accessibility system prompt from knowledgebase.ts,
 * and returns structured output matching AuditResultSchema.
 */
function buildAgent() {
  const model = new AzureChatOpenAI({
    ...AZURE_CONFIG,
    temperature: 0,
  });

  return createAgent({
    model,
    tools: [readFile],
    prompt: getAccessibilityPrompt(),
    responseFormat: AuditResultSchema,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Audit a single file for accessibility issues.
 *
 * @param filePath — Path to the code file to audit.
 * @returns A structured AuditResult JSON object.
 */
export async function auditFile(filePath: string): Promise<AuditResult> {
  const agent = buildAgent();
  const resolved = path.resolve(filePath);

  const result = await agent.invoke({
    messages: [
      {
        role: "user",
        content: `Please audit the following file for accessibility issues: "${resolved}"

Use the readFile tool to read the file contents, then analyze every line for accessibility violations. Return the complete audit results as structured JSON.`,
      },
    ],
  });

  // Extract the structured response from the agent result
  return result.structuredResponse as AuditResult;
}
