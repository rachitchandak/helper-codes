import path from 'path';
import { promises as fs } from 'fs';
import { parseCssFiles } from '../src/style-intelligence/CssParser';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

describe('CssParser', () => {
    beforeAll(async () => {
        await fs.mkdir(FIXTURES_DIR, { recursive: true });
    });

    it('should extract CSS variable declarations', async () => {
        const cssPath = path.join(FIXTURES_DIR, 'vars.css');
        await fs.writeFile(
            cssPath,
            `:root {
  --primary: #1a73e8;
  --bg: rgb(255, 255, 255);
}`,
            'utf-8'
        );

        const declarations = await parseCssFiles([cssPath]);
        const varDecls = declarations.filter((d) => d.property.startsWith('--'));
        expect(varDecls.length).toBe(2);
        expect(varDecls.find((d) => d.property === '--primary')?.value).toBe('#1a73e8');
        expect(varDecls.find((d) => d.property === '--bg')?.value).toBe('rgb(255, 255, 255)');
    });

    it('should extract color-related property declarations', async () => {
        const cssPath = path.join(FIXTURES_DIR, 'colors.css');
        await fs.writeFile(
            cssPath,
            `.card {
  color: #222;
  background: #fff;
  background-color: #f5f5f5;
  border-color: #ddd;
  font-size: 14px;
}`,
            'utf-8'
        );

        const declarations = await parseCssFiles([cssPath]);
        const props = declarations.map((d) => d.property);
        expect(props).toContain('color');
        expect(props).toContain('background');
        expect(props).toContain('background-color');
        expect(props).toContain('border-color');
        // font-size doesn't have a color value, so it should NOT be captured
        expect(props).not.toContain('font-size');
    });

    it('should capture the selector for each declaration', async () => {
        const cssPath = path.join(FIXTURES_DIR, 'selectors.css');
        await fs.writeFile(
            cssPath,
            `.header { color: #000; }
.footer { background: #333; }`,
            'utf-8'
        );

        const declarations = await parseCssFiles([cssPath]);
        const headerDecl = declarations.find((d) => d.selector === '.header');
        const footerDecl = declarations.find((d) => d.selector === '.footer');
        expect(headerDecl).toBeDefined();
        expect(footerDecl).toBeDefined();
    });

    it('should parse SCSS files with nesting', async () => {
        const scssPath = path.join(FIXTURES_DIR, 'nested.scss');
        await fs.writeFile(
            scssPath,
            `.nav {
  color: #111;
  .item {
    background: #eee;
  }
}`,
            'utf-8'
        );

        const declarations = await parseCssFiles([scssPath]);
        expect(declarations.length).toBeGreaterThanOrEqual(2);
        const navDecl = declarations.find((d) => d.property === 'color');
        expect(navDecl?.selector).toBe('.nav');
    });

    it('should capture var() references in values', async () => {
        const cssPath = path.join(FIXTURES_DIR, 'varrefs.css');
        await fs.writeFile(
            cssPath,
            `.btn {
  color: var(--primary);
  background: var(--bg, #fff);
}`,
            'utf-8'
        );

        const declarations = await parseCssFiles([cssPath]);
        expect(declarations.length).toBe(2);
        expect(declarations[0].value).toContain('var(');
    });

    it('should include the file path in each declaration', async () => {
        const cssPath = path.join(FIXTURES_DIR, 'filepath.css');
        await fs.writeFile(cssPath, '.x { color: #000; }', 'utf-8');

        const declarations = await parseCssFiles([cssPath]);
        expect(declarations[0].file).toBe(cssPath);
    });

    it('should handle empty files gracefully', async () => {
        const cssPath = path.join(FIXTURES_DIR, 'empty.css');
        await fs.writeFile(cssPath, '', 'utf-8');

        const declarations = await parseCssFiles([cssPath]);
        expect(declarations).toEqual([]);
    });
});
