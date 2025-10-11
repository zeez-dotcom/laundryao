#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_SERVER_DIR = path.join(ROOT_DIR, 'dist', 'server');

const SKIP_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.node']);

if (!fs.existsSync(DIST_SERVER_DIR)) {
  process.exit(0);
}

async function processDirectory(directory) {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await processDirectory(entryPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      await processFile(entryPath);
    }
  }
}

function ensureExtension(specifier, fileDirectory) {
  if (SKIP_EXTENSIONS.has(path.extname(specifier))) {
    return specifier;
  }

  const absoluteTarget = path.resolve(fileDirectory, specifier);
  const directFile = `${absoluteTarget}.js`;

  if (fs.existsSync(directFile)) {
    return `${specifier}.js`;
  }

  const indexFile = path.join(absoluteTarget, 'index.js');

  if (fs.existsSync(indexFile)) {
    return `${specifier}/index.js`;
  }

  return specifier;
}

async function processFile(filePath) {
  const fileDirectory = path.dirname(filePath);
  let content = await fs.promises.readFile(filePath, 'utf8');
  let updated = false;

  const replacers = [
    {
      regex: /from\s+['"](\.\.?[^'"]*)['"]/g,
    },
    {
      regex: /import\s*\(\s*['"](\.\.?[^'"]*)['"]\s*\)/g,
    },
  ];

  for (const { regex } of replacers) {
    content = content.replace(regex, (match, specifier) => {
      const nextSpecifier = ensureExtension(specifier, fileDirectory);

      if (nextSpecifier !== specifier) {
        updated = true;
        return match.replace(specifier, nextSpecifier);
      }

      return match;
    });
  }

  if (updated) {
    await fs.promises.writeFile(filePath, content, 'utf8');
  }
}

processDirectory(DIST_SERVER_DIR).catch((error) => {
  console.error('[fix-esm-imports] Failed to update compiled output:', error);
  process.exit(1);
});
