/**
 * ClassMapper — Maps CSS selectors to their resolved color properties.
 *
 * Takes parsed CSS declarations and resolved variable map,
 * resolves var() references, normalizes colors, and produces
 * a selector → { color, background, borderColor } map.
 */
import { CssDeclaration, ClassColorMap } from './types';
/**
 * Map CSS selectors to their resolved color properties, grouped by file.
 *
 * @param declarations - Parsed CSS declarations from CssParser.
 * @param resolvedVars - Resolved CSS variable map from VariableResolver.
 * @returns Map of files to selectors to their color properties.
 */
export declare function mapClasses(declarations: CssDeclaration[], resolvedVars: Record<string, string>): ClassColorMap;
//# sourceMappingURL=ClassMapper.d.ts.map