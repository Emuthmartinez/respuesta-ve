// Test-only ESM resolver: lets `node --test`/scripts import the app's TS modules
// that use the `@/` path alias and extensionless imports (which Next's bundler
// resolves but Node's native type-stripping does not). Used ONLY for offline
// unit tests — never imported by the app or the deployed build.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const ROOT = process.env.PROJECT_ROOT || process.cwd();

export async function resolve(specifier, context, next) {
  let spec = specifier;
  if (spec.startsWith('@/')) spec = pathToFileURL(`${ROOT}/${spec.slice(2)}`).href;

  const fileish = /^(file:|\.\.?\/|\/)/.test(spec);
  if (fileish && !/\.(ts|mts|cts|js|mjs|cjs|json|node)$/.test(spec)) {
    const base = context.parentURL || pathToFileURL(`${ROOT}/`).href;
    const url = new URL(spec, base);
    const p = fileURLToPath(url);
    if (existsSync(p + '.ts')) spec = url.href + '.ts';
    else if (existsSync(p + '.tsx')) spec = url.href + '.tsx';
  }
  return next(spec, context);
}
