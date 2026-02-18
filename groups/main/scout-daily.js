#!/usr/bin/env node

/**
 * Scout Daily Intelligence Gathering
 * Runs at 6 AM IST (00:30 UTC) to gather AI news in Accounting & Finance
 */

const fs = require('fs');
const path = require('path');

// Paths
const SOUL_PATH = '/workspace/group/soul/scout.md';
const MEMORY_PATH = '/workspace/group/memory/scout-memory.md';
const INTEL_DIR = '/workspace/group/intel';
const OUTPUT_FILE = path.join(INTEL_DIR, `daily-intel-${new Date().toISOString().split('T')[0]}.md`);

// Ensure intel directory exists
if (!fs.existsSync(INTEL_DIR)) {
  fs.mkdirSync(INTEL_DIR, { recursive: true });
}

// Log start
console.log('🔍 Scout: Starting daily intelligence gathering...');
console.log(`Date: ${new Date().toISOString()}`);
console.log(`Output: ${OUTPUT_FILE}`);

// Read SOUL and MEMORY for context
let soul = '';
let memory = '';

try {
  soul = fs.readFileSync(SOUL_PATH, 'utf8');
  console.log('✓ Loaded Scout SOUL');
} catch (err) {
  console.error('✗ Failed to load SOUL:', err.message);
  process.exit(1);
}

try {
  memory = fs.readFileSync(MEMORY_PATH, 'utf8');
  console.log('✓ Loaded Scout memory');
} catch (err) {
  console.warn('⚠ No memory file found (first run?)');
  memory = '# Scout Memory\n\n(First run - no history)';
}

// Export context for Claude to use
console.log('\n📋 CONTEXT FOR CLAUDE:');
console.log('='.repeat(60));
console.log('You are Scout. Read your SOUL and MEMORY below:');
console.log('='.repeat(60));
console.log('\n## SCOUT SOUL:\n');
console.log(soul);
console.log('\n## SCOUT MEMORY:\n');
console.log(memory);
console.log('\n='.repeat(60));
console.log('\n📝 YOUR TASK:');
console.log('1. Search web for AI news in Accounting & Finance (past 24 hours)');
console.log('2. Focus on: product launches, funding, tech breakthroughs, regulatory changes, India adoption');
console.log('3. Filter per your SOUL principles (signal over noise)');
console.log('4. Write intel report to:', OUTPUT_FILE);
console.log('5. Use your standard format (Top Signals, Weak Signals, Ignored Today)');
console.log('6. Update memory file with topics covered');
console.log('\n🎯 Remember: Quality over quantity. 3-5 items max. India relevance critical.');
console.log('\n='.repeat(60));

// Signal that script loaded successfully
console.log('\n✅ Scout script initialized. Waiting for Claude execution...\n');
