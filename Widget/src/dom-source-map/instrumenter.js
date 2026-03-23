import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';
import * as t from '@babel/types';
import * as cheerio from 'cheerio';

const traverse = traverseModule.default;
const generate = generateModule.default;
const ATTR_NAME = 'data-source-loc';

const SKIP_HTML_TAGS = new Set([
  'script',
  'style',
  'link',
  'meta',
  'title',
  'head',
  '!doctype',
]);

const SKIP_JSX_NAMES = new Set(['Fragment']);

const INTRINSIC_ELEMENT_NAMES = new Set([
  'a', 'abbr', 'address', 'animate', 'animateMotion', 'animateTransform',
  'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
  'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'circle',
  'cite', 'clipPath', 'code', 'col', 'colgroup', 'data', 'datalist',
  'dd', 'defs', 'del', 'desc', 'details', 'dfn', 'dialog', 'div',
  'dl', 'dt', 'ellipse', 'em', 'embed', 'feBlend', 'feColorMatrix',
  'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting',
  'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood',
  'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur',
  'feImage', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset',
  'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
  'feTurbulence', 'fieldset', 'figcaption', 'figure', 'filter', 'footer',
  'foreignObject', 'form', 'g', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'image',
  'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'line',
  'linearGradient', 'main', 'map', 'mark', 'marker', 'mask', 'menu',
  'menuitem', 'meta', 'meter', 'nav', 'noscript', 'object', 'ol',
  'optgroup', 'option', 'output', 'p', 'param', 'path', 'pattern',
  'picture', 'polygon', 'polyline', 'portal', 'pre', 'progress',
  'q', 'radialGradient', 'rect', 'rp', 'rt', 'ruby', 's', 'samp',
  'script', 'section', 'select', 'small', 'source', 'span', 'stop',
  'strong', 'style', 'sub', 'summary', 'sup', 'svg', 'symbol', 'table',
  'tbody', 'td', 'template', 'text', 'textPath', 'textarea', 'tfoot',
  'th', 'thead', 'time', 'title', 'tr', 'track', 'tspan', 'u', 'ul',
  'use', 'var', 'video', 'view', 'wbr',
]);

function isIntrinsicJsxElementName(name) {
  if (t.isJSXIdentifier(name)) {
    if (name.name.includes('-')) {
      return true;
    }

    return INTRINSIC_ELEMENT_NAMES.has(name.name);
  }

  return false;
}

export async function instrumentAllFiles(sourceDir) {
  const resolvedDir = path.resolve(sourceDir);
  console.log(`[instrumenter] Scanning: ${resolvedDir}`);

  const patterns = ['**/*.jsx', '**/*.tsx', '**/*.html', '**/*.js'];
  const files = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: resolvedDir,
      absolute: true,
      nodir: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.*/'],
    });
    files.push(...matches);
  }

  console.log(`[instrumenter] Found ${files.length} file(s) to instrument.`);

  let instrumented = 0;
  for (const filePath of files) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.html') {
        await instrumentHTMLFile(filePath);
      } else {
        await instrumentJSXLikeFile(filePath);
      }
      instrumented += 1;
    } catch (error) {
      console.warn(`[instrumenter] Skipping file (could not parse): ${filePath}`);
      console.warn(`               ${error.message}`);
    }
  }

  console.log(`[instrumenter] Instrumented ${instrumented}/${files.length} file(s).`);
  return instrumented;
}

async function instrumentJSXLikeFile(filePath) {
  const code = await fs.promises.readFile(filePath, 'utf8');
  const isTypeScript = filePath.endsWith('.tsx');

  const ast = parse(code, {
    sourceType: 'module',
    plugins: [
      'jsx',
      ...(isTypeScript ? ['typescript'] : []),
      'decorators-legacy',
      'classProperties',
      'optionalChaining',
      'nullishCoalescingOperator',
    ],
  });

  const normalisedPath = filePath.replace(/\\/g, '/');

  traverse(ast, {
    JSXOpeningElement(nodePath) {
      const { node } = nodePath;

      if (t.isJSXFragment(nodePath.parent)) {
        return;
      }

      if (t.isJSXIdentifier(node.name)) {
        if (SKIP_JSX_NAMES.has(node.name.name)) {
          return;
        }
      } else if (t.isJSXMemberExpression(node.name)) {
        if (t.isJSXIdentifier(node.name.property) && SKIP_JSX_NAMES.has(node.name.property.name)) {
          return;
        }
      }

      if (!isIntrinsicJsxElementName(node.name)) {
        return;
      }

      const alreadyHasAttr = node.attributes.some((attr) => t.isJSXAttribute(attr) && attr.name.name === ATTR_NAME);
      if (alreadyHasAttr) {
        return;
      }

      const line = node.loc?.start.line ?? 0;
      const column = node.loc?.start.column ?? 0;
      const value = `${normalisedPath}:${line}:${column}`;
      node.attributes.push(
        t.jsxAttribute(t.jsxIdentifier(ATTR_NAME), t.stringLiteral(value)),
      );
    },
  });

  const output = generate(ast, { retainLines: true }, code);
  await fs.promises.writeFile(filePath, output.code, 'utf8');
}

async function instrumentHTMLFile(filePath) {
  const html = await fs.promises.readFile(filePath, 'utf8');
  const normalisedPath = filePath.replace(/\\/g, '/');
  const $ = cheerio.load(html);
  const lines = html.split('\n');

  $('*').each(function eachNode() {
    const el = $(this);
    const tagName = this.tagName?.toLowerCase();

    if (!tagName || SKIP_HTML_TAGS.has(tagName)) {
      return;
    }
    if (el.attr(ATTR_NAME)) {
      return;
    }

    let lineNumber = 0;
    let columnNumber = 0;
    const searchPattern = `<${tagName}`;

    for (let index = 0; index < lines.length; index += 1) {
      const column = lines[index].toLowerCase().indexOf(searchPattern);
      if (column === -1) {
        continue;
      }

      lineNumber = index + 1;
      columnNumber = column;
      lines[index] = `${lines[index].slice(0, column)}${' '.repeat(searchPattern.length)}${lines[index].slice(column + searchPattern.length)}`;
      break;
    }

    el.attr(ATTR_NAME, `${normalisedPath}:${lineNumber}:${columnNumber}`);
  });

  await fs.promises.writeFile(filePath, $.html(), 'utf8');
}