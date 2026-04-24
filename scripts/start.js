#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env.local');

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(l => {
        const idx = l.indexOf('=');
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      })
  );
}

const env = loadEnv(envFile);
const host = env.HOST || '0.0.0.0';
const port = env.PORT || '3000';
const isDev = process.argv.includes('--dev');

const cmd = isDev
  ? `npx next dev -H ${host} -p ${port}`
  : `npx next start -H ${host} -p ${port}`;

if (!isDev && !existsSync(path.join(root, '.next', 'BUILD_ID'))) {
  console.log('No production build found. Running next build first...');
  execSync('npx next build', { stdio: 'inherit', cwd: root });
}

console.log(`Starting CabinFlow on ${host}:${port} (${isDev ? 'dev' : 'production'})...`);

execSync(cmd, { stdio: 'inherit', cwd: root });
