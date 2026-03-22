// ============================================================================
// src/instrumenter.ts — AST Instrumentation Engine.
//
// Scans a source directory for .jsx, .tsx, and .html files, then injects a
// `data-source-loc="filepath:line:col"` attribute into every UI element so
// that, after rendering, each DOM node can be traced back to the exact source
// location that produced it.
//
// • JSX/TSX files are parsed with @babel/parser, traversed for
//   JSXOpeningElement nodes, and regenerated with @babel/generator.
// • HTML files are parsed with cheerio and serialised back.
//
// Unparseable files are logged and skipped — they never crash the pipeline.
// ============================================================================

import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";

// Babel imports — used for JSX/TSX AST manipulation.
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

// Cheerio — used for HTML template manipulation.
import * as cheerio from "cheerio";
import type { Element as CheerioElement, AnyNode } from "domhandler";

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

/** The attribute name injected into every element. */
const ATTR_NAME = "data-source-loc";

/**
 * HTML tags that are non-visual / meta and should NOT receive the attribute
 * (injecting attributes into <script> or <style> would break them).
 */
const SKIP_HTML_TAGS = new Set([
  "script",
  "style",
  "link",
  "meta",
  "title",
  "head",
  "!doctype",
]);

/**
 * JSX "elements" that start with a lowercase letter are native HTML elements.
 * React components start with uppercase.  We instrument BOTH — the attribute
 * is harmless on components and will simply be forwarded as a prop (or
 * spread onto the root DOM node if the component is well-behaved).
 *
 * We DO skip React.Fragment (<> / <React.Fragment>) because fragments
 * produce no DOM node.
 */
const SKIP_JSX_NAMES = new Set(["Fragment"]);

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Scans `sourceDir` recursively for instrumentable files and injects the
 * `data-source-loc` attribute into every UI element.
 *
 * @returns The number of files that were successfully instrumented.
 */
export async function instrumentAllFiles(sourceDir: string): Promise<number> {
  const resolvedDir = path.resolve(sourceDir);
  console.log(`[instrumenter] Scanning: ${resolvedDir}`);

  // Collect all target files.
  const patterns = ["**/*.jsx", "**/*.tsx", "**/*.html"];
  const files: string[] = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: resolvedDir,
      absolute: true,
      nodir: true,
      // Skip node_modules, dist, build, and hidden directories.
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.*/"],
    });
    files.push(...matches);
  }

  console.log(`[instrumenter] Found ${files.length} file(s) to instrument.`);

  let instrumented = 0;

  for (const filePath of files) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".html") {
        await instrumentHTMLFile(filePath);
      } else {
        // .jsx or .tsx
        await instrumentJSXFile(filePath);
      }
      instrumented++;
    } catch (err) {
      // Log and continue — one broken file should not kill the pipeline.
      console.warn(
        `[instrumenter] ⚠ Skipping file (could not parse): ${filePath}`
      );
      console.warn(`               ${(err as Error).message}`);
    }
  }

  console.log(
    `[instrumenter] Instrumented ${instrumented}/${files.length} file(s).`
  );
  return instrumented;
}

// --------------------------------------------------------------------------
// JSX / TSX Instrumentation
// --------------------------------------------------------------------------

/**
 * Parses a JSX/TSX file into a Babel AST, injects `data-source-loc` into
 * every JSXOpeningElement, and writes the modified code back to disk.
 */
