"use strict";
// ============================================================================
// src/dom-extractor.ts — Playwright Extraction Module.
//
// Launches a headless Chromium instance, navigates to the rendered application,
// and extracts every element that carries a `data-source-loc` attribute.
// For each element it generates a unique CSS selector and captures a
// truncated HTML snippet, then maps both to the source location encoded in
// the attribute value.
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMappings = extractMappings;
const playwright_1 = require("playwright");
/** Maximum outer-HTML length per element to keep payloads manageable. */
const MAX_SNIPPET_LENGTH = 300;
/**
 * Launches Playwright, navigates to `targetUrl`, and returns an array of
 * DOM-to-source mappings for every element with a `data-source-loc` attribute.
 *
 * @param targetUrl - The fully-qualified URL of the running dev server.
 * @returns An array of {@link DOMMapping} objects.
 */
async function extractMappings(targetUrl) {
    console.log(`[dom-extractor] Launching headless browser…`);
    let browser = null;
    try {
        browser = await playwright_1.chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();
        console.log(`[dom-extractor] Navigating to: ${targetUrl}`);
        // Navigate and wait for network activity to settle, ensuring SPAs have
        // finished their initial data-fetching and rendering.
        await page.goto(targetUrl, {
            waitUntil: "networkidle",
            timeout: 60000,
        });
        console.log("[dom-extractor] Page loaded. Extracting mappings…");
        // ------------------------------------------------------------------
        // Evaluate an extraction script *inside* the browser context.
        // Everything inside page.evaluate() runs in the browser, NOT in Node.
        // ------------------------------------------------------------------
        const rawMappings = await page.evaluate((snippetMaxLen) => {
            /**
             * Generates a unique CSS selector for an element by walking up the
             * DOM tree and building an nth-child chain.
             *
             * Strategy:
             *  1. If the element has an id, use it directly (#id) — guaranteed unique.
             *  2. Otherwise, build a path like "body > div:nth-child(1) > main:nth-child(2)".
             */
            function getUniqueSelector(el) {
                // Fast path: if the element has an id, use it.
                if (el.id) {
                    return `#${CSS.escape(el.id)}`;
                }
                const parts = [];
                let current = el;
                while (current && current !== document.documentElement) {
                    const tag = current.tagName.toLowerCase();
                    if (current.id) {
                        // We've hit an ancestor with an id — anchor here.
                        parts.unshift(`#${CSS.escape(current.id)}`);
                        break;
                    }
                    // Compute nth-child index among siblings.
                    let index = 1;
                    let sibling = current.previousElementSibling;
                    while (sibling) {
                        if (sibling.tagName === current.tagName) {
                            index++;
                        }
                        sibling = sibling.previousElementSibling;
                    }
                    // Count same-tag siblings to decide if :nth-of-type is needed.
                    let sameTagCount = 0;
                    const parent = current.parentElement;
                    if (parent) {
                        for (let i = 0; i < parent.children.length; i++) {
                            if (parent.children[i].tagName === current.tagName) {
                                sameTagCount++;
                            }
                        }
                    }
                    if (sameTagCount > 1) {
                        parts.unshift(`${tag}:nth-of-type(${index})`);
                    }
                    else {
                        parts.unshift(tag);
                    }
                    current = current.parentElement;
                }
                return parts.join(" > ");
            }
            // -----------------------------------------------------------------
            // Collect all elements with data-source-loc.
            // -----------------------------------------------------------------
            const elements = document.querySelectorAll("[data-source-loc]");
            const results = [];
            elements.forEach((el) => {
                const raw = el.getAttribute("data-source-loc");
                if (!raw)
                    return;
                // Parse "filepath:line:col" — note the filepath itself may contain
                // colons (e.g. "C:/Users/…") so we split from the RIGHT.
                const lastColon = raw.lastIndexOf(":");
                if (lastColon === -1)
                    return;
                const beforeLastColon = raw.substring(0, lastColon);
                const col = parseInt(raw.substring(lastColon + 1), 10);
                const secondLastColon = beforeLastColon.lastIndexOf(":");
                if (secondLastColon === -1)
                    return;
                const filePath = beforeLastColon.substring(0, secondLastColon);
                const line = parseInt(beforeLastColon.substring(secondLastColon + 1), 10);
                if (isNaN(line) || isNaN(col))
                    return;
                // Get the outer HTML, truncated.
                let snippet = el.outerHTML;
                if (snippet.length > snippetMaxLen) {
                    snippet = snippet.substring(0, snippetMaxLen) + "…";
                }
                results.push({
                    domSelector: getUniqueSelector(el),
                    htmlSnippet: snippet,
                    filePath,
                    line,
                    column: col,
                });
            });
            return results;
        }, MAX_SNIPPET_LENGTH);
        // ------------------------------------------------------------------
        // Convert the raw browser results into our typed DOMMapping[].
        // ------------------------------------------------------------------
        const mappings = rawMappings.map((raw) => ({
            domSelector: raw.domSelector,
            htmlSnippet: raw.htmlSnippet,
            sourceLocation: {
                filePath: raw.filePath,
                line: raw.line,
                column: raw.column,
            },
        }));
        console.log(`[dom-extractor] Extracted ${mappings.length} mapping(s).`);
        return mappings;
    }
    finally {
        if (browser) {
            await browser.close();
            console.log("[dom-extractor] Browser closed.");
        }
    }
}
//# sourceMappingURL=dom-extractor.js.map