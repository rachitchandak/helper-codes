import { resolveVariables } from '../src/style-intelligence/VariableResolver';

describe('VariableResolver', () => {
    it('should resolve simple variable to a color', () => {
        const rawVars = {
            '--primary': '#1a73e8',
        };
        const resolved = resolveVariables(rawVars);
        expect(resolved['--primary']).toBe('#1a73e8');
    });

    it('should resolve nested var() chains', () => {
        const rawVars = {
            '--primary': 'var(--blue)',
            '--blue': '#1a73e8',
        };
        const resolved = resolveVariables(rawVars);
        expect(resolved['--primary']).toBe('#1a73e8');
        expect(resolved['--blue']).toBe('#1a73e8');
    });

    it('should resolve deeply nested var() chains', () => {
        const rawVars = {
            '--a': 'var(--b)',
            '--b': 'var(--c)',
            '--c': 'var(--d)',
            '--d': '#ff0000',
        };
        const resolved = resolveVariables(rawVars);
        expect(resolved['--a']).toBe('#ff0000');
        expect(resolved['--b']).toBe('#ff0000');
        expect(resolved['--c']).toBe('#ff0000');
        expect(resolved['--d']).toBe('#ff0000');
    });

    it('should handle fallback syntax var(--x, #fff)', () => {
        const rawVars = {
            '--color': 'var(--nonexistent, #ffffff)',
        };
        const resolved = resolveVariables(rawVars);
        expect(resolved['--color']).toBe('#ffffff');
    });

    it('should prefer defined variable over fallback', () => {
        const rawVars = {
            '--color': 'var(--defined, #ffffff)',
            '--defined': '#000000',
        };
        const resolved = resolveVariables(rawVars);
        expect(resolved['--color']).toBe('#000000');
    });

    it('should detect circular references and exclude them', () => {
        const rawVars = {
            '--a': 'var(--b)',
            '--b': 'var(--a)',
        };
        const resolved = resolveVariables(rawVars);
        // Circular references should not appear in output
        expect(resolved['--a']).toBeUndefined();
        expect(resolved['--b']).toBeUndefined();
    });

    it('should detect self-referencing variables', () => {
        const rawVars = {
            '--self': 'var(--self)',
        };
        const resolved = resolveVariables(rawVars);
        expect(resolved['--self']).toBeUndefined();
    });

    it('should use fallback when circular reference is detected', () => {
        const rawVars = {
            '--a': 'var(--b, #ff0000)',
            '--b': 'var(--a)',
        };
        const resolved = resolveVariables(rawVars);
        expect(resolved['--a']).toBe('#ff0000');
    });

    it('should only include variables that resolve to colors', () => {
        const rawVars = {
            '--color': '#ff0000',
            '--font': 'Arial, sans-serif',
            '--size': '16px',
        };
        const resolved = resolveVariables(rawVars);
        expect(resolved['--color']).toBe('#ff0000');
        expect(resolved['--font']).toBeUndefined();
        expect(resolved['--size']).toBeUndefined();
    });

    it('should normalize 3-digit hex during resolution', () => {
        const rawVars = {
            '--short': '#fff',
        };
        const resolved = resolveVariables(rawVars);
        expect(resolved['--short']).toBe('#ffffff');
    });

    it('should resolve rgb() values', () => {
        const rawVars = {
            '--rgb-color': 'rgb(26, 115, 232)',
        };
        const resolved = resolveVariables(rawVars);
        expect(resolved['--rgb-color']).toBe('#1a73e8');
    });

    it('should handle empty variable map', () => {
        const resolved = resolveVariables({});
        expect(resolved).toEqual({});
    });
});
