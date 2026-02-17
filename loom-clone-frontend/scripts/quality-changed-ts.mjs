import { spawnSync } from 'node:child_process';

const EXCLUDED_PREFIXES = ['node_modules/', '.angular/', 'dist/', 'coverage/'];

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const gitChanged = (args) => {
  const result = spawnSync('git', args, { encoding: 'utf-8' });
  if (result.status !== 0 || !result.stdout) return [];
  return result.stdout
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
};

// unstaged + staged changes
const files = [...gitChanged(['diff', '--name-only']), ...gitChanged(['diff', '--cached', '--name-only'])];

const tsFiles = [...new Set(files)]
  .filter((f) => f.endsWith('.ts'))
  .filter((f) => !EXCLUDED_PREFIXES.some((prefix) => f.startsWith(prefix)));

if (tsFiles.length === 0) {
  console.log('No changed TypeScript files found.');
  process.exit(0);
}

console.log(`Running Prettier + ESLint on ${tsFiles.length} file(s)...`);
run('yarn', ['prettier', '--write', ...tsFiles]);
run('yarn', ['eslint', '--fix', ...tsFiles]);
console.log('Done.');