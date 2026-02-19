import { normalizeColor, isColorValue, isResolvedColor } from '../src/style-intelligence/ColorUtils';

describe('ColorUtils', () => {
    describe('normalizeColor', () => {
        it('should convert 3-digit hex to 6-digit hex', () => {
            expect(normalizeColor('#fff')).toBe('#ffffff');
            expect(normalizeColor('#abc')).toBe('#aabbcc');
            expect(normalizeColor('#000')).toBe('#000000');
        });

        it('should lowercase 6-digit hex', () => {
            expect(normalizeColor('#FF0000')).toBe('#ff0000');
            expect(normalizeColor('#1A73E8')).toBe('#1a73e8');
        });

        it('should convert rgb() to hex', () => {
            expect(normalizeColor('rgb(255, 255, 255)')).toBe('#ffffff');
            expect(normalizeColor('rgb(0, 0, 0)')).toBe('#000000');
            expect(normalizeColor('rgb(26, 115, 232)')).toBe('#1a73e8');
        });

        it('should convert rgba() to hex (opaque)', () => {
            expect(normalizeColor('rgba(0, 0, 0, 1)')).toBe('#000000');
            expect(normalizeColor('rgba(255, 255, 255, 1)')).toBe('#ffffff');
        });

        it('should return transparent for rgba with alpha 0', () => {
            expect(normalizeColor('rgba(0, 0, 0, 0)')).toBe('transparent');
        });

        it('should convert hsl() to hex', () => {
            expect(normalizeColor('hsl(0, 100%, 50%)')).toBe('#ff0000');
            expect(normalizeColor('hsl(120, 100%, 50%)')).toBe('#00ff00');
            expect(normalizeColor('hsl(240, 100%, 50%)')).toBe('#0000ff');
        });

        it('should convert hsla() to hex (opaque)', () => {
            expect(normalizeColor('hsla(0, 100%, 50%, 1)')).toBe('#ff0000');
        });

        it('should return transparent for hsla with alpha 0', () => {
            expect(normalizeColor('hsla(0, 100%, 50%, 0)')).toBe('transparent');
        });

        it('should handle transparent keyword', () => {
            expect(normalizeColor('transparent')).toBe('transparent');
            expect(normalizeColor('TRANSPARENT')).toBe('transparent');
        });

        it('should handle 8-digit hex', () => {
            expect(normalizeColor('#ff000000')).toBe('transparent');
            expect(normalizeColor('#ff0000ff')).toBe('#ff0000');
        });

        it('should clamp out-of-range RGB values', () => {
            expect(normalizeColor('rgb(300, 0, 0)')).toBe('#ff0000');
        });

        it('should return lowercased string for unrecognized values', () => {
            expect(normalizeColor('inherit')).toBe('inherit');
            expect(normalizeColor('currentColor')).toBe('currentcolor');
        });
    });

    describe('isColorValue', () => {
        it('should detect hex colors', () => {
            expect(isColorValue('#fff')).toBe(true);
            expect(isColorValue('#ffffff')).toBe(true);
            expect(isColorValue('#ff0000ff')).toBe(true);
        });

        it('should detect rgb/rgba', () => {
            expect(isColorValue('rgb(0,0,0)')).toBe(true);
            expect(isColorValue('rgba(0,0,0,1)')).toBe(true);
        });

        it('should detect hsl/hsla', () => {
            expect(isColorValue('hsl(0, 100%, 50%)')).toBe(true);
            expect(isColorValue('hsla(0, 100%, 50%, 0.5)')).toBe(true);
        });

        it('should detect var() references', () => {
            expect(isColorValue('var(--primary)')).toBe(true);
        });

        it('should detect transparent', () => {
            expect(isColorValue('transparent')).toBe(true);
        });

        it('should reject non-color values', () => {
            expect(isColorValue('none')).toBe(false);
            expect(isColorValue('1px solid')).toBe(false);
            expect(isColorValue('inherit')).toBe(false);
        });
    });

    describe('isResolvedColor', () => {
        it('should accept 6-digit hex', () => {
            expect(isResolvedColor('#ffffff')).toBe(true);
        });

        it('should accept transparent', () => {
            expect(isResolvedColor('transparent')).toBe(true);
        });

        it('should reject non-hex values', () => {
            expect(isResolvedColor('rgb(0,0,0)')).toBe(false);
            expect(isResolvedColor('#fff')).toBe(false);
        });
    });
});
