import http from 'http';

import fs from 'fs';
import path from 'path';
import { API_PORT, GROUPS_DIR, MAIN_GROUP_FOLDER, TIMEZONE } from './config.js';
import { CronExpressionParser } from 'cron-parser';

import {
  createGoal,
  createProject,
  createTask,
  deleteProject,
  getAllGoals,
  getAllHelpRequests,
  getHelpRequestById,
  getProjectById,
  getProjectsForGroup,
  getTasksForGoal,
  updateHelpRequest,
  updateProject,
  updateTask,
} from './db.js';
import { writeDashboardData } from './dashboard-writer.js';
import { RegisteredGroup } from './types.js';
import { logger } from './logger.js';

interface ApiDeps {
  registeredGroups: () => Record<string, RegisteredGroup>;
  writeGoalsSnapshotForGroup: (groupFolder: string, isMain: boolean) => void;
}

let server: http.Server | null = null;

function setCors(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_BODY = 1024 * 64; // 64 KB
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function findMainGroupJid(
  groups: Record<string, RegisteredGroup>,
): string | null {
  for (const [jid, group] of Object.entries(groups)) {
    if (group.folder === MAIN_GROUP_FOLDER) return jid;
  }
  return null;
}

export function startApiServer(deps: ApiDeps): void {
  if (server) {
    logger.debug('API server already running, skipping duplicate start');
    return;
  }

  server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${API_PORT}`);
    const method = req.method?.toUpperCase() || 'GET';

    // CORS preflight
    if (method === 'OPTIONS') {
      setCors(res);
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (url.pathname === '/projects' && method === 'GET') {
        handleGetProjects(res);
      } else if (url.pathname === '/projects' && method === 'POST') {
        await handlePostProject(req, res, deps);
      } else if (url.pathname.match(/^\/projects\/[^/]+$/) && method === 'PUT') {
        const projectId = decodeURIComponent(url.pathname.split('/')[2]);
        await handlePutProject(req, res, projectId);
      } else if (url.pathname.match(/^\/projects\/[^/]+$/) && method === 'DELETE') {
        const projectId = decodeURIComponent(url.pathname.split('/')[2]);
        handleDeleteProject(res, projectId);
      } else if (url.pathname === '/goals' && method === 'POST') {
        await handlePostGoal(req, res, deps);
      } else if (url.pathname === '/goals' && method === 'GET') {
        handleGetGoals(res);
      } else if (url.pathname === '/requests' && method === 'GET') {
        handleGetRequests(res);
      } else if (url.pathname.match(/^\/requests\/[^/]+\/respond$/) && method === 'POST') {
        const requestId = url.pathname.split('/')[2];
        await handleRespondToRequest(req, res, requestId);
      } else {
        json(res, 404, { error: 'Not found' });
      }
    } catch (err) {
      logger.error({ err }, 'API request error');
      json(res, 500, { error: 'Internal server error' });
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn({ port: API_PORT }, 'API port already in use, skipping (likely reconnect)');
      server = null;
    } else {
      logger.error({ err }, 'API server error');
    }
  });

  server.listen(API_PORT, () => {
    logger.info({ port: API_PORT }, 'API server started');
  });
}

export function stopApiServer(): void {
  if (server) {
    server.close();
    server = null;
    logger.info('API server stopped');
  }
}

async function handlePostProject(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: ApiDeps,
): Promise<void> {
  const raw = await readBody(req);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    json(res, 400, { error: 'Invalid JSON' });
    return;
  }

  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    json(res, 400, { error: 'name is required' });
    return;
  }

  const now = new Date().toISOString();
  const slug = (data.name as string)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const projectId = `proj-${slug}`;
  const description =
    typeof data.description === 'string' ? data.description.trim() || null : null;

  createProject({
    id: projectId,
    group_folder: MAIN_GROUP_FOLDER,
    name: (data.name as string).trim(),
    description,
    status: 'active',
    created_at: now,
    updated_at: now,
  });

  // Refresh dashboard data
  writeDashboardData(MAIN_GROUP_FOLDER);

  json(res, 201, { id: projectId, name: (data.name as string).trim() });
}

async function handlePutProject(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  projectId: string,
): Promise<void> {
  const existing = getProjectById(projectId);
  if (!existing) {
    json(res, 404, { error: 'Project not found' });
    return;
  }

  const raw = await readBody(req);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    json(res, 400, { error: 'Invalid JSON' });
    return;
  }

  const updates: { name?: string; description?: string; status?: string } = {};
  if (typeof data.name === 'string' && data.name.trim()) updates.name = data.name.trim();
  if (typeof data.description === 'string') updates.description = data.description.trim() || null as unknown as string;
  if (typeof data.status === 'string' && ['active', 'paused', 'completed', 'archived'].includes(data.status)) {
    updates.status = data.status;
  }

  if (Object.keys(updates).length === 0) {
    json(res, 400, { error: 'No valid fields to update' });
    return;
  }

  updateProject(projectId, updates as Parameters<typeof updateProject>[1]);
  writeDashboardData(MAIN_GROUP_FOLDER);
  json(res, 200, { id: projectId, ...updates });
}

function handleDeleteProject(
  res: http.ServerResponse,
  projectId: string,
): void {
  const existing = getProjectById(projectId);
  if (!existing) {
    json(res, 404, { error: 'Project not found' });
    return;
  }

  deleteProject(projectId);
  writeDashboardData(MAIN_GROUP_FOLDER);
  json(res, 200, { deleted: projectId });
}

async function handlePostGoal(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: ApiDeps,
): Promise<void> {
  const body = await readBody(req);
  let data: {
    title?: string;
    description?: string;
    priority?: string;
    deadline?: string;
    project_id?: string;
  };
  try {
    data = JSON.parse(body);
  } catch {
    json(res, 400, { error: 'Invalid JSON' });
    return;
  }

  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
    json(res, 400, { error: 'title is required' });
    return;
  }

  const now = new Date().toISOString();
  const goalId = `goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const priority =
    data.priority === 'high' || data.priority === 'medium' || data.priority === 'low'
      ? data.priority
      : 'medium';
  const description = data.description?.trim() || null;
  const deadline = data.deadline || null;

  // 1. Create goal in SQLite
  createGoal({
    id: goalId,
    group_folder: MAIN_GROUP_FOLDER,
    project_id: typeof data.project_id === 'string' ? data.project_id.trim() || null : null,
    title: data.title.trim(),
    description,
    status: 'active',
    priority,
    progress: 0,
    deadline,
    created_at: now,
    updated_at: now,
    completed_at: null,
  });

  // 2. Find main group's chat JID for the breakdown task
  const groups = deps.registeredGroups();
  const mainJid = findMainGroupJid(groups);

  if (mainJid) {
    // 3. Create a one-time scheduled task for Andy to break down the goal
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const promptParts = [
      `New goal created from dashboard. Goal ID: ${goalId}`,
      `Title: '${data.title.trim()}'.`,
    ];
    if (description) promptParts.push(`Description: '${description}'.`);
    promptParts.push(`Priority: ${priority}.`);
    promptParts.push(
      `Break this goal into actionable tasks and schedule them. IMPORTANT: Every task you create with schedule_task MUST include goal_id="${goalId}" so they are linked to this goal.`,
    );
    promptParts.push(
      `After scheduling all tasks, call update_goal with goal_id="${goalId}" to set progress to an appropriate initial value (e.g. 10 for planned). When the final task completes, it should call update_goal to set status="completed" and progress=100.`,
    );

    createTask({
      id: taskId,
      group_folder: MAIN_GROUP_FOLDER,
      chat_jid: mainJid,
      prompt: promptParts.join(' '),
      schedule_type: 'once',
      schedule_value: now,
      context_mode: 'group',
      next_run: now,
      status: 'active',
      created_at: now,
      goal_id: goalId,
      depends_on: null,
      timeout: 600000,
      parent_task_id: null,
    });

    // Create a recurring goal review task
    const reviewFrequency = priority === 'high' ? '0 9 * * *' : priority === 'medium' ? '0 9 */3 * *' : '0 9 * * 1';
    const reviewTaskId = `task-${Date.now() + 1}-${Math.random().toString(36).slice(2, 8)}`;
    createTask({
      id: reviewTaskId,
      group_folder: MAIN_GROUP_FOLDER,
      chat_jid: mainJid,
      prompt: `Review goal ${goalId}: '${data.title.trim()}'. Read task results for all linked tasks (goal_id=${goalId}). Assess overall progress. Update progress with update_goal. If tasks are failing or stalled, replan. If you're blocked, use request_help. Report significant progress to the user via send_message.`,
      schedule_type: 'cron',
      schedule_value: reviewFrequency,
      context_mode: 'group',
      next_run: null,
      status: 'active',
      created_at: now,
      goal_id: goalId,
      depends_on: null,
      timeout: null,
      parent_task_id: null,
    });
    // Set next_run for the review task via cron parsing
    try {
      const interval = CronExpressionParser.parse(reviewFrequency, { tz: TIMEZONE });
      const nextRun = interval.next().toISOString();
      updateTask(reviewTaskId, { next_run: nextRun });
    } catch {
      // cron parsing failure — task will be picked up on next scheduler cycle
    }

    logger.info(
      { goalId, taskId, reviewTaskId },
      'Goal created via API with breakdown + review tasks',
    );
  } else {
    logger.warn(
      { goalId },
      'Goal created via API but no main group found for breakdown task',
    );
  }

  // 4. Update dashboard data & goals snapshot
  writeDashboardData(MAIN_GROUP_FOLDER);
  deps.writeGoalsSnapshotForGroup(MAIN_GROUP_FOLDER, true);

  json(res, 201, { id: goalId, success: true });
}

function handleGetProjects(res: http.ServerResponse): void {
  const filePath = path.join(GROUPS_DIR, MAIN_GROUP_FOLDER, 'projects.json');
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    json(res, 200, data);
  } catch {
    json(res, 200, { projects: [], orphanedGoals: [] });
  }
}

