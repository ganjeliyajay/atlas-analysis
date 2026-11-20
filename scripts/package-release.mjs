import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const archiverModule = require('archiver');
const createArchive = typeof archiverModule === 'function'
  ? archiverModule
  : (format, options) => {
      if (format === 'zip' && archiverModule.ZipArchive) {
        return new archiverModule.ZipArchive(options);
      }
      if (archiverModule.Archiver) {
        return new archiverModule.Archiver(format, options);
      }
      throw new Error('Unsupported archiver module structure');
    };
const projectRoot = path.resolve(import.meta.dirname, '..');
const outputZip = path.resolve(projectRoot, '..', 'analysis-webapp-release.zip');
const legacyZip = path.resolve(projectRoot, '..', 'analysis-webapp.zip');

const EXCLUDE_DIRS = new Set(['node_modules', '.next', '.git', 'playwright-report', 'test-results', 'coverage', '.vercel']);
const FORBIDDEN_FILE = /^(?:\.env(?:\.(?!example$).*)?|.*\.(?:pem|key|p12|pfx|tsbuildinfo))$/i;
const REQUIRED = [
  '.github/workflows/ci.yml', '.env.example', 'package.json', 'package-lock.json',
  'prisma/schema.prisma', 'PRODUCTION_DEPLOYMENT_CHECKLIST.md', 'RELEASE_SECURITY_CHECKLIST.md',
];

function include(rel) {
  const normalized = rel.split(path.sep).join('/');
  const parts = normalized.split('/');
  if (parts.slice(0, -1).some((part) => EXCLUDE_DIRS.has(part))) return false;
  const name = parts.at(-1);
  if (name === '.env.example') return true;
  if (FORBIDDEN_FILE.test(name)) return false;
  if (/^(?:npm-debug\.log|yarn-debug\.log|yarn-error\.log)$/i.test(name)) return false;
  return true;
}

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(projectRoot, abs);
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) collect(abs, out);
    } else if (entry.isFile() && include(rel)) out.push(rel);
  }
  return out;
}

async function createZip(files, destination) {
  await fs.promises.rm(destination, { force: true });
  const output = fs.createWriteStream(destination);
  const archive = createArchive('zip', { zlib: { level: 9 } });
  const done = new Promise((resolve, reject) => {
    output.once('close', resolve);
    output.once('error', reject);
    archive.once('error', reject);
    archive.once('warning', (err) => err.code === 'ENOENT' ? reject(err) : reject(err));
  });
  archive.pipe(output);
  for (const rel of files) {
    archive.file(path.join(projectRoot, rel), { name: `analysis-webapp/${rel.split(path.sep).join('/')}` });
  }
  await archive.finalize();
  await done;
  const stat = await fs.promises.stat(destination);
  if (!stat.size) throw new Error(`Generated archive is empty: ${destination}`);
  return stat.size;
}

async function main() {
  const files = collect(projectRoot).sort();
  const fileSet = new Set(files.map((f) => f.split(path.sep).join('/')));
  const missing = REQUIRED.filter((f) => !fileSet.has(f));
  if (missing.length) throw new Error(`Mandatory release files missing: ${missing.join(', ')}`);
  const leaked = files.filter((f) => {
    const base = path.posix.basename(f.split(path.sep).join('/'));
    return base !== '.env.example' && FORBIDDEN_FILE.test(base);
  });
  if (leaked.length) throw new Error(`Forbidden files in package list: ${leaked.join(', ')}`);

  const bytes = await createZip(files, outputZip);
  await fs.promises.copyFile(outputZip, legacyZip);
  console.log(`Created ${outputZip}`);
  console.log(`Bytes: ${bytes}; source files: ${files.length}`);
  console.log(`Mirrored ${legacyZip}`);
}

main().catch((err) => {
  console.error(`[RELEASE PACKAGING FAILED] ${err.message}`);
  process.exitCode = 1;
});
