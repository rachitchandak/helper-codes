#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
console.log("Starting CLI...");
const commander_1 = require("commander");
const scanner_1 = require("./scanner");
const detector_1 = require("./detector");
const program = new commander_1.Command();
program
    .name('detect-css')
    .description('CLI to detect CSS class names and variables in a file')
    .version('1.0.0')
    .argument('<file>', 'path to the file to scan')
    .action((filePath) => {
    try {
        console.log(`Scanning file: ${filePath}`);
        const content = scanner_1.FileScanner.readFile(filePath);
        const classNames = detector_1.CssDetector.extractClassNames(content);
        const variables = detector_1.CssDetector.extractCssVariables(content);
        console.log('\n--- Detected CSS Class Names ---');
        if (classNames.length > 0) {
            classNames.forEach(name => console.log(`- ${name}`));
        }
        else {
            console.log('No class names detected.');
        }
        console.log('\n--- Detected CSS Variables ---');
        if (variables.length > 0) {
            variables.forEach(variable => console.log(`- ${variable}`));
        }
        else {
            console.log('No CSS variables detected.');
        }
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
});
program.parse();
