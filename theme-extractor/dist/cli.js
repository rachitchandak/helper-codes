#!/usr/bin/env node
"use strict";
/**
 * Style Intelligence CLI
 *
 * Usage:
 *   npx ts-node src/cli.ts <workspace-root>
 *   style-intelligence <workspace-root>
 *
 * Options:
 *   --debug    Enable verbose logging
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const style_intelligence_1 = require("./style-intelligence");
async function main() {
    const args = process.argv.slice(2);
    const debug = args.includes('--debug');
    const positionalArgs = args.filter((a) => !a.startsWith('--'));
    if (positionalArgs.length === 0) {
        console.error('Usage: style-intelligence <workspace-root> [--debug]');
        console.error('');
        console.error('Statically analyzes a frontend project and extracts');
        console.error('color-related styling intelligence into theme-context.json');
        process.exit(1);
    }
    const rootDir = path_1.default.resolve(positionalArgs[0]);
    console.log(`\n🎨 Style Intelligence Layer`);
    console.log(`   Scanning: ${rootDir}\n`);
    const startTime = Date.now();
    try {
        const context = await (0, style_intelligence_1.extract)(rootDir, { debug });
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n✅ Analysis complete in ${elapsed}s`);
        console.log(`   CSS variables:      ${Object.keys(context.resolvedCssVariables).length} resolved`);
        console.log(`   Hardcoded colors:   ${context.hardcodedColors.length}`);
        console.log(`   Class mappings:     ${Object.keys(context.classMap).length}`);
        console.log(`   Tailwind colors:    ${Object.keys(context.tailwindColors).length}`);
        console.log(`   Tailwind utilities: ${Object.keys(context.tailwindUtilities).length}`);
        console.log(`\n📄 Output: ${path_1.default.join(rootDir, 'accessibility', 'theme-context.json')}\n`);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`\n❌ Error: ${message}\n`);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=cli.js.map