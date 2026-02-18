/**
 * Host-side dashboard data generator.
 * Reads from SQLite and writes JSON files to the group folder
 * for the dashboard HTML to consume.
 */
import fs from 'fs';
import path from 'path';

import { GROUPS_DIR } from './config.js';
import {
  getAllGoals,
  getAllTasks,
  getAllHelpRequests,
  getGoalsForGroup,
  getProjectsForGroup,
  getTasksForGroup,
} from './db.js';
import { Goal, HelpRequest, Project, ScheduledTask } from './types.js';

export function writeDashboardData(groupFolder: string): void {
  const groupDir = path.join(GROUPS_DIR, groupFolder);
  if (!fs.existsSync(groupDir)) {
    fs.mkdirSync(groupDir, { recursive: true });
  }

  const projects = getProjectsForGroup(groupFolder);
  const goals = getGoalsForGroup(groupFolder);
  const tasks = getTasksForGroup(groupFolder);

  const helpRequests = getAllHelpRequests();

  writeProjectsJson(groupDir, projects, goals, tasks);
  writeGoalsJson(groupDir, goals, tasks);
  writeRecurringTasksJson(groupDir, tasks);
  writeActivityFeedJson(groupDir, projects, goals, tasks);
  writeRequestsJson(groupDir, helpRequests);
}

function writeProjectsJson(
  groupDir: string,
  projects: Project[],
  goals: Goal[],
  tasks: ScheduledTask[],
): void {
  const projectsWithHierarchy = projects.map((p) => {
    const projectGoals = goals.filter((g) => g.project_id === p.id);
    return {
      ...p,
      goals: projectGoals.map((g) => {
        const goalTasks = tasks
          .filter((t) => t.goal_id === g.id && !t.parent_task_id)
          .map((t) => ({
            id: t.id,
            prompt: t.prompt,
            schedule_type: t.schedule_type,
            schedule_value: t.schedule_value,
            status: t.status,
            next_run: t.next_run,
            last_run: t.last_run,
            last_result: t.last_result,
            subtasks: tasks
              .filter((st) => st.parent_task_id === t.id)
              .map((st) => ({
                id: st.id,
                prompt: st.prompt,
                schedule_type: st.schedule_type,
                schedule_value: st.schedule_value,
                status: st.status,
                next_run: st.next_run,
                last_run: st.last_run,
                last_result: st.last_result,
              })),
          }));
        return {
          ...g,
          tasks: goalTasks,
        };
      }),
    };
  });

  // Include orphaned goals (no project_id)
  const orphanedGoals = goals
    .filter((g) => !g.project_id)
    .map((g) => ({
      ...g,
      tasks: tasks
        .filter((t) => t.goal_id === g.id && !t.parent_task_id)
        .map((t) => ({
          id: t.id,
          prompt: t.prompt,
          schedule_type: t.schedule_type,
          schedule_value: t.schedule_value,
          status: t.status,
          next_run: t.next_run,
          last_run: t.last_run,
          last_result: t.last_result,
          subtasks: tasks
            .filter((st) => st.parent_task_id === t.id)
            .map((st) => ({
              id: st.id,
              prompt: st.prompt,
              schedule_type: st.schedule_type,
              schedule_value: st.schedule_value,
              status: st.status,
              next_run: st.next_run,
              last_run: st.last_run,
              last_result: st.last_result,
            })),
        })),
    }));

  fs.writeFileSync(
    path.join(groupDir, 'projects.json'),
    JSON.stringify(
      {
        projects: projectsWithHierarchy,
        orphanedGoals,
      },
      null,
      2,
    ),
  );
}

function writeGoalsJson(
  groupDir: string,
  goals: Goal[],
  tasks: ScheduledTask[],
): void {
  const goalsWithTasks = goals.map((g) => ({
    ...g,
    tasks: tasks
      .filter((t) => t.goal_id === g.id)
      .map((t) => ({
        id: t.id,
        prompt: t.prompt,
        schedule_type: t.schedule_type,
        schedule_value: t.schedule_value,
        status: t.status,
        next_run: t.next_run,
        last_run: t.last_run,
        last_result: t.last_result,
      })),
  }));
  fs.writeFileSync(
    path.join(groupDir, 'goals.json'),
    JSON.stringify(goalsWithTasks, null, 2),
  );
}

