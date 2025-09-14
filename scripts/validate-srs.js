#!/usr/bin/env node
import { execSync } from 'child_process';

try {
  const diffFiles = process.env.VALIDATE_SRS_FILES
    ? process.env.VALIDATE_SRS_FILES.split('\n').filter(Boolean)
    : execSync('git diff --cached --name-only', { encoding: 'utf8' }).split('\n').filter(Boolean);

  const affectsCore = diffFiles.some(f => f.startsWith('server/') || f.startsWith('client/') || f.startsWith('shared/'));
  const srsUpdated = diffFiles.includes('docs/SRS.md');

  if (affectsCore && !srsUpdated) {
    console.error('Changes detected in server, client, or shared directories without corresponding docs/SRS.md update.');
    console.error('Please update docs/SRS.md to reflect the changes.');
    process.exit(1);
  }
} catch (err) {
  console.error('Failed to check files for SRS validation.');
  console.error(err);
  process.exit(1);
}
