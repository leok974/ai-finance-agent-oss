#!/usr/bin/env node
import { spawn } from "child_process";
import { setTimeout as wait } from "timers/promises";
import http from "http";
import { existsSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from 'url';

// Resolve repo root relative to this script file, not process.cwd()
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, "..");
const backendCwd = join(root, "apps", "backend");

// Pick a Python to run the backend
function pickPython() {
  // Respect explicit override
  if (process.env.PYTHON && process.env.PYTHON.trim()) return process.env.PYTHON.trim();
  // Local venv (Windows and POSIX)
  const venvWin = join(backendCwd, ".venv", "Scripts", "python.exe");
  const venvPosix = join(backendCwd, ".venv", "bin", "python");
  if (existsSync(venvWin)) return venvWin;
  if (existsSync(venvPosix)) return venvPosix;
  // Windows Python launcher
  if (process.platform === 'win32') return 'py';
  // Common Unix fallbacks
  return 'python3';
}
const PY = pickPython();

// Env defaults
const BACKEND_PORT = process.env.BACKEND_PORT || "8000";
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5173";
// Construct a cross-platform sqlite URL pointing to apps/backend/data/test_e2e.db
const defaultDbFile = join(backendCwd, "data", "test_e2e.db");
const defaultDbUrl = `sqlite:///${defaultDbFile.replace(/\\/g, "/")}`;
const DATABASE_URL = process.env.DATABASE_URL || defaultDbUrl;

// Clean slate: delete test DB before runs for deterministic state
try {
  unlinkSync(defaultDbFile);
  console.log(`🗑️  Deleted ${defaultDbFile} for clean test run`);
} catch (err) {
  // File might not exist, that's fine
}

// Start backend (Uvicorn)
// Prefer uvicorn from venv when available on Windows to avoid python launcher issues
const uvicornWin = join(backendCwd, ".venv", "Scripts", "uvicorn.exe");
const useUvicornExe = process.platform === 'win32' && existsSync(uvicornWin);

const backend = useUvicornExe
  ? spawn(
      uvicornWin,
      [
        "app.main:app",
        "--host", "127.0.0.1",
        "--port", BACKEND_PORT,
        "--timeout-keep-alive", "5",
        "--limit-max-requests", "500",  // increased from 200 to prevent mid-test restart
        "--no-access-log"
      ],
      {
        cwd: backendCwd,
        env: {
          ...process.env,
          APP_ENV: "dev",
          ALLOW_DEV_ROUTES: "1",
          ALLOW_REGISTRATION: process.env.ALLOW_REGISTRATION || "0",
          ENCRYPTION_ENABLED: "0",
          DATABASE_URL,
        },
        stdio: "inherit",
        shell: false,
      }
    )
  : spawn(
      PY,
      [
        "-m", "uvicorn", "app.main:app",
        "--host", "127.0.0.1",
        "--port", BACKEND_PORT,
        "--timeout-keep-alive", "5",
        "--limit-max-requests", "500",  // increased from 200 to prevent mid-test restart
        "--no-access-log"
      ],
      {
        cwd: backendCwd,
        env: {
          ...process.env,
          APP_ENV: "dev",
          ALLOW_DEV_ROUTES: "1",
          ALLOW_REGISTRATION: process.env.ALLOW_REGISTRATION || "0",
          ENCRYPTION_ENABLED: "0", // avoid crypto bootstrap for smoke
          DATABASE_URL,
        },
        stdio: "inherit",
        shell: false,
      }
    );

backend.on("error", (err) => {
  console.error("❌ Backend failed to start:", err);
  process.exit(1);
});

// Poll /api/ready until 200 or timeout
async function waitForReady(url, timeoutMs = 30000, stepMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(4000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return true;
    await wait(stepMs);
  }
  return false;
}

// Prefer dev server so /api proxy works
process.env.USE_DEV = process.env.USE_DEV ?? "1";
// We'll start Vite ourselves; tell Playwright to skip managing webServer
process.env.PW_SKIP_WS = '1';

// Wait for backend, then run Playwright
const READY_URL = `http://127.0.0.1:${BACKEND_PORT}/ready`;

const main = async () => {
  process.stdout.write(`⏳ Waiting for backend at ${READY_URL} ...\n`);
  const ready = await waitForReady(READY_URL);
  if (!ready) {
    console.error("❌ Backend did not become ready in time.");
    try { backend.kill("SIGINT"); } catch {}
    process.exit(1);
  }
  process.stdout.write("✅ Backend is ready.\n");

    // Optional seed attempt (HTTP) — safe if route not present
    try {
      await new Promise((resolve) => {
        const req = http.request(
          READY_URL.replace('/ready', '/api/dev/seed-unknowns'),
          { method: 'POST' },
          (res) => { res.resume(); resolve(undefined); }
        );
        req.on('error', () => resolve(undefined));
        req.end();
      });
    } catch { /* ignore */ }

  const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const webDir = join(root, 'apps', 'web');
  // Start Vite dev server ourselves on 5173
  const nodeBin = process.execPath || (process.platform === 'win32' ? 'node.exe' : 'node');
  const viteScript = join(webDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const vite = spawn(nodeBin, [viteScript, '--port', '5173', '--strictPort', '--host', '127.0.0.1'], {
    cwd: webDir,
    env: { ...process.env, BACKEND_PORT, ALLOW_DEV_ROUTES: '1' },
    stdio: 'inherit',
    shell: false,
  });
  vite.on('error', (err) => {
    console.error('❌ Vite failed to start:', err);
  });

  // Wait for Vite to respond
  const VITE_URL = BASE_URL;
  process.stdout.write(`⏳ Waiting for Vite at ${VITE_URL} ...\n`);
  const viteReady = await waitForReady(VITE_URL);
  if (!viteReady) {
    console.error('❌ Vite did not become ready in time.');
    try { backend.kill('SIGINT'); } catch {}
    try { vite.kill('SIGINT'); } catch {}
    process.exit(1);
  }
  process.stdout.write('✅ Vite is ready.\n');

  let e2e = spawn(pnpmCmd, [
    "exec",
    "playwright",
    "test",
    "-c",
    "./playwright.config.ts",
  ], {
    stdio: "inherit",
    env: { ...process.env, BACKEND_PORT, BASE_URL, ALLOW_DEV_ROUTES: '1' },
    cwd: webDir,
    shell: process.platform === "win32",
  });
  e2e.on('error', () => {
    // Fallback: call Playwright binary directly
    const pwBin = process.platform === 'win32'
      ? join(webDir, 'node_modules', '.bin', 'playwright.cmd')
      : join(webDir, 'node_modules', '.bin', 'playwright');
    const direct = spawn(pwBin, [
      "test",
      "-c",
      "./playwright.config.ts",
    ], {
      stdio: "inherit",
      env: { ...process.env, BACKEND_PORT, BASE_URL, ALLOW_DEV_ROUTES: '1' },
      cwd: webDir,
      shell: false,
    });
    direct.on("exit", (code) => {
      try { backend.kill("SIGINT"); } catch {}
      try { vite.kill("SIGINT"); } catch {}
      process.exit(code ?? 1);
    });
  });
  e2e.on("exit", (code) => {
    try { backend.kill("SIGINT"); } catch {}
    try { vite.kill("SIGINT"); } catch {}
    process.exit(code ?? 1);
  });
};

main().catch((e) => {
  console.error(e);
  try { backend.kill("SIGINT"); } catch {}
  process.exit(1);
});
