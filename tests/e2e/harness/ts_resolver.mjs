import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (
      err.code === 'ERR_MODULE_NOT_FOUND' ||
      err.code === 'ERR_UNSUPPORTED_DIR_IMPORT'
    ) {
      const { parentURL } = context;
      let basePath = null;

      if (parentURL && (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/'))) {
        const parentPath = fileURLToPath(parentURL);
        basePath = path.resolve(path.dirname(parentPath), specifier);
      } else if (specifier.startsWith('src/')) {
        basePath = path.resolve(projectRoot, specifier);
      } else if (specifier.startsWith('@/')) {
        basePath = path.resolve(projectRoot, 'src', specifier.slice(2));
      }

      if (basePath) {
        // 1. Try specifier + extension
        for (const ext of EXTENSIONS) {
          const candidate = basePath + ext;
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return {
              shortCircuit: true,
              url: pathToFileURL(candidate).href,
            };
          }
        }

        // 2. Try index file inside directory
        if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
          for (const ext of EXTENSIONS) {
            const indexCandidate = path.join(basePath, 'index' + ext);
            if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
              return {
                shortCircuit: true,
                url: pathToFileURL(indexCandidate).href,
              };
            }
          }
        }
      }
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:')) {
    const filePath = fileURLToPath(url);

    // Provide seamless JSON module import support for TS/ESM tests
    if (url.endsWith('.json')) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return {
        format: 'module',
        shortCircuit: true,
        source: `export default ${raw.trim()};`,
      };
    }

    // Type-only files (like src/types/rental.ts):
    // In Node 24, type stripping removes all interface and type declarations.
    // If other files import them as values (e.g. import { BillRecord } from '../types/rental'),
    // Node throws: "SyntaxError: The requested module ... does not provide an export named 'BillRecord'".
    // By providing dummy JS exports for type-only files, we prevent runtime import crashes.
    if (url.includes('/types/') || url.endsWith('rental.ts')) {
      if (fs.existsSync(filePath)) {
        const code = fs.readFileSync(filePath, 'utf8');
        const exportNames = [];
        for (const m of code.matchAll(/export\s+(?:interface|type)\s+([A-Za-z0-9_$]+)/g)) {
          exportNames.push(m[1]);
        }
        const dummyExports = exportNames
          .map((name) => `export const ${name} = Object.freeze({});`)
          .join('\n');
        return {
          format: 'module',
          shortCircuit: true,
          source: dummyExports,
        };
      }
    }
  }

  return nextLoad(url, context);
}
