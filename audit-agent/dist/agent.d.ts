/**
 * Accessibility Audit Agent
 *
 * Uses LangChain's createAgent with a role‑based accessibility‑tester prompt,
 * a file‑reading tool, and structured JSON output via Zod.
 * Configured to use Azure OpenAI as the LLM provider.
 */
import { z } from "zod";
export declare const AuditIssueSchema: any;
export declare const AuditResultSchema: any;
export type AuditResult = z.infer<typeof AuditResultSchema>;
/**
 * Audit a single file for accessibility issues.
 *
 * @param filePath — Path to the code file to audit.
 * @returns A structured AuditResult JSON object.
 */
export declare function auditFile(filePath: string): Promise<AuditResult>;
