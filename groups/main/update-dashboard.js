#!/usr/bin/env node

/**
 * Dashboard Data Updater
 * Generates tasks.json and recurring-tasks.json for the dashboard
 * Run this after creating/modifying scheduled tasks
 */

const fs = require('fs');
const path = require('path');

// Hardcoded scheduled tasks (will be updated manually or via automation)
const SCHEDULED_TASKS = [
  {
    id: 'task-1770782585316-petyhy',
    prompt: 'Daily AI in Accounting & Finance News Digest',
    description: 'Search the web for the latest AI news in Accounting & Finance, compile email and WhatsApp summary',
    schedule_type: 'cron',
    schedule_value: '30 0 * * *',
    status: 'active',
    created_at: '2026-02-11T04:30:00.000Z',
    run_count: 1
  },
  {
    id: 'task-1770782601351-sjam2f',
    prompt: 'Weekly Competitor Intelligence Report for Zournal',
    description: 'Monitor 11 competitors, compile comprehensive email report and WhatsApp summary',
    schedule_type: 'cron',
    schedule_value: '30 0 * * 1',
    status: 'active',
    created_at: '2026-02-10T09:51:00.000Z',
    run_count: 0
  }
];

function parseCronToHuman(cron) {
  if (cron === '30 0 * * *') return 'Daily at 6:00 AM IST';
  if (cron === '30 0 * * 1') return 'Every Monday at 6:00 AM IST';
  if (cron === '0 6 * * *') return 'Daily at 6:00 AM UTC';
  if (cron === '0 9 * * *') return 'Daily at 9:00 AM UTC';

  const parts = cron.split(' ');
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (dayOfWeek !== '*' && dayOfWeek !== '?') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `Every ${days[parseInt(dayOfWeek)]} at ${hour}:${minute.padStart(2, '0')} UTC`;
  }

  if (hour !== '*' && dayOfMonth === '*') {
    return `Daily at ${hour}:${minute.padStart(2, '0')} UTC`;
  }

  return `Cron: ${cron}`;
}

function getNextRunTime(scheduleType, scheduleValue) {
  const now = new Date();

  if (scheduleType === 'cron') {
    const parts = scheduleValue.split(' ');
    const [minute, hour, , , dayOfWeek] = parts;

    if (scheduleValue === '30 0 * * *') {
      // Daily at 00:30 UTC (6:00 AM IST)
      const next = new Date(now);
      next.setUTCHours(0, 30, 0, 0);
      if (next < now) next.setUTCDate(next.getUTCDate() + 1);
      return next.toISOString();
    }

    if (scheduleValue === '30 0 * * 1') {
      // Every Monday at 00:30 UTC
      const next = new Date(now);
      const currentDay = next.getUTCDay();
      const daysUntilMonday = currentDay === 0 ? 1 : (8 - currentDay) % 7;
      next.setUTCDate(next.getUTCDate() + daysUntilMonday);
      next.setUTCHours(0, 30, 0, 0);
      if (next < now && daysUntilMonday === 1) {
        next.setUTCDate(next.getUTCDate() + 7);
      }
      return next.toISOString();
    }

    // Default calculation
    const next = new Date(now);
    if (hour !== '*') next.setUTCHours(parseInt(hour));
    if (minute !== '*') next.setUTCMinutes(parseInt(minute));
    next.setUTCSeconds(0, 0);
    if (next < now) next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString();
  }

  return now.toISOString();
}

// Generate tasks.json
function generateTasksJson() {
  const OUTPUT_FILE = '/workspace/group/tasks.json';

  // Load existing manually-added tasks
  let existingTasks = [];
  try {
    if (fs.existsSync(OUTPUT_FILE)) {
      const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      existingTasks = data.filter(t => !t.isScheduled); // Keep only manual tasks
    }
  } catch (e) {
    console.log('No existing tasks file, creating new one');
  }

  // Add scheduled tasks
  const scheduledTaskItems = SCHEDULED_TASKS.map(task => ({
    id: Date.now() + Math.random(), // Unique ID
    source_task_id: task.id,
    title: task.prompt,
    description: `🔄 Automated: ${parseCronToHuman(task.schedule_value)}`,
    status: 'progress',
    priority: 'high',
    deadline: null,
    timestamp: task.created_at,
    isScheduled: true,
    scheduleType: task.schedule_type,
    scheduleValue: task.schedule_value,
    nextRun: getNextRunTime(task.schedule_type, task.schedule_value)
  }));

  const allTasks = [...existingTasks, ...scheduledTaskItems];
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allTasks, null, 2));

  console.log(`✅ Generated ${OUTPUT_FILE}`);
  console.log(`   - ${existingTasks.length} manual tasks`);
  console.log(`   - ${scheduledTaskItems.length} scheduled tasks`);

  return allTasks.length;
}

