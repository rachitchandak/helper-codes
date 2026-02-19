#!/usr/bin/env node
console.log("Starting CLI...");
import { Command } from 'commander';
import { FileScanner } from './scanner';
import { CssDetector } from './detector';
import * as path from 'path';
import * as fs from 'fs';

const program = new Command();

program
    .name('detect-css')
    .description('CLI to detect CSS class names and variables in a file')
    .version('1.0.0')
    .argument('<file>', 'path to the file to scan')
    .option('-t, --theme-context <path>', 'path to the theme-context.json file')
    .action((filePath, options) => {
        try {
            console.log(`Scanning file: ${filePath}`);
            const content = FileScanner.readFile(filePath);

            const classNames = CssDetector.extractClassNames(content);
            const variables = CssDetector.extractCssVariables(content);
            const imports = CssDetector.extractImports(content);

            console.log('\n--- Detected CSS Class Names ---');
            if (classNames.length > 0) {
                classNames.forEach(name => console.log(`- ${name}`));
            } else {
                console.log('No class names detected.');
            }

            console.log('\n--- Detected CSS Variables ---');
            if (variables.length > 0) {
                variables.forEach(variable => console.log(`- ${variable}`));
            } else {
                console.log('No CSS variables detected.');
            }

            console.log('\n--- Detected CSS Imports ---');
            if (imports.length > 0) {
                imports.forEach(imp => console.log(`- ${imp}`));
            } else {
                console.log('No CSS imports detected.');
            }

            if (options.themeContext) {
                console.log('\n--- Theme Context Analysis ---');
                const themeContextPath = path.resolve(options.themeContext);
                if (fs.existsSync(themeContextPath)) {
                    const themeData = JSON.parse(fs.readFileSync(themeContextPath, 'utf-8'));
                    const classMap = themeData.classMap || {};

                    // Resolve imports to absolute paths
                    const resolvedImports = imports.map(imp => {
                        return path.resolve(path.dirname(path.resolve(filePath)), imp);
                    });

                    console.log('Resolved Imports for Theme Lookup:', resolvedImports);

                    classNames.forEach(className => {
                        const selector = `.${className}`;
                        let found = false;

                        resolvedImports.forEach(importedFile => {
                            // Normalize paths for comparison
                            // On Windows, we should be case-insensitive.
                            // We'll normalize both to lowercase for the check.
                            const normalizePath = (p: string) => path.resolve(p).toLowerCase();
                            const targetPath = normalizePath(importedFile);

                            // Find a key in classMap that matches
                            const matchedKey = Object.keys(classMap).find(key => normalizePath(key) === targetPath);

                            if (matchedKey && classMap[matchedKey][selector]) {
                                const styles = classMap[matchedKey][selector];
                                console.log(`\nClass: ${className}`);
                                console.log(`  Source: ${matchedKey}`);
                                console.log(`  Styles:`, styles);
                                found = true;
                            }
                        });


                        if (!found) {
                            // Fallback: Search in all theme files (Global Search)
                            // This covers global styles (index.css) or implicit dependencies.
                            const allThemeFiles = Object.keys(classMap);
                            for (const themeFile of allThemeFiles) {
                                if (classMap[themeFile][selector]) {
                                    const styles = classMap[themeFile][selector];
                                    console.log(`\nClass: ${className}`);
                                    console.log(`  Source: ${themeFile} (Global/Implicit)`);
                                    console.log(`  Styles:`, styles);
                                    found = true;
                                    // We stop after first match? Or list all? 
                                    // Listing all might be noisy if it's a common utility class.
                                    // Let's stop at first match for now to keep output clean, 
                                    // or we could collect them. Given the request, "any matching values",
                                    // showing the first one is finding a match.
                                    break;
                                }
                            }
                        }

                        if (!found) {
                            // console.log(`\nClass: ${className} - No theme data found in imported files or global context.`);
                        }
                    });

                } else {
                    console.error(`Theme context file not found at: ${themeContextPath}`);
                }
            }

        } catch (error: any) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program.parse();
