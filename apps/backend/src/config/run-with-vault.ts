import { spawnSync } from 'node:child_process';
import { loadVaultEnv } from './vault-env.js';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node run-with-vault.js <command> [args...]');
  process.exit(1);
}

const result = await loadVaultEnv();
if (result.loaded) {
  console.log(`[Vault] Loaded ${result.keysCount} environment keys into memory.`);
}

const [command, ...commandArgs] = args;
const child = spawnSync(command, commandArgs, {
  stdio: 'inherit',
  env: process.env,
});

if (child.error) {
  console.error(`[Vault] Failed to launch "${command}": ${child.error.message}`);
  process.exit(1);
}

process.exit(child.status ?? 1);