// Generate recurring-tasks.json
function generateRecurringTasksJson() {
  const OUTPUT_FILE = '/workspace/group/recurring-tasks.json';

  const recurringTasks = SCHEDULED_TASKS.map(task => ({
    id: task.id,
    prompt: task.prompt,
    description: task.description,
    schedule_type: task.schedule_type,
    schedule_value: task.schedule_value,
    status: task.status || 'active',
    next_run: getNextRunTime(task.schedule_type, task.schedule_value),
    run_count: task.run_count || 0,
    created_at: task.created_at,
    last_run: task.last_run || null
  }));

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(recurringTasks, null, 2));

  console.log(`✅ Generated ${OUTPUT_FILE}`);
  console.log(`   - ${recurringTasks.length} recurring tasks`);

  return recurringTasks.length;
}

// Generate activity-feed.json
function generateActivityFeedJson() {
  const OUTPUT_FILE = '/workspace/group/activity-feed.json';
  const TASKS_FILE = '/workspace/group/tasks.json';
  const TRANSCRIPTS_DIR = '/workspace/group/call-transcripts';

  const feed = [];

  // Extract task status change events from tasks.json
  try {
    if (fs.existsSync(TASKS_FILE)) {
      const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
      tasks.forEach(task => {
        // Task created
        if (task.timestamp) {
          feed.push({
            type: 'task_created',
            timestamp: task.timestamp,
            title: `Task created: ${task.title}`,
            details: task.description ? task.description.substring(0, 100) : ''
          });
        }
        // Task started
        if (task.startedAt) {
          feed.push({
            type: 'task_started',
            timestamp: task.startedAt,
            title: `Task started: ${task.title}`,
            details: `Moved to In Progress`
          });
        }
        // Task completed
        if (task.completedAt) {
          feed.push({
            type: 'task_completed',
            timestamp: task.completedAt,
            title: `Task completed: ${task.title}`,
            details: `Marked as done`
          });
        }
      });
    }
  } catch (e) {
    console.log('Could not read tasks for activity feed:', e.message);
  }

  // Extract call transcript events
  try {
    if (fs.existsSync(TRANSCRIPTS_DIR)) {
      const files = fs.readdirSync(TRANSCRIPTS_DIR).filter(f => f.endsWith('.json'));
      files.forEach(file => {
        try {
          const transcript = JSON.parse(fs.readFileSync(path.join(TRANSCRIPTS_DIR, file), 'utf8'));
          feed.push({
            type: 'call',
            timestamp: transcript.startTime || transcript.endTime,
            title: `Phone call${transcript.duration ? ` (${transcript.duration})` : ''}`,
            details: transcript.purpose ? transcript.purpose.substring(0, 120) : 'Voice call'
          });
        } catch (e) {
          // Skip malformed transcripts
        }
      });
    }
  } catch (e) {
    console.log('Could not read call transcripts:', e.message);
  }

  // Add recurring task run events from SCHEDULED_TASKS
  SCHEDULED_TASKS.forEach(task => {
    if (task.run_count > 0 && task.created_at) {
      feed.push({
        type: 'recurring_run',
        timestamp: task.created_at,
        title: `Recurring task ran: ${task.prompt}`,
        details: `${task.run_count} run(s) completed`
      });
    }
  });

  // Sort by timestamp descending (newest first)
  feed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(feed, null, 2));

  console.log(`✅ Generated ${OUTPUT_FILE}`);
  console.log(`   - ${feed.length} activity entries`);

  return feed.length;
}

// Main
function main() {
  console.log('🔄 Updating dashboard data...\n');

  const taskCount = generateTasksJson();
  const recurringCount = generateRecurringTasksJson();
  const activityCount = generateActivityFeedJson();

  console.log(`\n✨ Dashboard updated!`);
  console.log(`   Total tasks: ${taskCount}`);
  console.log(`   Recurring tasks: ${recurringCount}`);
  console.log(`   Activity entries: ${activityCount}`);
  console.log(`   Last updated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
}

if (require.main === module) {
  main();
}

module.exports = { generateTasksJson, generateRecurringTasksJson, generateActivityFeedJson, SCHEDULED_TASKS };
