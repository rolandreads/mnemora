#!/usr/bin/env node
/**
 * Release automation script for Mnemora
 * Creates git tags, bumps version, and optionally creates GitHub releases
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';

const PROJECT_ROOT = process.cwd();

interface PackageJson {
  version: string;
  [key: string]: unknown;
}

type VersionType = 'major' | 'minor' | 'patch';

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const NC = '\x1b[0m'; // No Color

function printError(message: string): void {
  console.error(`${RED}❌ ${message}${NC}`);
}

function printSuccess(message: string): void {
  console.log(`${GREEN}✅ ${message}${NC}`);
}

function printInfo(message: string): void {
  console.log(`${YELLOW}ℹ️  ${message}${NC}`);
}

function exec(command: string, options?: { cwd?: string; stdio?: 'inherit' | 'pipe' }): string {
  return execSync(command, {
    cwd: options?.cwd ?? PROJECT_ROOT,
    stdio: options?.stdio ?? 'pipe',
    encoding: 'utf-8'
  }).trim();
}

function getCurrentVersion(): string {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8')) as PackageJson;
  return pkg.version;
}

function bumpVersion(versionType: VersionType, currentVersion: string): string {
  const parts = currentVersion.split('.').map(Number);
  const [major, minor, patch] = parts;
  
  switch (versionType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid version type: ${versionType}`);
  }
}

function validateVersion(version: string): void {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid version format: ${version}. Expected format: X.Y.Z`);
  }
}

function checkGitClean(): void {
  try {
    // Use git status --porcelain which is the standard way to check for a clean working directory
    // It returns empty string if clean, or non-empty if there are changes
    const status = exec('git status --porcelain', { stdio: 'pipe' });
    if (status.trim()) {
      throw new Error('Working directory is not clean. Please commit or stash changes first.');
    }
  } catch (error) {
    // If exec throws (e.g., not a git repo), re-throw with a clearer message
    if (error instanceof Error && !error.message.includes('Working directory')) {
      throw new Error('Working directory is not clean. Please commit or stash changes first.');
    }
    throw error;
  }
}

function getCommits(): Array<{ hash: string; message: string }> {
  let previousTag: string;
  try {
    previousTag = exec('git describe --tags --abbrev=0');
  } catch {
    previousTag = '';
  }
  
  let commitOutput: string;
  if (!previousTag) {
    commitOutput = exec('git log --pretty=format:"%h|%s" --reverse');
  } else {
    commitOutput = exec(`git log --pretty=format:"%h|%s" ${previousTag}..HEAD`);
  }
  
  return commitOutput
    .split('\n')
    .filter(line => line.trim() && !line.includes('chore: bump version'))
    .map(line => {
      const [hash, ...messageParts] = line.split('|');
      return {
        hash: hash || '',
        message: messageParts.join('|') || ''
      };
    })
    .filter(commit => commit.hash && commit.message);
}

function categorizeCommit(message: string): string {
  if (/^feat(\(.+\))?:/.test(message)) {
    return 'features';
  }
  if (/^fix(\(.+\))?:/.test(message)) {
    return 'fixes';
  }
  if (/^refactor(\(.+\))?:/.test(message)) {
    return 'refactor';
  }
  if (/^perf(\(.+\))?:/.test(message)) {
    return 'performance';
  }
  if (/^docs(\(.+\))?:/.test(message)) {
    return 'documentation';
  }
  if (/^build(\(.+\))?:/.test(message)) {
    return 'build';
  }
  if (/^chore(\(.+\))?:/.test(message)) {
    return 'chores';
  }
  return 'other';
}

function formatCommitMessage(message: string): string {
  // Remove conventional commit prefix
  const cleaned = message.replace(/^[a-z]+(\([^)]+\))?: /, '');
  // Capitalize first letter
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function generateReleaseNotes(version: string): string {
  const commits = getCommits();
  const categories: Record<string, string[]> = {};
  
  const categoryLabels: Record<string, string> = {
    features: '✨ Features',
    fixes: '🐛 Bug Fixes',
    refactor: '♻️  Refactoring',
    performance: '⚡ Performance',
    documentation: '📝 Documentation',
    build: '🔨 Build',
    chores: '🔧 Chores',
    other: '📦 Other Changes'
  };
  
  for (const commit of commits) {
    const category = categorizeCommit(commit.message);
    const formatted = formatCommitMessage(commit.message);
    
    if (!categories[category]) {
      categories[category] = [];
    }
    
    categories[category].push(`- ${formatted} (${commit.hash})`);
  }
  
  let notes = '## What\'s Changed\n\n';
  let hasChanges = false;
  
  const categoryOrder = ['features', 'fixes', 'refactor', 'performance', 'documentation', 'build', 'chores', 'other'];
  
  for (const category of categoryOrder) {
    if (categories[category] && categories[category].length > 0) {
      hasChanges = true;
      notes += `### ${categoryLabels[category]}\n\n`;
      notes += `${categories[category].join('\n')}\n\n`;
    }
  }
  
  if (!hasChanges) {
    notes += 'No significant changes in this release.\n\n';
  }
  
  let previousTag: string;
  try {
    previousTag = exec('git describe --tags --abbrev=0');
  } catch {
    previousTag = '';
  }
  
  if (previousTag) {
    notes += `**Full Changelog**: ${previousTag}...v${version}`;
  } else {
    notes += `**Full Changelog**: v${version}`;
  }
  
  return notes;
}

function updateChangelog(version: string, releaseNotes: string): void {
  const changelogPath = join(PROJECT_ROOT, 'CHANGELOG.md');
  const header = `## [${version}] - ${new Date().toISOString().split('T')[0]}`;
  const newEntry = `${header}\n\n${releaseNotes.trim()}\n`;
  
  if (!existsSync(changelogPath)) {
    const content = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial changelog

---

${newEntry}`;
    writeFileSync(changelogPath, content, 'utf-8');
    return;
  }
  
  const existing = readFileSync(changelogPath, 'utf-8');
  const lines = existing.split('\n');
  const newLines: string[] = [];
  let foundUnreleased = false;
  let inserted = false;
  let i = 0;
  
  // Find and copy lines until we reach the Unreleased section
  for (i = 0; i < lines.length; i++) {
    const line = lines[i];
    newLines.push(line);
    
    if (/^## \[Unreleased\]/.test(line)) {
      foundUnreleased = true;
      break;
    }
  }
  
  if (foundUnreleased) {
    // Continue through Unreleased section until we find a version entry
    i++;
    while (i < lines.length) {
      const line = lines[i];
      
      // Check if we hit the next version entry (format: ## [X.Y.Z])
      if (/^## \[\d+\.\d+\.\d+\]/.test(line)) {
        // Insert new version before this one
        newLines.push('');
        newLines.push('---');
        newLines.push(...newEntry.split('\n'));
        inserted = true;
        break;
      }
      
      // Check if we hit a separator (---)
      if (/^---/.test(line)) {
        // Insert new version before separator
        newLines.push('');
        newLines.push('---');
        newLines.push(...newEntry.split('\n'));
        inserted = true;
        break;
      }
      
      newLines.push(line);
      i++;
    }
    
    // Copy remaining lines if any
    if (i < lines.length) {
      for (let j = i; j < lines.length; j++) {
        newLines.push(lines[j]);
      }
    } else if (!inserted) {
      // Reached end without finding a version, append
      newLines.push('');
      newLines.push('---');
      newLines.push(...newEntry.split('\n'));
      inserted = true;
    }
  } else {
    // No Unreleased section found, prepend it
    const headerLines = [
      '# Changelog',
      '',
      'All notable changes to this project will be documented in this file.',
      '',
      'The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),',
      'and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).',
      '',
      '## [Unreleased]',
      '',
      '### Added',
      '- Initial changelog',
      '',
      '---',
      '',
      ...newEntry.split('\n'),
      ''
    ];
    const allLines = headerLines.concat(newLines);
    writeFileSync(changelogPath, allLines.join('\n'), 'utf-8');
    return;
  }
  
  writeFileSync(changelogPath, newLines.join('\n'), 'utf-8');
}

async function createGitHubRelease(tag: string, releaseNotes: string): Promise<void> {
  try {
    exec('which gh');
  } catch {
    printInfo('GitHub CLI (gh) not found. Skipping GitHub release creation.');
    printInfo('Install with: brew install gh');
    try {
      const remoteUrl = exec('git config --get remote.origin.url');
      const repoMatch = remoteUrl.match(/github\.com[:/](.+)\.git/);
      if (repoMatch) {
        printInfo(`You can create the release manually at: https://github.com/${repoMatch[1]}/releases/new`);
      }
    } catch {
      // Ignore errors
    }
    return;
  }
  
  // Check if gh is authenticated
  try {
    exec('gh auth status');
  } catch {
    printInfo('GitHub CLI not authenticated. Skipping GitHub release creation.');
    printInfo('Run: gh auth login');
    return;
  }
  
  printInfo('Creating GitHub release...');
  
  // Create temporary file for release notes
  const notesFile = join(tmpdir(), `release-notes-${Date.now()}.txt`);
  
  try {
    writeFileSync(notesFile, releaseNotes, 'utf-8');
    exec(`gh release create "${tag}" --title "${tag}" --notes-file "${notesFile}"`);
    printSuccess(`GitHub release created: ${tag}`);
  } catch (error) {
    printError('Failed to create GitHub release');
    throw error;
  } finally {
    try {
      unlinkSync(notesFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

function question(query: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(query, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function release(versionType?: VersionType, specificVersion?: string): Promise<void> {
  console.log('==========================================');
  console.log('Mnemora Release');
  console.log('==========================================');
  console.log('');
  
  // Determine target version
  let targetVersion: string;
  if (specificVersion) {
    targetVersion = specificVersion;
    validateVersion(targetVersion);
  } else {
    if (!versionType) {
      printError('Please specify version type (major/minor/patch) or specific version');
      console.log('');
      console.log('Usage:');
      console.log('  tsx src/scripts/release.ts patch|minor|major');
      console.log('  tsx src/scripts/release.ts version 1.2.3');
      process.exit(1);
    }
    const currentVersion = getCurrentVersion();
    targetVersion = bumpVersion(versionType, currentVersion);
  }
  
  const currentVersion = getCurrentVersion();
  const tag = `v${targetVersion}`;
  
  console.log(`Current version: ${currentVersion}`);
  console.log(`Target version:  ${targetVersion}`);
  console.log(`Tag:            ${tag}`);
  console.log('');
  
  // Check prerequisites
  printInfo('Checking prerequisites...');
  
  // Check git
  try {
    exec('which git');
  } catch {
    printError('Git not installed');
    process.exit(1);
  }
  printSuccess('Git installed');
  
  // Check if we're in a git repo
  try {
    exec('git rev-parse --git-dir');
  } catch {
    printError('Not a git repository');
    process.exit(1);
  }
  
  // Check if working directory is clean
  try {
    checkGitClean();
    printSuccess('Working directory is clean');
  } catch (error) {
    printError(error instanceof Error ? error.message : 'Working directory is not clean');
    process.exit(1);
  }
  
  // Check if tag already exists
  try {
    exec(`git rev-parse "${tag}"`);
    printError(`Tag ${tag} already exists`);
    process.exit(1);
  } catch {
    // Tag doesn't exist, continue
  }
  
  // Check if we're on main/master branch
  const currentBranch = exec('git branch --show-current');
  if (currentBranch !== 'main' && currentBranch !== 'master') {
    printInfo(`Warning: Not on main/master branch (currently on: ${currentBranch})`);
    const answer = await question('Continue anyway? (y/N) ');
    if (!/^[Yy]$/.test(answer)) {
      process.exit(1);
    }
  }
  
  // Generate structured release notes
  printInfo('Generating release notes...');
  const releaseNotes = generateReleaseNotes(targetVersion);
  if (!releaseNotes) {
    printError('Failed to generate release notes');
    process.exit(1);
  }
  printSuccess('Release notes generated');
  
  // Update CHANGELOG.md
  printInfo('Updating CHANGELOG.md...');
  try {
    updateChangelog(targetVersion, releaseNotes);
    printSuccess('Updated CHANGELOG.md');
  } catch (error) {
    printError(`Failed to update CHANGELOG.md: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
  
  // Update package.json version
  printInfo('Updating package.json version...');
  try {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8')) as PackageJson;
    pkg.version = targetVersion;
    writeFileSync(join(PROJECT_ROOT, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
    printSuccess('Version updated in package.json');
  } catch (error) {
    printError(`Failed to update package.json: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
  
  // Commit version bump and changelog
  printInfo('Committing version bump and changelog...');
  try {
    exec('git add package.json CHANGELOG.md', { stdio: 'pipe' });
  } catch {
    try {
      exec('git add package.json', { stdio: 'pipe' });
    } catch {
      // Ignore errors
    }
  }
  try {
    exec(`git commit -m "chore: bump version to ${targetVersion}"`);
    printSuccess('Version bump and changelog committed');
  } catch (error) {
    printError(`Failed to commit version bump: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
  
  // Create git tag
  printInfo('Creating git tag...');
  try {
    // Use a temporary file for the tag message to handle multi-line release notes
    const tagMessageFile = join(tmpdir(), `tag-message-${Date.now()}.txt`);
    const tagMessage = `Release ${tag}\n\n${releaseNotes}`;
    
    try {
      writeFileSync(tagMessageFile, tagMessage, 'utf-8');
      exec(`git tag -a "${tag}" -F "${tagMessageFile}"`);
      printSuccess(`Git tag created: ${tag}`);
    } finally {
      try {
        unlinkSync(tagMessageFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    printError(`Failed to create git tag: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
  
  // Push commits and tags
  printInfo('Pushing to remote...');
  try {
    exec('git push');
    exec(`git push origin "${tag}"`);
    printSuccess('Pushed to remote');
  } catch (error) {
    printError(`Failed to push: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
  
  // Create GitHub release
  console.log('');
  await createGitHubRelease(tag, releaseNotes);
  
  console.log('');
  console.log('==========================================');
  printSuccess(`RELEASE COMPLETE: ${tag}`);
  console.log('==========================================');
  console.log('');
  try {
    const remoteUrl = exec('git config --get remote.origin.url');
    const repoMatch = remoteUrl.match(/github\.com[:/](.+)\.git/);
    if (repoMatch) {
      console.log('Next steps:');
      console.log(`1. Review the release at: https://github.com/${repoMatch[1]}/releases/tag/${tag}`);
      console.log('2. Deploy to production: yarn deploy');
    }
  } catch {
    // Ignore errors
  }
  console.log('');
}

// Parse arguments
const args = process.argv.slice(2);
if (args[0] === 'version') {
  if (!args[1]) {
    printError('Please specify a version number');
    process.exit(1);
  }
  release(undefined, args[1]).catch(error => {
    printError(`Release failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  });
} else {
  const versionType = args[0] as VersionType | undefined;
  if (versionType && !['major', 'minor', 'patch'].includes(versionType)) {
    printError(`Invalid version type: ${versionType}. Use major, minor, or patch.`);
    process.exit(1);
  }
  release(versionType).catch(error => {
    printError(`Release failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  });
}

