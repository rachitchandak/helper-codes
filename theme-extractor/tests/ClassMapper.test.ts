import { mapClasses } from '../src/style-intelligence/ClassMapper';
import { CssDeclaration } from '../src/style-intelligence/types';

describe('ClassMapper', () => {
    it('should map a class with direct hex colors', () => {
        const declarations: CssDeclaration[] = [
            { selector: '.card', property: 'background', value: '#ffffff', file: 'test.css' },
            { selector: '.card', property: 'color', value: '#222222', file: 'test.css' },
        ];
        const result = mapClasses(declarations, {});
        expect(result['test.css']).toBeDefined();
        expect(result['test.css']['.card']).toEqual({
            background: '#ffffff',
            color: '#222222',
        });
    });

    it('should resolve var() references using resolved variables', () => {
        const declarations: CssDeclaration[] = [
            { selector: '.btn', property: 'background-color', value: 'var(--primary)', file: 'test.css' },
            { selector: '.btn', property: 'color', value: 'var(--text)', file: 'test.css' },
        ];
        const resolvedVars: Record<string, string> = {
            '--primary': '#1a73e8',
            '--text': '#ffffff',
        };
        const result = mapClasses(declarations, resolvedVars);
        expect(result['test.css']['.btn']).toEqual({
            background: '#1a73e8',
            color: '#ffffff',
        });
    });

    it('should handle var() with fallback when variable is not resolved', () => {
        const declarations: CssDeclaration[] = [
            { selector: '.box', property: 'border-color', value: 'var(--missing, #cccccc)', file: 'test.css' },
        ];
        const result = mapClasses(declarations, {});
        expect(result['test.css']['.box']).toEqual({
            borderColor: '#cccccc',
        });
    });

    it('should skip non-color properties', () => {
        const declarations: CssDeclaration[] = [
            { selector: '.text', property: 'font-size', value: '16px', file: 'test.css' },
            { selector: '.text', property: 'color', value: '#333333', file: 'test.css' },
        ];
        const result = mapClasses(declarations, {});
        expect(result['test.css']['.text']).toEqual({
            color: '#333333',
        });
    });

    it('should normalize rgb values to hex', () => {
        const declarations: CssDeclaration[] = [
            { selector: '.hero', property: 'background', value: 'rgb(255, 0, 0)', file: 'test.css' },
        ];
        const result = mapClasses(declarations, {});
        expect(result['test.css']['.hero']).toEqual({
            background: '#ff0000',
        });
    });

    it('should sort output keys alphabetically (files then selectors)', () => {
        const declarations: CssDeclaration[] = [
            { selector: '.z-class', property: 'color', value: '#000000', file: 'test.css' },
            { selector: '.a-class', property: 'color', value: '#ffffff', file: 'test.css' },
            { selector: '.other', property: 'color', value: '#111111', file: 'other.css' },
        ];
        const result = mapClasses(declarations, {});
        const files = Object.keys(result);
        expect(files[0]).toBe('other.css');
        expect(files[1]).toBe('test.css');

        const testSelectors = Object.keys(result['test.css']);
        expect(testSelectors[0]).toBe('.a-class');
        expect(testSelectors[1]).toBe('.z-class');
    });

    it('should handle background-color and map to background key', () => {
        const declarations: CssDeclaration[] = [
            { selector: '.panel', property: 'background-color', value: '#f5f5f5', file: 'test.css' },
        ];
        const result = mapClasses(declarations, {});
        expect(result['test.css']['.panel']).toEqual({
            background: '#f5f5f5',
        });
    });

    it('should skip declarations with unresolvable var()', () => {
        const declarations: CssDeclaration[] = [
            { selector: '.widget', property: 'color', value: 'var(--undefined-var)', file: 'test.css' },
        ];
        const result = mapClasses(declarations, {});
        expect(result['test.css']).toBeUndefined();
    });
});
