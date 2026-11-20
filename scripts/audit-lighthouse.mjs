import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'docs', 'perf', 'lighthouse');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function isServerRunning(url) {
  try {
    const res = await fetch(url);
    return res.status < 500;
  } catch {
    return false;
  }
}

async function ensureServer() {
  const running = await isServerRunning(BASE_URL);
  if (running) {
    console.log(`[Lighthouse Audit] Server already running at ${BASE_URL}`);
    return null;
  }

  console.log(`[Lighthouse Audit] Starting production server at ${BASE_URL}...`);
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const server = spawn(npmCmd, ['run', 'start'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });

  const startTime = Date.now();
  while (Date.now() - startTime < 30000) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isServerRunning(BASE_URL)) {
      console.log(`[Lighthouse Audit] Production server ready at ${BASE_URL}`);
      return server;
    }
  }

  throw new Error('Production server failed to start within 30 seconds.');
}

async function getAuthCookie(baseUrl) {
  // Read credentials strictly from environment variables
  const email = process.env.LIGHTHOUSE_AUDIT_EMAIL || process.env.AUDIT_EMAIL;
  const password = process.env.LIGHTHOUSE_AUDIT_PASSWORD || process.env.AUDIT_PASSWORD;

  if (!email || !password) {
    throw new Error('[FATAL] Set LIGHTHOUSE_AUDIT_EMAIL and LIGHTHOUSE_AUDIT_PASSWORD to run the authenticated dashboard Lighthouse audits.');
  }

  try {
    const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`);
    const csrfData = await csrfRes.json();
    const rawCsrfCookies = csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [csrfRes.headers.get('set-cookie')];
    const csrfCookieHeader = rawCsrfCookies.filter(Boolean).map(c => c.split(';')[0]).join('; ');

    const loginRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': csrfCookieHeader,
      },
      body: new URLSearchParams({
        csrfToken: csrfData.csrfToken,
        email,
        password,
      }),
      redirect: 'manual',
    });

    const loginCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie')];
    const sessionCookie = loginCookies.find(c => c && c.includes('authjs.session-token'));
    if (sessionCookie) {
      const parsed = sessionCookie.split(';')[0];
      const eqIdx = parsed.indexOf('=');
      const name = parsed.slice(0, eqIdx);
      const value = parsed.slice(eqIdx + 1);

      // Verify session cookie actually grants access to /dashboard (no redirect to /login)
      const testDash = await fetch(`${baseUrl}/dashboard`, {
        headers: { Cookie: parsed },
        redirect: 'manual',
      });

      if (testDash.status === 200) {
        console.log(`[Lighthouse Audit] Authenticated session established and verified for audit user.`);
        return { cookieString: parsed, name, value, verified: true };
      } else {
        console.warn(`[Lighthouse Audit] Session cookie was obtained but /dashboard returned HTTP ${testDash.status}.`);
      }
    }
  } catch (err) {
    console.warn('[Lighthouse Audit] Warning: Authentication attempt failed:', err.message);
  }
  return null;
}

async function setCdpCookie(port, cookieName, cookieValue) {
  try {
    const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await listRes.json();
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    if (!pageTarget?.webSocketDebuggerUrl) return;

    await new Promise((resolve) => {
      const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: 999,
          method: 'Network.setCookie',
          params: {
            name: cookieName,
            value: cookieValue,
            domain: 'localhost',
            path: '/',
            httpOnly: true,
            sameSite: 'Lax',
          },
        }));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id === 999) {
          ws.close();
          resolve();
        }
      };
      ws.onerror = () => {
        ws.close();
        resolve();
      };
      setTimeout(() => {
        try { ws.close(); } catch {}
        resolve();
      }, 2000);
    });
  } catch (err) {
    console.warn('[Lighthouse Audit] CDP cookie injection notice:', err.message);
  }
}

async function runAudit() {
  const serverProcess = await ensureServer();

  console.log('\n======================================================');
  console.log('OFFICIAL GOOGLE LIGHTHOUSE AUTOMATED AUDIT');
  console.log('======================================================\n');

  const authSession = await getAuthCookie(BASE_URL);
  if (!authSession?.verified) {
    throw new Error('[FATAL] Authenticated Lighthouse audit requires a verified session. Set LIGHTHOUSE_AUDIT_EMAIL and LIGHTHOUSE_AUDIT_PASSWORD to a valid audit account.');
  }

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });

  await setCdpCookie(chrome.port, authSession.name, authSession.value);

  const targets = [
    { name: 'landing-mobile', url: `${BASE_URL}/`, formFactor: 'mobile' },
    { name: 'landing-desktop', url: `${BASE_URL}/`, formFactor: 'desktop' },
    { name: 'login-mobile', url: `${BASE_URL}/login`, formFactor: 'mobile' },
    { name: 'login-desktop', url: `${BASE_URL}/login`, formFactor: 'desktop' },
    { name: 'register-mobile', url: `${BASE_URL}/register`, formFactor: 'mobile' },
    { name: 'register-desktop', url: `${BASE_URL}/register`, formFactor: 'desktop' },
    { name: 'dashboard-mobile', url: `${BASE_URL}/dashboard`, formFactor: 'mobile', authenticated: true },
    { name: 'dashboard-desktop', url: `${BASE_URL}/dashboard`, formFactor: 'desktop', authenticated: true },
  ];

  const auditResults = [];

  try {
    for (const target of targets) {
      if (target.authenticated) {
        if (!authSession || !authSession.verified) {
          throw new Error(
            `[FATAL] Aborting authenticated audit for "${target.name}": Valid authenticated session could not be established or verified. ` +
            `Ensure LIGHTHOUSE_AUDIT_EMAIL and LIGHTHOUSE_AUDIT_PASSWORD are set to a valid user account.`
          );
        }
      }

      console.log(`Running Lighthouse for: ${target.name} (${target.url}) [${target.formFactor}]...`);

      const flags = {
        port: chrome.port,
        output: ['json', 'html'],
        logLevel: 'error',
        formFactor: target.formFactor,
        screenEmulation:
          target.formFactor === 'desktop'
            ? {
                mobile: false,
                width: 1350,
                height: 940,
                deviceScaleFactor: 1,
                disabled: false,
              }
            : {
                mobile: true,
                width: 412,
                height: 823,
                deviceScaleFactor: 1.75,
                disabled: false,
              },
        throttlingMethod: 'simulate',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      };

      if (target.authenticated && authSession?.verified) {
        flags.extraHeaders = {
          Cookie: authSession.cookieString,
        };
        await setCdpCookie(chrome.port, authSession.name, authSession.value);
      }

      const runnerResult = await lighthouse(target.url, flags);
      const lhr = runnerResult.lhr;

      const jsonPath = path.join(outputDir, `${target.name}.report.json`);
      const htmlPath = path.join(outputDir, `${target.name}.report.html`);

      fs.writeFileSync(jsonPath, runnerResult.report[0]);
      fs.writeFileSync(htmlPath, runnerResult.report[1]);

      const scores = {
        performance: Math.round((lhr.categories.performance?.score || 0) * 100),
        accessibility: Math.round((lhr.categories.accessibility?.score || 0) * 100),
        bestPractices: Math.round((lhr.categories['best-practices']?.score || 0) * 100),
        seo: Math.round((lhr.categories.seo?.score || 0) * 100),
      };

      const cwv = {
        fcpMs: Math.round(lhr.audits['first-contentful-paint']?.numericValue || 0),
        lcpMs: Math.round(lhr.audits['largest-contentful-paint']?.numericValue || 0),
        cls: Number((lhr.audits['cumulative-layout-shift']?.numericValue || 0).toFixed(3)),
        tbtMs: Math.round(lhr.audits['total-blocking-time']?.numericValue || 0),
        speedIndexMs: Math.round(lhr.audits['speed-index']?.numericValue || 0),
      };

      // Extract opportunities
      const opportunities = Object.values(lhr.audits)
        .filter((a) => a.details && a.details.type === 'opportunity' && (a.details.overallSavingsMs > 0 || a.details.overallSavingsBytes > 0))
        .map((a) => ({
          id: a.id,
          title: a.title,
          savingsMs: a.details.overallSavingsMs || 0,
          savingsBytes: a.details.overallSavingsBytes || 0,
        }));

      console.log(`   -> Performance:    ${scores.performance}/100`);
      console.log(`   -> Accessibility:  ${scores.accessibility}/100`);
      console.log(`   -> Best Practices: ${scores.bestPractices}/100`);
      console.log(`   -> SEO:            ${scores.seo}/100`);
      console.log(`   -> FCP: ${cwv.fcpMs}ms | LCP: ${cwv.lcpMs}ms | CLS: ${cwv.cls} | TBT: ${cwv.tbtMs}ms | SI: ${cwv.speedIndexMs}ms`);

      auditResults.push({
        target: target.name,
        url: target.url,
        formFactor: target.formFactor,
        scores,
        cwv,
        opportunities,
        jsonFile: `${target.name}.report.json`,
        htmlFile: `${target.name}.report.html`,
      });
    }

    // Write summary report to docs/performance/LIGHTHOUSE_AUDIT_REPORT.md
    generateMarkdownReport(auditResults);
    console.log(`\n[Lighthouse Audit] Raw reports and summary written to ${outputDir} and docs/performance/LIGHTHOUSE_AUDIT_REPORT.md`);

  } finally {
    await chrome.kill();
    if (serverProcess) {
      if (process.platform === 'win32' && serverProcess.pid) {
        try {
          spawn('taskkill', ['/pid', serverProcess.pid.toString(), '/f', '/t'], { shell: true });
        } catch {}
      } else {
        serverProcess.kill();
      }
    }
  }
}

function generateMarkdownReport(results) {
  const reportPath = path.join(projectRoot, 'docs', 'performance', 'LIGHTHOUSE_AUDIT_REPORT.md');

  let md = `# ATLAS Analytics — Official Google Lighthouse Audit Report\n\n`;
  md += `**Audit Tool**: Official Google Lighthouse CLI v13.6.0 via Chrome Headless\n`;
  md += `**Environment**: Next.js Production Build (\`npm run start\`) on Node.js\n`;
  md += `**Audit Timestamp**: ${new Date().toISOString()}\n`;
  md += `**Raw Artifacts Directory**: \`docs/perf/lighthouse/\`\n\n`;
  md += `> [!NOTE]\n`;
  md += `> These scores are generated strictly by Google Lighthouse CLI v13.6.0 and saved as raw JSON and HTML reports. They are not hand-calculated or simulated with custom Playwright timers.\n\n`;
  md += `--- \n\n`;

  md += `## 1. Executive Summary Table\n\n`;
  md += `| Page / Route | Form Factor | Performance | Accessibility | Best Practices | SEO | FCP | LCP | CLS | TBT |\n`;
  md += `| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

  for (const r of results) {
    md += `| **${r.target}** | ${r.formFactor} | **${r.scores.performance}** | **${r.scores.accessibility}** | **${r.scores.bestPractices}** | **${r.scores.seo}** | ${r.cwv.fcpMs}ms | ${r.cwv.lcpMs}ms | ${r.cwv.cls} | ${r.cwv.tbtMs}ms |\n`;
  }

  md += `\n---\n\n`;
  md += `## 2. Detailed Route Breakdowns\n\n`;

  for (const r of results) {
    md += `### ${r.target.toUpperCase()} (${r.formFactor})\n`;
    md += `- **URL**: \`${r.url}\`\n`;
    md += `- **Lighthouse Category Scores**:\n`;
    md += `  - Performance: **${r.scores.performance}/100**\n`;
    md += `  - Accessibility: **${r.scores.accessibility}/100**\n`;
    md += `  - Best Practices: **${r.scores.bestPractices}/100**\n`;
    md += `  - SEO: **${r.scores.seo}/100**\n`;
    md += `- **Core Web Vitals & Key Timings**:\n`;
    md += `  - First Contentful Paint (FCP): **${r.cwv.fcpMs} ms**\n`;
    md += `  - Largest Contentful Paint (LCP): **${r.cwv.lcpMs} ms**\n`;
    md += `  - Cumulative Layout Shift (CLS): **${r.cwv.cls}**\n`;
    md += `  - Total Blocking Time (TBT): **${r.cwv.tbtMs} ms**\n`;
    md += `  - Speed Index: **${r.cwv.speedIndexMs} ms**\n`;
    md += `- **Raw Output Files**:\n`;
    md += `  - JSON: [\`${r.jsonFile}\`](file:///docs/perf/lighthouse/${r.jsonFile})\n`;
    md += `  - HTML: [\`${r.htmlFile}\`](file:///docs/perf/lighthouse/${r.htmlFile})\n`;

    if (r.opportunities.length > 0) {
      md += `- **Audit Opportunities Identified by Lighthouse**:\n`;
      for (const opp of r.opportunities) {
        md += `  - *${opp.title}*: Potential savings of ${opp.savingsMs > 0 ? `${opp.savingsMs} ms` : ''} ${opp.savingsBytes > 0 ? `${Math.round(opp.savingsBytes / 1024)} KB` : ''}\n`;
      }
    } else {
      md += `- **Audit Opportunities**: Zero major optimization opportunities detected by Lighthouse engine.\n`;
    }
    md += `\n`;
  }

  fs.writeFileSync(reportPath, md);
}

runAudit().catch((err) => {
  console.error('[Lighthouse Audit Error]:', err);
  process.exit(1);
});
