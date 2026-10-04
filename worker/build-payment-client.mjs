import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const result=await build({entryPoints:[fileURLToPath(new URL('../static/payment-client.src.js',import.meta.url))],outfile:fileURLToPath(new URL('../static/payment-client.js',import.meta.url)),bundle:true,minify:true,platform:'browser',target:'es2022',nodePaths:[fileURLToPath(new URL('./node_modules',import.meta.url))],legalComments:'inline',metafile:true});
const packages=new Map();
for(const input of Object.keys(result.metafile.inputs)){
  let folder=path.dirname(path.resolve(input));
  while(folder!==path.dirname(folder)){
    if(fs.existsSync(path.join(folder,'package.json'))){const pkg=JSON.parse(fs.readFileSync(path.join(folder,'package.json'),'utf8'));if(pkg.name){if(input.includes('node_modules'))packages.set(pkg.name,{folder,pkg});break;}}
    folder=path.dirname(folder);
  }
}
let notices='Third-party software bundled in AICQSOHOO payment-client.js\n\n';
for(const {folder,pkg} of [...packages.values()].sort((a,b)=>a.pkg.name.localeCompare(b.pkg.name))){
  notices+=pkg.name+' '+pkg.version+' — '+pkg.license+'\n';
  const license=fs.readdirSync(folder).find(name=>/^licen[cs]e(?:\.|$)/i.test(name));
  notices+=(license?fs.readFileSync(path.join(folder,license),'utf8'):pkg.license==='Apache-2.0'?fs.readFileSync(new URL('./Apache-2.0.txt',import.meta.url),'utf8'):'License/source: '+(typeof pkg.repository==='string'?pkg.repository:pkg.repository?.url||pkg.homepage||'https://www.npmjs.com/package/'+pkg.name))+'\n\n';
}
fs.writeFileSync(fileURLToPath(new URL('../static/payment-client.LICENSE.txt',import.meta.url)),notices);
console.log('bundled local x402 browser client; no wallet or network interaction');
