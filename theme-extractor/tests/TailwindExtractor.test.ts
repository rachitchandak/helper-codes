import { flattenColors } from '../src/style-intelligence/TailwindExtractor';

describe('TailwindExtractor', () => {
    describe('flattenColors', () => {
        it('should pass through flat color values', () => {
            const result = flattenColors({
                primary: '#123456',
                secondary: '#abcdef',
            });
            expect(result).toEqual({
                primary: '#123456',
                secondary: '#abcdef',
            });
        });

        it('should flatten nested color objects with dash separator', () => {
            const result = flattenColors({
                blue: {
                    '50': '#eff6ff',
                    '500': '#3b82f6',
                    '900': '#1e3a8a',
                },
            });
            expect(result).toEqual({
                'blue-50': '#eff6ff',
                'blue-500': '#3b82f6',
                'blue-900': '#1e3a8a',
            });
        });

        it('should handle deeply nested objects', () => {
            const result = flattenColors({
                brand: {
                    primary: {
                        light: '#e3f2fd',
                        dark: '#0d47a1',
                    },
                },
            });
            expect(result).toEqual({
                'brand-primary-light': '#e3f2fd',
                'brand-primary-dark': '#0d47a1',
            });
        });

        it('should handle mixed flat and nested values', () => {
            const result = flattenColors({
                white: '#ffffff',
                gray: {
                    '100': '#f3f4f6',
                    '900': '#111827',
                },
            });
            expect(result).toEqual({
                white: '#ffffff',
                'gray-100': '#f3f4f6',
                'gray-900': '#111827',
            });
        });

        it('should normalize 3-digit hex values', () => {
            const result = flattenColors({
                accent: '#f0f',
            });
            expect(result).toEqual({
                accent: '#ff00ff',
            });
        });

        it('should handle empty objects', () => {
            const result = flattenColors({});
            expect(result).toEqual({});
        });

        it('should normalize rgb values', () => {
            const result = flattenColors({
                custom: 'rgb(255, 0, 0)',
            });
            expect(result).toEqual({
                custom: '#ff0000',
            });
        });
    });
});
