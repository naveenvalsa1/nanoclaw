#!/usr/bin/env node

/**
 * Dashboard Data Sync Script
 * Automatically syncs scheduled tasks and jobs to dashboard-readable JSON files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OUTPUT_DIR = '/workspace/group';
const TASKS_FILE = path.join(OUTPUT_DIR, 'tasks.json');
const RECURRING_FILE = path.join(OUTPUT_DIR, 'recurring-tasks.json');

// Get scheduled tasks using mcp__nanoclaw__list_tasks
function getScheduledTasks() {
  try {
    // This would normally be called via the MCP tool, but we'll read from the task files directly
    const taskFiles = execSync('find /workspace/project/data/ipc/main/scheduled_tasks -name "*.json" 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();

    if (!taskFiles) {
      console.log('No scheduled task files found');
      return [];
    }

    const tasks = [];
    taskFiles.split('\n').forEach(file => {
      if (file) {
        try {
          const taskData = JSON.parse(fs.readFileSync(file, 'utf8'));
          tasks.push({
            id: path.basename(file, '.json'),
            file: file,
            ...taskData
          });
        } catch (e) {
          console.error(`Error reading task file ${file}:`, e.message);
        }
      }
    });

    return tasks;
  } catch (error) {
    console.error('Error getting scheduled tasks:', error.message);
    return [];
  }
}

// Parse cron expression to human readable
function parseCronToHuman(cron) {
  const parts = cron.split(' ');
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Handle common patterns
  if (cron === '30 0 * * *') return 'Daily at 6:00 AM IST';
  if (cron === '30 0 * * 1') return 'Every Monday at 6:00 AM IST';
  if (cron === '0 6 * * *') return 'Daily at 6:00 AM UTC';
  if (cron === '0 9 * * *') return 'Daily at 9:00 AM UTC';

  if (dayOfWeek !== '*') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `Every ${days[parseInt(dayOfWeek)]} at ${hour}:${minute.padStart(2, '0')}`;
  }

  if (hour === '*' && minute.startsWith('*/')) {
    return `Every ${minute.substring(2)} minutes`;
  }

  if (hour !== '*' && dayOfMonth === '*') {
    return `Daily at ${hour}:${minute.padStart(2, '0')} UTC`;
  }

  return `Cron: ${cron}`;
}

// Calculate next run time from cron
function getNextRunTime(scheduleType, scheduleValue) {
  if (scheduleType === 'cron') {
    // Simple approximation - for accurate calculation, would need a cron parser
    const now = new Date();
    const parts = scheduleValue.split(' ');
    const [minute, hour] = parts;

    if (scheduleValue === '30 0 * * *') {
      // 00:30 UTC = 6:00 AM IST
      const next = new Date(now);
      next.setUTCHours(0, 30, 0, 0);
      if (next < now) next.setDate(next.getDate() + 1);
      return next.toISOString();
    }

    if (scheduleValue === '30 0 * * 1') {
      // Next Monday at 00:30 UTC
      const next = new Date(now);
      const daysUntilMonday = (1 + 7 - next.getDay()) % 7 || 7;
      next.setDate(next.getDate() + daysUntilMonday);
      next.setUTCHours(0, 30, 0, 0);
      return next.toISOString();
    }

    // Default: next occurrence at specified hour/minute
    const next = new Date(now);
    if (hour !== '*') next.setUTCHours(parseInt(hour));
    if (minute !== '*') next.setUTCMinutes(parseInt(minute));
    next.setSeconds(0, 0);
    if (next < now) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }

  if (scheduleType === 'interval') {
    const now = new Date();
    const ms = parseInt(scheduleValue);
    return new Date(now.getTime() + ms).toISOString();
  }

  if (scheduleType === 'once') {
    return scheduleValue;
  }

  return null;
}

// Extract task title from prompt
function extractTaskTitle(prompt) {
  // Try to get first line or first sentence
  const firstLine = prompt.split('\n')[0].trim();
  if (firstLine.length > 0 && firstLine.length < 100) {
    return firstLine;
  }

  // Get first sentence
  const firstSentence = prompt.split('.')[0].trim();
  if (firstSentence.length > 0 && firstSentence.length < 100) {
    return firstSentence;
  }

  // Truncate if too long
  return prompt.substring(0, 80) + (prompt.length > 80 ? '...' : '');
}

// Generate tasks.json (manual tasks + scheduled tasks as backlog)
function generateTasksJson(scheduledTasks) {
  // Load existing manual tasks from localStorage backup if exists
  let existingTasks = [];
  try {
    if (fs.existsSync(TASKS_FILE)) {
      existingTasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    }
  } catch (e) {
    console.log('No existing tasks file');
  }

  // Keep manually added tasks (those without a source_task_id)
  const manualTasks = existingTasks.filter(t => !t.source_task_id);

  // Add scheduled tasks as reference items (not draggable)
  const scheduledTaskItems = scheduledTasks.map(task => ({
    id: `scheduled-${task.id}`,
    source_task_id: task.id,
    title: extractTaskTitle(task.prompt),
    description: `Automated: ${parseCronToHuman(task.schedule_value)}`,
    status: 'progress', // Scheduled tasks are always "in progress"
    priority: 'medium',
    deadline: null,
    timestamp: task.created_at || new Date().toISOString(),
    isScheduled: true,
    scheduleType: task.schedule_type,
    scheduleValue: task.schedule_value,
    nextRun: getNextRunTime(task.schedule_type, task.schedule_value)
  }));

  // Combine manual and scheduled
  const allTasks = [...manualTasks, ...scheduledTaskItems];

  fs.writeFileSync(TASKS_FILE, JSON.stringify(allTasks, null, 2));
  console.log(`✅ Updated ${TASKS_FILE} with ${manualTasks.length} manual + ${scheduledTaskItems.length} scheduled tasks`);

  return allTasks.length;
}

// Generate recurring-tasks.json
function generateRecurringTasksJson(scheduledTasks) {
  const recurringTasks = scheduledTasks.map(task => ({
    id: task.id,
    prompt: extractTaskTitle(task.prompt),
    description: task.prompt.substring(0, 200) + (task.prompt.length > 200 ? '...' : ''),
    schedule_type: task.schedule_type,
    schedule_value: task.schedule_value,
    status: task.paused ? 'paused' : 'active',
    next_run: getNextRunTime(task.schedule_type, task.schedule_value),
    run_count: task.execution_count || 0,
    created_at: task.created_at || new Date().toISOString(),
    last_run: task.last_execution || null
  }));

  fs.writeFileSync(RECURRING_FILE, JSON.stringify(recurringTasks, null, 2));
  console.log(`✅ Updated ${RECURRING_FILE} with ${recurringTasks.length} recurring tasks`);

  return recurringTasks.length;
}

// Main sync function
async function syncDashboardData() {
  console.log('🔄 Syncing dashboard data...\n');

  // Get scheduled tasks
  const scheduledTasks = getScheduledTasks();
  console.log(`Found ${scheduledTasks.length} scheduled tasks\n`);

  // Generate JSON files
  const taskCount = generateTasksJson(scheduledTasks);
  const recurringCount = generateRecurringTasksJson(scheduledTasks);

  console.log(`\n✨ Dashboard sync complete!`);
  console.log(`   Tasks: ${taskCount}`);
  console.log(`   Recurring: ${recurringCount}`);
  console.log(`   Last sync: ${new Date().toISOString()}`);
}

// Run if called directly
if (require.main === module) {
  syncDashboardData().catch(console.error);
}

module.exports = { syncDashboardData };