function writeRecurringTasksJson(
  groupDir: string,
  tasks: ScheduledTask[],
): void {
  const recurring = tasks.filter(
    (t) => t.schedule_type !== 'once' && t.status === 'active',
  );
  const formatted = recurring.map((t) => ({
    id: t.id,
    prompt: t.prompt,
    schedule_type: t.schedule_type,
    schedule_value: t.schedule_value,
    status: t.status,
    next_run: t.next_run,
    last_run: t.last_run,
    last_result: t.last_result,
    created_at: t.created_at,
    goal_id: t.goal_id,
  }));
  fs.writeFileSync(
    path.join(groupDir, 'recurring-tasks.json'),
    JSON.stringify(formatted, null, 2),
  );
}

function writeActivityFeedJson(
  groupDir: string,
  projects: Project[],
  goals: Goal[],
  tasks: ScheduledTask[],
): void {
  const feed: Array<{
    type: string;
    timestamp: string;
    title: string;
    details: string;
  }> = [];

  // Project events
  for (const project of projects) {
    feed.push({
      type: 'project_created',
      timestamp: project.created_at,
      title: `Project created: ${project.name}`,
      details: project.description ? project.description.slice(0, 100) : '',
    });
    if (project.status === 'completed') {
      feed.push({
        type: 'project_completed',
        timestamp: project.updated_at,
        title: `Project completed: ${project.name}`,
        details: 'Marked as completed',
      });
    }
  }

  // Goal events
  for (const goal of goals) {
    feed.push({
      type: 'goal_created',
      timestamp: goal.created_at,
      title: `Goal created: ${goal.title}`,
      details: goal.description ? goal.description.slice(0, 100) : '',
    });
    if (goal.completed_at) {
      feed.push({
        type: 'goal_completed',
        timestamp: goal.completed_at,
        title: `Goal completed: ${goal.title}`,
        details: `Marked as ${goal.status}`,
      });
    }
  }

  // Task events
  for (const task of tasks) {
    if (task.created_at) {
      feed.push({
        type: 'task_created',
        timestamp: task.created_at,
        title: `Task created: ${task.prompt.slice(0, 60)}`,
        details: task.schedule_type === 'once' ? 'One-time task' : `Recurring (${task.schedule_type})`,
      });
    }
    if (task.last_run) {
      feed.push({
        type: 'recurring_run',
        timestamp: task.last_run,
        title: `Task ran: ${task.prompt.slice(0, 60)}`,
        details: task.last_result ? task.last_result.slice(0, 100) : 'Completed',
      });
    }
  }

  // Read existing call transcripts if present
  const transcriptsDir = path.join(groupDir, 'call-transcripts');
  try {
    if (fs.existsSync(transcriptsDir)) {
      const files = fs
        .readdirSync(transcriptsDir)
        .filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const transcript = JSON.parse(
            fs.readFileSync(path.join(transcriptsDir, file), 'utf-8'),
          );
          feed.push({
            type: 'call',
            timestamp: transcript.startTime || transcript.endTime || new Date().toISOString(),
            title: `Phone call${transcript.duration ? ` (${transcript.duration})` : ''}`,
            details: transcript.purpose
              ? transcript.purpose.slice(0, 120)
              : 'Voice call',
          });
        } catch {
          // Skip malformed transcripts
        }
      }
    }
  } catch {
    // transcripts dir may not exist
  }

  // Sort by timestamp descending
  feed.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  fs.writeFileSync(
    path.join(groupDir, 'activity-feed.json'),
    JSON.stringify(feed, null, 2),
  );
}

function writeRequestsJson(
  groupDir: string,
  helpRequests: HelpRequest[],
): void {
  fs.writeFileSync(
    path.join(groupDir, 'requests.json'),
    JSON.stringify(helpRequests, null, 2),
  );
}
