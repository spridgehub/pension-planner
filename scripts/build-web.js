// Bundle the engine (with its data) and the UI into one self-contained HTML page:
// dist/pension-planner.html. Needs esbuild (fetched with npx on first run).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const engine = execFileSync('npx', ['--yes', 'esbuild@0.28.2', 'src/index.js', '--bundle', '--format=iife', '--global-name=RE', '--minify', '--target=es2020'], { cwd: root, maxBuffer: 1 << 26 }).toString();
const app = readFileSync(root + 'web/app.js', 'utf8');
const html = readFileSync(root + 'web/app.html', 'utf8')
  .replace('/*ENGINE*/', () => engine.replace(/<\/script/gi, '<\\/script'))
  .replace('/*APP*/', () => app.replace(/<\/script/gi, '<\\/script'));
mkdirSync(root + 'dist', { recursive: true });
writeFileSync(root + 'dist/pension-planner.html', html);
console.log(`dist/pension-planner.html ${(html.length / 1024).toFixed(0)} KB`);

// GitHub Pages copy (served from /docs on main): the same page in a full document.
mkdirSync(root + 'docs', { recursive: true });
writeFileSync(root + 'docs/index.html', '<!doctype html><html lang="en-GB"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>'
  + '</head><body>' + html + '</body></html>\n');
writeFileSync(root + 'docs/.nojekyll', '');
console.log('docs/index.html (GitHub Pages)');
