const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function installPackage(mod) {
  try {
    console.log(`[auto] Installing missing dependency: ${mod}`);
    execFileSync('npm', ['i', mod], { stdio: 'inherit' });
    console.log(`[auto] Installed: ${mod}`);
    return true;
  } catch (e) {
    console.error(`[auto] Failed to install ${mod}:`, e.message || e);
    return false;
  }
}

function isExternalModule(mod) {
  if (!mod) return false;
  if (mod.startsWith('.') || mod.startsWith('/') || mod.includes('\\')) return false;
  return true;
}

function killProcessTree(pid) {
  return new Promise((resolve) => {
    try {
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
        killer.on('close', () => resolve());
      } else {
        process.kill(pid, 'SIGKILL');
        resolve();
      }
    } catch {
      resolve();
    }
  });
}

async function startWithAutoInstall() {
  const attempted = new Set();
  let attempts = 0;
  const maxAttempts = 20;

  while (attempts < maxAttempts) {
    attempts++;
    console.log('[auto] Launching bot...');

    const child = spawn(process.execPath, ['--no-deprecation', 'devrock.js'], {
      cwd: process.cwd(),
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let installing = false;
    let pendingInstallMod = null;
    let handled = false;

    child.stdout.on('data', (d) => process.stdout.write(d));
    child.stderr.on('data', async (d) => {
      const s = d.toString();
      process.stderr.write(d);

      if (handled || installing) return;
      const m =
        s.match(/Cannot find module '([^']+)'/) ||
        s.match(/Error: Cannot find module '([^']+)'/);
      if (!m) return;

      const mod = m[1];
      if (!isExternalModule(mod)) {
        console.error(`[auto] Missing local/relative module "${mod}". Please check your code/import path.`);
        handled = true;
        await killProcessTree(child.pid);
        process.exit(1);
        return;
      }
      if (attempted.has(mod)) {
        console.error(`[auto] Already tried installing "${mod}" but the error persists. Stopping.`);
        handled = true;
        await killProcessTree(child.pid);
        process.exit(1);
        return;
      }

      installing = true;
      pendingInstallMod = mod;
      attempted.add(mod);
      console.log(`[auto] Detected missing module: ${mod}. Stopping child and installing...`);
      await killProcessTree(child.pid);

      const ok = installPackage(mod);
      installing = false;
      if (!ok) {
        console.error('[auto] Installation failed. Stopping.');
        handled = true;
        process.exit(1);
        return;
      }

      handled = true;
      console.log('[auto] Restarting after install...');
      return;
    });

    const code = await new Promise((resolve) => {
      child.on('exit', (c) => resolve(c));
      child.on('error', () => resolve(1));
    });

    if (handled) {
      // We installed something and broke out to restart quickly
      continue;
    }

    if (code === 0 || code === null) {
      return;
    }

    console.error('[auto] Bot exited with an error not related to missing modules. Stopping.');
    process.exit(code || 1);
  }

  console.error('[auto] Reached maximum auto-install attempts. Stopping.');
  process.exit(1);
}

startWithAutoInstall().catch((e) => {
  console.error('[auto] Unexpected error in runner:', e);
  process.exit(1);
});
