#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

// Search for console.log in client/src excluding tests and mocks
const pattern = 'console\\.log\\(';
const args = [
  '-n', pattern,
  'client/src',
  '--glob', '!**/*.test.*',
  '--glob', '!**/__mocks__/**',
];

const res = spawnSync('rg', args, { encoding: 'utf8' });
if (res.status === 0 && res.stdout.trim()) {
  console.error('Found console.log statements in source files:');
  console.error(res.stdout.trim());
  process.exit(1);
}
process.exit(0);

