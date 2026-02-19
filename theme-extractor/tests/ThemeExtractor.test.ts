import path from 'path';
import { promises as fs } from 'fs';
import { extract } from '../src/style-intelligence/ThemeExtractor';
import { ThemeContext } from '../src/style-intelligence/types';

const SAMPLE_PROJECT = path.join(__dirname, 'fixtures', 'sample-project');

describe('ThemeExtractor (integration)', () => {
    let result: ThemeContext;

    beforeAll(async () => {
        result = await extract(SAMPLE_PROJECT);
    });

    afterAll(async () => {
        // Clean up generated output
        const outputPath = path.join(SAMPLE_PROJECT, 'accessibility', 'theme-context.json');
        try {
            await fs.unlink(outputPath);
            await fs.rmdir(path.join(SAMPLE_PROJECT, 'accessibility'));
        } catch {
            // Ignore cleanup errors
        }
    });

    it('should return a valid ThemeContext object', () => {
        expect(result).toBeDefined();
        // expect(result.rawCssVariables).toBeDefined(); // Removed
        expect(result.resolvedCssVariables).toBeDefined();
        expect(result.hardcodedColors).toBeDefined();
        expect(result.classMap).toBeDefined();
        expect(result.tailwindColors).toBeDefined();
        expect(result.tailwindUtilities).toBeDefined();
    });

    // it('should extract raw CSS variables', () => { ... }) // Removed

    it('should resolve CSS variables to color values', () => {
        expect(result.resolvedCssVariables['--primary']).toBe('#1a73e8');
        expect(result.resolvedCssVariables['--secondary']).toBe('#1a73e8');
        expect(result.resolvedCssVariables['--bg-light']).toBe('#f5f5f5');
        expect(result.resolvedCssVariables['--text-dark']).toBe('#222222');
        // --border uses fallback since --missing doesn't exist
        expect(result.resolvedCssVariables['--border']).toBe('#cccccc');
    });

    it('should collect hardcoded colors without duplicates', () => {
        expect(result.hardcodedColors).toContain('#ffffff');
        expect(result.hardcodedColors).toContain('#333333');
        // Check no duplicates
        const unique = new Set(result.hardcodedColors);
        expect(unique.size).toBe(result.hardcodedColors.length);
    });

    it('should have sorted hardcoded colors', () => {
        const sorted = [...result.hardcodedColors].sort();
        expect(result.hardcodedColors).toEqual(sorted);
    });

    it('should map CSS class selectors to resolved colors grouped by file', () => {
        // Find the full path to main.css or where these are defined in the fixture
        const stylesFile = Object.keys(result.classMap).find(f => f.endsWith('main.css'));
        expect(stylesFile).toBeDefined();

        if (stylesFile) {
            expect(result.classMap[stylesFile]['.header']).toBeDefined();
            expect(result.classMap[stylesFile]['.header'].background).toBe('#1a73e8');
            expect(result.classMap[stylesFile]['.header'].color).toBe('#ffffff');

            expect(result.classMap[stylesFile]['.footer']).toBeDefined();
            expect(result.classMap[stylesFile]['.footer'].background).toBe('#333333');
        }
    });

    it('should extract Tailwind colors from config', () => {
        expect(result.tailwindColors['primary']).toBe('#1a73e8');
        expect(result.tailwindColors['white']).toBe('#ffffff');
        expect(result.tailwindColors['gray-500']).toBe('#6b7280');
        expect(result.tailwindColors['accent']).toBe('#e91e63');
        expect(result.tailwindColors['blue-500']).toBe('#3b82f6');
    });

    it('should generate Tailwind utility mappings', () => {
        expect(result.tailwindUtilities['bg-primary']).toBe('#1a73e8');
        expect(result.tailwindUtilities['text-primary']).toBe('#1a73e8');
        expect(result.tailwindUtilities['border-primary']).toBe('#1a73e8');
        expect(result.tailwindUtilities['bg-gray-500']).toBe('#6b7280');
        expect(result.tailwindUtilities['text-blue-500']).toBe('#3b82f6');
    });

    it('should write theme-context.json to the accessibility directory', async () => {
        const outputPath = path.join(SAMPLE_PROJECT, 'accessibility', 'theme-context.json');
        const exists = await fs
            .access(outputPath)
            .then(() => true)
            .catch(() => false);
        expect(exists).toBe(true);

        const content = await fs.readFile(outputPath, 'utf-8');
        const parsed = JSON.parse(content) as ThemeContext;
        // expect(parsed.rawCssVariables).toEqual(result.rawCssVariables); // Removed
        expect(parsed.resolvedCssVariables).toEqual(result.resolvedCssVariables);
    });

    it('should have alphabetically sorted keys in resolvedCssVariables', () => {
        const keys = Object.keys(result.resolvedCssVariables);
        const sorted = [...keys].sort();
        expect(keys).toEqual(sorted);
    });

    it('should have alphabetically sorted keys in resolvedCssVariables', () => {
        const keys = Object.keys(result.resolvedCssVariables);
        const sorted = [...keys].sort();
        expect(keys).toEqual(sorted);
    });
});
