/* Naruve — bump the build number.
   Run before every push:  node scripts/bump.mjs
   · increments the patch number in docs/version.json
   · stamps the same number into docs/sw.js so the cache name changes
   A changed cache name is what forces the phone to pick up new files.        */

import fs from 'node:fs';

const vPath  = 'docs/version.json';
const swPath = 'docs/sw.js';

const v = JSON.parse(fs.readFileSync(vPath, 'utf8'));
const parts = String(v.build).split('.').map(Number);
parts[2] = (parts[2] || 0) + 1;
const build = parts.join('.');
const date = new Date().toISOString().slice(0, 10);

fs.writeFileSync(vPath, JSON.stringify({ build, date }) + '\n');

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const BUILD = '[^']*';/, `const BUILD = '${build}';`);
fs.writeFileSync(swPath, sw);

console.log(`build ${build}  (${date})`);
