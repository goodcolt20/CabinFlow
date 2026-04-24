#!/usr/bin/env node
'use strict';

const readline = require('readline');
const { execSync } = require('child_process');
const { writeFileSync, existsSync } = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
};

function print(msg) { process.stdout.write(msg + '\n'); }
function step(msg) { print(`\n${C.cyan}${C.bold}>${C.reset} ${msg}`); }
function ok(msg)   { print(`${C.green}✓${C.reset} ${msg}`); }
function warn(msg) { print(`${C.yellow}!${C.reset} ${msg}`); }

function ask(rl, question, defaultVal) {
  return new Promise(resolve => {
    const hint = defaultVal ? ` ${C.dim}[${defaultVal}]${C.reset}` : '';
    rl.question(`  ${question}${hint}: `, answer => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
}

async function main() {
  print('');
  print(`${C.cyan}${C.bold}  ╔══════════════════════════╗`);
  print(`  ║   CabinFlow  Setup       ║`);
  print(`  ╚══════════════════════════╝${C.reset}`);
  print('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  print(`${C.dim}  Set the host to 0.0.0.0 to listen on all interfaces (including Tailscale).`);
  print(`  To restrict to Tailscale only, enter your machine's Tailscale IP (e.g. 100.x.x.x).${C.reset}`);

  const host = await ask(rl, 'Host', '0.0.0.0');
  const port = await ask(rl, 'Port', '3000');

  rl.close();

  // Write config
  step('Writing .env.local...');
  writeFileSync(path.join(root, '.env.local'), `HOST=${host}\nPORT=${port}\n`);
  ok(`.env.local written  (host=${host}, port=${port})`);

  // Install dependencies
  step('Installing dependencies...');
  run('npm install');
  ok('Dependencies installed');

  // Run migrations
  step('Running database migrations...');
  run('npm run db:migrate');
  ok('Database ready');

  print('');
  print(`${C.green}${C.bold}  Setup complete!${C.reset}`);
  print(`  Start the server with:  ${C.bold}npm start${C.reset}`);
  print(`  Or in dev mode with:    ${C.bold}npm run dev${C.reset}`);
  print(`  Then open:              ${C.bold}http://${host === '0.0.0.0' ? 'localhost' : host}:${port}${C.reset}`);
  print('');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