function handleGetGoals(res: http.ServerResponse): void {
  const goals = getAllGoals();
  const goalsWithTasks = goals.map((g) => {
    const tasks = getTasksForGoal(g.id);
    return {
      ...g,
      tasks: tasks.map((t) => ({
        id: t.id,
        prompt: t.prompt,
        schedule_type: t.schedule_type,
        schedule_value: t.schedule_value,
        status: t.status,
        next_run: t.next_run,
        last_run: t.last_run,
        last_result: t.last_result,
      })),
    };
  });
  json(res, 200, goalsWithTasks);
}

function handleGetRequests(res: http.ServerResponse): void {
  const requests = getAllHelpRequests();
  json(res, 200, requests);
}

async function handleRespondToRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  requestId: string,
): Promise<void> {
  const body = await readBody(req);
  let data: { response?: string };
  try {
    data = JSON.parse(body);
  } catch {
    json(res, 400, { error: 'Invalid JSON' });
    return;
  }

  if (!data.response || typeof data.response !== 'string' || !data.response.trim()) {
    json(res, 400, { error: 'response is required' });
    return;
  }

  const request = getHelpRequestById(requestId);
  if (!request) {
    json(res, 404, { error: 'Help request not found' });
    return;
  }

  const now = new Date().toISOString();
  updateHelpRequest(requestId, {
    status: 'resolved',
    response: data.response.trim(),
    resolved_at: now,
  });

  // Update dashboard data
  writeDashboardData(MAIN_GROUP_FOLDER);

  logger.info({ requestId }, 'Help request responded to via API');
  json(res, 200, { success: true });
}