async function instrumentJSXFile(filePath: string): Promise<void> {
  const code = await fs.promises.readFile(filePath, "utf-8");

  // Determine whether to enable the TypeScript plugin.
  const isTypeScript = filePath.endsWith(".tsx");

  const ast = parse(code, {
    sourceType: "module",
    plugins: [
      "jsx",
      ...(isTypeScript ? (["typescript"] as const) : []),
      // Common community syntax extensions that Babel can handle.
      "decorators-legacy",
      "classProperties",
      "optionalChaining",
      "nullishCoalescingOperator",
    ],
  });

  // Normalise the file path with forward slashes for consistent attribute
  // values across platforms.
  const normalisedPath = filePath.replace(/\\/g, "/");

  traverse(ast, {
    JSXOpeningElement(nodePath) {
      const { node } = nodePath;

      // ------------------------------------------------------------------
      // Skip fragments: <> or <React.Fragment> / <Fragment>.
      // ------------------------------------------------------------------
      if (t.isJSXFragment(nodePath.parent)) return;

      if (t.isJSXIdentifier(node.name)) {
        if (SKIP_JSX_NAMES.has(node.name.name)) return;
      } else if (t.isJSXMemberExpression(node.name)) {
        if (
          t.isJSXIdentifier(node.name.property) &&
          SKIP_JSX_NAMES.has(node.name.property.name)
        ) {
          return;
        }
      }

      // ------------------------------------------------------------------
      // Skip if the element already has the attribute (idempotent runs).
      // ------------------------------------------------------------------
      const alreadyHasAttr = node.attributes.some(
        (attr) => t.isJSXAttribute(attr) && attr.name.name === ATTR_NAME
      );
      if (alreadyHasAttr) return;

      // ------------------------------------------------------------------
      // Use the node's *original* source location (before any AST edits).
      // Babel preserves `loc` from the initial parse.
      // ------------------------------------------------------------------
      const line = node.loc?.start.line ?? 0;
      const col = node.loc?.start.column ?? 0;
      const value = `${normalisedPath}:${line}:${col}`;

      // Build: data-source-loc="filepath:line:col"
      const attribute = t.jsxAttribute(
        t.jsxIdentifier(ATTR_NAME),
        t.stringLiteral(value)
      );

      node.attributes.push(attribute);
    },
  });

  // Generate modified source code.  `retainLines` keeps the line count
  // stable so that the line numbers in the attribute values remain valid.
  const output = generate(ast, { retainLines: true }, code);

  await fs.promises.writeFile(filePath, output.code, "utf-8");
}

// --------------------------------------------------------------------------
// HTML Instrumentation
// --------------------------------------------------------------------------

/**
 * Parses a standard HTML file with Cheerio, injects `data-source-loc` into
 * every eligible element, and writes the result back to disk.
 *
 * NOTE: Cheerio does not expose original line/column information, so we
 * approximate the location by computing line numbers from the serialised
 * output.  For exact positional data a lower-level HTML parser (parse5)
 * could be used, but Cheerio provides a more ergonomic API and is
 * sufficient for most use cases.
 */
async function instrumentHTMLFile(filePath: string): Promise<void> {
  const html = await fs.promises.readFile(filePath, "utf-8");
  const normalisedPath = filePath.replace(/\\/g, "/");

  // Load the HTML.
  const $ = cheerio.load(html);

  // Track the original line numbers by splitting the raw source.
  // We'll use a heuristic: for each element, find its opening tag in the
  // raw source to determine the line number.
  const lines = html.split("\n");

  $("*").each(function (this: AnyNode) {
    const el = $(this);
    const tagName = (this as CheerioElement).tagName?.toLowerCase();

    // Skip non-element nodes and meta tags.
    if (!tagName || SKIP_HTML_TAGS.has(tagName)) return;

    // Skip elements that already have the attribute.
    if (el.attr(ATTR_NAME)) return;

    // Attempt to find the line number of this tag in the original source.
    // We search for the opening tag pattern starting from the top.
    let lineNum = 0;
    let colNum = 0;
    const searchPattern = `<${tagName}`;
    for (let i = 0; i < lines.length; i++) {
      const idx = lines[i].toLowerCase().indexOf(searchPattern);
      if (idx !== -1) {
        lineNum = i + 1; // 1-based
        colNum = idx;     // 0-based
        // Blank out this occurrence so the next element of the same tag
        // type matches a different line.
        lines[i] =
          lines[i].substring(0, idx) +
          " ".repeat(searchPattern.length) +
          lines[i].substring(idx + searchPattern.length);
        break;
      }
    }

    el.attr(ATTR_NAME, `${normalisedPath}:${lineNum}:${colNum}`);
  });

  await fs.promises.writeFile(filePath, $.html(), "utf-8");
}
