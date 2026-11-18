// Copies runtime assets that must be served as static files (the Python
// runtime and the Excalidraw fonts) from node_modules into public/.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');

const pyodideSrc = join(nm, 'pyodide');
if (existsSync(pyodideSrc)) {
  const dest = join(root, 'public', 'pyodide');
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(pyodideSrc)) {
    if (/\.(d\.ts|map|md)$/.test(f) || f === 'package.json' || f === 'console.html') continue;
    cpSync(join(pyodideSrc, f), join(dest, f), { recursive: true });
  }
  console.log('copied pyodide runtime -> public/pyodide');
}

const fontsSrc = join(nm, '@excalidraw', 'excalidraw', 'dist', 'prod', 'fonts');
if (existsSync(fontsSrc)) {
  const dest = join(root, 'public', 'excalidraw-assets', 'fonts');
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(fontsSrc, dest, { recursive: true });
  console.log('copied excalidraw fonts -> public/excalidraw-assets/fonts');
}
