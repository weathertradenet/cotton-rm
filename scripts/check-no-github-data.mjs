import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const forbiddenExtensions = ['.csv','.geojson','.topojson'];
const forbiddenDirs = new Set(['data']);
const secretPatterns = [/ntn_[A-Za-z0-9_-]{10,}/, /HAZARD_API_KEY\s*=\s*[^R\n][^\n]+/];
const allowed = new Set(['dev.vars.example']);
let failures=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules'].includes(ent.name))continue;const p=path.join(dir,ent.name),rel=path.relative(root,p);if(ent.isDirectory()){if(forbiddenDirs.has(ent.name))failures.push(`Forbidden data directory: ${rel}`);else walk(p);}else{if(forbiddenExtensions.includes(path.extname(ent.name).toLowerCase()))failures.push(`Forbidden dataset file: ${rel}`);if(!allowed.has(ent.name)){const text=fs.readFileSync(p,'utf8');for(const re of secretPatterns)if(re.test(text))failures.push(`Possible secret in ${rel}`);}}}}
walk(root); if(failures.length){console.error(failures.join('\n'));process.exit(1)} console.log('OK: no cotton datasets, boundary files, or obvious secrets found in repository.');
