import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const releaseZip = path.resolve(projectRoot, "..", "analysis-webapp-release.zip");
const legacyZip = path.resolve(projectRoot, "..", "analysis-webapp.zip");

console.log("=================================================");
console.log("ATLAS ANALYTICS — RELEASE ARCHIVE AUDIT SCANNER");
console.log("=================================================");

/**
 * Cross-platform ZIP entry parser implementing PKWARE APPNOTE specification.
 * Reads End of Central Directory (EOCD) and Central Directory file headers.
 * Pure Node.js buffer parsing — zero external tools or PowerShell dependencies.
 */
function readZipEntries(zipPath) {
  const buf = fs.readFileSync(zipPath);
  if (buf.length < 22) {
    throw new Error(`Corrupted or truncated ZIP file (${buf.length} bytes): ${zipPath}`);
  }

  // Scan backwards for EOCD signature: 0x06054b50
  let eocdOffset = -1;
  const maxScan = Math.min(buf.length - 22, 65535 + 22);
  for (let i = buf.length - 22; i >= buf.length - 22 - maxScan && i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error(`Invalid ZIP archive (no EOCD record located): ${zipPath}`);
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let pos = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > buf.length) break;
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;

    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);

    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen);
    entries.push(name);

    pos += 46 + nameLen + extraLen + commentLen;
  }

  if (entries.length !== totalEntries) {
    throw new Error(`Central directory is incomplete: expected ${totalEntries} entries, parsed ${entries.length}.`);
  }
  return entries;
}

function inspectZip(zipPath) {
  if (!fs.existsSync(zipPath)) {
    console.error(`[FAIL] ZIP archive does not exist at: ${zipPath}`);
    return { ok: false, error: "File not found" };
  }

  const stats = fs.statSync(zipPath);
  console.log(`\nInspecting Archive: ${zipPath}`);
  console.log(`Archive Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB (${stats.size} bytes)`);

  let entries;
  try {
    entries = readZipEntries(zipPath);
  } catch (err) {
    console.error(`[FAIL] Error reading archive entries: ${err.message}`);
    return { ok: false, error: err.message };
  }

  console.log(`Total entries in archive: ${entries.length}`);

  let violations = [];
  let foundEnvExample = false;
  let foundCiWorkflow = false;

  for (const entry of entries) {
    const normalized = entry.replace(/\\/g, "/");
    const filename = path.posix.basename(normalized);
    const lower = normalized.toLowerCase();
    const lowerFilename = filename.toLowerCase();

    // 1. Strict forbidden file checks
    if (lowerFilename === '.env' || (lowerFilename.startsWith('.env.') && lowerFilename !== '.env.example')) {
      violations.push(`FORBIDDEN .env file detected: ${entry}`);
    } else if (/\.(?:pem|key|p12|pfx)$/i.test(filename)) {
      violations.push(`FORBIDDEN key file detected: ${entry}`);
    } else if (filename.endsWith(".tsbuildinfo")) {
      violations.push(`Unclean build cache detected: ${entry}`);
    } else if (lower.includes('node_modules/')) {
      violations.push(`node_modules leak detected: ${entry}`);
    } else if (lower.includes('.next/')) {
      violations.push(`.next build directory leak detected: ${entry}`);
    } else if (lower.includes('playwright-report/') || lower.includes('test-results/') || lower.includes('coverage/')) {
      violations.push(`Test result leak detected: ${entry}`);
    }

    // 2. Critical mandatory files
    if (lower === 'analysis-webapp/.env.example') foundEnvExample = true;
    if (lower === 'analysis-webapp/.github/workflows/ci.yml') foundCiWorkflow = true;
  }

  if (!foundEnvExample) {
    violations.push("MANDATORY file missing: .env.example");
  }
  if (!foundCiWorkflow) {
    violations.push("MANDATORY file missing: .github/workflows/ci.yml");
  }

  if (violations.length > 0) {
    console.error(`\n[FAILED] ${violations.length} audit violations detected in ${path.basename(zipPath)}:`);
    for (const v of violations) {
      console.error(`  - ${v}`);
    }
    return { ok: false, violations };
  }

  console.log(`[PASS] Zero environment/secret leaks in ${path.basename(zipPath)}.`);
  console.log(`[PASS] .env.example is preserved in ${path.basename(zipPath)}.`);
  console.log(`[PASS] .github/workflows/ci.yml is included in ${path.basename(zipPath)}.`);
  return { ok: true, entriesCount: entries.length };
}

// Requirement: Verify BOTH release archives if both are generated
const targets = [];
if (fs.existsSync(releaseZip)) targets.push(releaseZip);
if (fs.existsSync(legacyZip)) targets.push(legacyZip);

if (targets.length === 0) {
  console.error("\n[FATAL] Neither release archive exists! Please run 'npm run package:release' first.");
  process.exit(1);
}

let allOk = true;
for (const target of targets) {
  const res = inspectZip(target);
  if (!res.ok) {
    allOk = false;
  }
}

if (!allOk) {
  console.error("\n[SECURITY AUDIT FAILED] One or more release archives failed verification!");
  process.exit(1);
}

console.log(`\n[SUCCESS] All ${targets.length} release archive(s) passed 100% of security & integrity assertions!`);
