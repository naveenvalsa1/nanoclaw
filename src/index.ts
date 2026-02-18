import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { Bot } from 'grammy';
import { CronExpressionParser } from 'cron-parser';

import {
  ASSISTANT_NAME,
  BOT_TOKEN,
  DATA_DIR,
  GROUPS_DIR,
  IPC_POLL_INTERVAL,
  MAIN_GROUP_FOLDER,
  POLL_INTERVAL,
  TIMEZONE,
  TRIGGER_PATTERN,
} from './config.js';
import { startApiServer, stopApiServer } from './api-server.js';
import {
  AgentResponse,
  AvailableGroup,
  runContainerAgent,
  writeGoalsSnapshot,
  writeGroupsSnapshot,
  writeHelpRequestsSnapshot,
  writeProjectsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import {
  createGoal,
  createHelpRequest,
  createProject,
  createTask,
  deleteTask,
  getAllChats,
  getAllGoals,
  getAllProjects,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getGoalById,
  getLastGroupSync,
  getMessagesSince,
  getNewMessages,
  getProjectById,
  getProjectsForGroup,
  getRouterState,
  getTaskById,
  initDatabase,
  setLastGroupSync,
  setRegisteredGroup,
  setRouterState,
  setSession,
  storeChatMetadata,
  storeMessage,
  updateChatName,
  updateGoal,
  updateProject,
  updateTask,
} from './db.js';
import { writeDashboardData } from './dashboard-writer.js';
import { GroupQueue } from './group-queue.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { Goal, Project, RegisteredGroup } from './types.js';
import { logger } from './logger.js';

const GROUP_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TELEGRAM_MESSAGE_LIMIT = 4096;

let bot: Bot;
let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
let messageLoopRunning = false;
let ipcWatcherRunning = false;
let groupSyncTimerStarted = false;

const queue = new GroupQueue();

async function setTyping(chatId: string, isTyping: boolean): Promise<void> {
  if (!isTyping) return; // Telegram has no "paused" action
  try {
    await bot.api.sendChatAction(Number(chatId), 'typing');
  } catch (err) {
    logger.debug({ chatId, err }, 'Failed to update typing status');
  }
}

function loadState(): void {
  // Load from SQLite (migration from JSON happens in initDatabase)
  lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    lastAgentTimestamp = {};
  }
  sessions = getAllSessions();
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState(
    'last_agent_timestamp',
    JSON.stringify(lastAgentTimestamp),
  );
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  // Create group folder
  const groupDir = path.join(DATA_DIR, '..', 'groups', group.folder);
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

/**
 * Sync group metadata from Telegram.
 * Calls getChat() on each registered group to refresh names.
 * Called on startup, daily, and on-demand via IPC.
 */
async function syncGroupMetadata(force = false): Promise<void> {
  if (!force) {
    const lastSync = getLastGroupSync();
    if (lastSync) {
      const lastSyncTime = new Date(lastSync).getTime();
      const now = Date.now();
      if (now - lastSyncTime < GROUP_SYNC_INTERVAL_MS) {
        logger.debug({ lastSync }, 'Skipping group sync - synced recently');
        return;
      }
    }
  }

  try {
    logger.info('Syncing group metadata from Telegram...');
    let count = 0;
    for (const jid of Object.keys(registeredGroups)) {
      try {
        const chat = await bot.api.getChat(Number(jid));
        if ('title' in chat && chat.title) {
          updateChatName(jid, chat.title);
          count++;
        }
      } catch (err) {
        logger.debug({ jid, err }, 'Failed to fetch chat info');
      }
    }

    setLastGroupSync();
    logger.info({ count }, 'Group metadata synced');
  } catch (err) {
    logger.error({ err }, 'Failed to sync group metadata');
  }
}

/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 * Telegram groups have negative chat IDs.
 */
function getAvailableGroups(): AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && Number(c.jid) < 0)
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

/**
 * Process all pending messages for a group.
 * Called by the GroupQueue when it's this group's turn.
 */
async function processGroupMessages(chatJid: string): Promise<boolean> {
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const isMainGroup = group.folder === MAIN_GROUP_FOLDER;

  // Get all messages since last agent interaction
  const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
  const missedMessages = getMessagesSince(
    chatJid,
    sinceTimestamp,
    ASSISTANT_NAME,
  );

  if (missedMessages.length === 0) return true;

  // For non-main groups, check if trigger is required and present
  if (!isMainGroup && group.requiresTrigger !== false) {
    const hasTrigger = missedMessages.some((m) =>
      TRIGGER_PATTERN.test(m.content.trim()),
    );
    if (!hasTrigger) return true;
  }

  const lines = missedMessages.map((m) => {
    const escapeXml = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}">${escapeXml(m.content)}</message>`;
  });
  const prompt = `<messages>\n${lines.join('\n')}\n</messages>`;

  logger.info(
    { group: group.name, messageCount: missedMessages.length },
    'Processing messages',
  );

  await setTyping(chatJid, true);
  const response = await runAgent(group, prompt, chatJid);
  await setTyping(chatJid, false);

  if (response === 'error') {
    // Container or agent error — signal failure so queue can retry with backoff
    return false;
  }

  // Agent processed messages successfully (whether it responded or stayed silent)
  lastAgentTimestamp[chatJid] =
    missedMessages[missedMessages.length - 1].timestamp;
  saveState();

  if (response.outputType === 'message' && response.userMessage) {
    await sendMessage(chatJid, `${ASSISTANT_NAME}: ${response.userMessage}`);
  }

  if (response.internalLog) {
    logger.info(
      { group: group.name, outputType: response.outputType },
      `Agent: ${response.internalLog}`,
    );
  }

  return true;
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
): Promise<AgentResponse | 'error'> {
  const isMain = group.folder === MAIN_GROUP_FOLDER;
  const sessionId = sessions[group.folder];

  // Update tasks snapshot for container to read (filtered by group)
  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // Update goals snapshot for container to read
  const goals = getAllGoals();
  writeGoalsSnapshot(
    group.folder,
    isMain,
    goals.map((g) => ({
      id: g.id,
      group_folder: g.group_folder,
      title: g.title,
      description: g.description,
      status: g.status,
      priority: g.priority,
      progress: g.progress,
      deadline: g.deadline,
    })),
  );

  // Update projects snapshot for container to read
  const projects = getAllProjects();
  writeProjectsSnapshot(
    group.folder,
    isMain,
    projects.map((p) => ({
      id: p.id,
      group_folder: p.group_folder,
      name: p.name,
      description: p.description,
      status: p.status,
    })),
  );

  // Update available groups snapshot (main group only can see all groups)
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  // Update help requests snapshot so the agent can check responses
  writeHelpRequestsSnapshot(group.folder, isMain);

  try {
    const output = await runContainerAgent(
      group,
      {
        prompt,
        sessionId,
        groupFolder: group.folder,
        chatJid,
        isMain,
      },
      (proc, containerName) => queue.registerProcess(chatJid, proc, containerName),
    );

    if (output.newSessionId) {
      sessions[group.folder] = output.newSessionId;
      setSession(group.folder, output.newSessionId);
    }

    if (output.status === 'error') {
      logger.error(
        { group: group.name, error: output.error },
        'Container agent error',
      );
      return 'error';
    }

    return output.result ?? { outputType: 'log' };
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return 'error';
  }
}

async function sendMessage(chatId: string, text: string): Promise<void> {
  try {
    // Telegram has a 4096-character limit per message
    if (text.length <= TELEGRAM_MESSAGE_LIMIT) {
      await bot.api.sendMessage(Number(chatId), text);
    } else {
      // Split on newline boundaries when possible
      let remaining = text;
      while (remaining.length > 0) {
        let chunk: string;
        if (remaining.length <= TELEGRAM_MESSAGE_LIMIT) {
          chunk = remaining;
          remaining = '';
        } else {
          const cutAt = remaining.lastIndexOf('\n', TELEGRAM_MESSAGE_LIMIT);
          const splitAt = cutAt > TELEGRAM_MESSAGE_LIMIT / 2 ? cutAt : TELEGRAM_MESSAGE_LIMIT;
          chunk = remaining.slice(0, splitAt);
          remaining = remaining.slice(splitAt).replace(/^\n/, '');
        }
        await bot.api.sendMessage(Number(chatId), chunk);
      }
    }
    logger.info({ chatId, length: text.length }, 'Message sent');
  } catch (err) {
    logger.error({ chatId, err }, 'Failed to send message');
  }
}

function startIpcWatcher(): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    // Scan all group IPC directories (identity determined by directory)
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== 'errors';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    for (const sourceGroup of groupFolders) {
      const isMain = sourceGroup === MAIN_GROUP_FOLDER;
      const messagesDir = path.join(ipcBaseDir, sourceGroup, 'messages');
      const tasksDir = path.join(ipcBaseDir, sourceGroup, 'tasks');

      // Process messages from this group's IPC directory
      try {
        if (fs.existsSync(messagesDir)) {
          const messageFiles = fs
            .readdirSync(messagesDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of messageFiles) {
            const filePath = path.join(messagesDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (data.type === 'message' && data.chatJid && data.text) {
                // Authorization: verify this group can send to this chatJid
                const targetGroup = registeredGroups[data.chatJid];
                if (
                  isMain ||
                  (targetGroup && targetGroup.folder === sourceGroup)
                ) {
                  await sendMessage(
                    data.chatJid,
                    `${ASSISTANT_NAME}: ${data.text}`,
                  );
                  logger.info(
                    { chatJid: data.chatJid, sourceGroup },
                    'IPC message sent',
                  );
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceGroup },
                    'Unauthorized IPC message attempt blocked',
                  );
                }
              }
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC message',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading IPC messages directory',
        );
      }

      // Process tasks from this group's IPC directory
      try {
        if (fs.existsSync(tasksDir)) {
          const taskFiles = fs
            .readdirSync(tasksDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of taskFiles) {
            const filePath = path.join(tasksDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              // Pass source group identity to processTaskIpc for authorization
              await processTaskIpc(data, sourceGroup, isMain);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC task',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceGroup }, 'Error reading IPC tasks directory');
      }
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info('IPC watcher started (per-group namespaces)');
}

function writeProjectsSnapshotForGroup(groupFolder: string, isMain: boolean): void {
  const projects = getAllProjects();
  writeProjectsSnapshot(
    groupFolder,
    isMain,
    projects.map((p) => ({
      id: p.id,
      group_folder: p.group_folder,
      name: p.name,
      description: p.description,
      status: p.status,
    })),
  );
}

function writeGoalsSnapshotForGroup(groupFolder: string, isMain: boolean): void {
  const goals = getAllGoals();
  writeGoalsSnapshot(
    groupFolder,
    isMain,
    goals.map((g) => ({
      id: g.id,
      group_folder: g.group_folder,
      title: g.title,
      description: g.description,
      status: g.status,
      priority: g.priority,
      progress: g.progress,
      deadline: g.deadline,
    })),
  );
}

async function processTaskIpc(
  data: {
    type: string;
    taskId?: string;
    prompt?: string;
    schedule_type?: string;
    schedule_value?: string;
    context_mode?: string;
    groupFolder?: string;
    chatJid?: string;
    targetJid?: string;
    goal_id?: string;
    depends_on?: string;
    timeout?: number;
    parent_task_id?: string;
    // For register_group
    jid?: string;
    name?: string;
    folder?: string;
    trigger?: string;
    containerConfig?: RegisteredGroup['containerConfig'];
    // For goals
    goalId?: string;
    id?: string;
    title?: string;
    description?: string;
    priority?: string;
    deadline?: string;
    status?: string;
    progress?: number;
    project_id?: string;
    // For projects
    projectId?: string;
    // For help requests
    request_type?: string;
    task_id?: string;
  },
  sourceGroup: string, // Verified identity from IPC directory
  isMain: boolean, // Verified from directory path
): Promise<void> {
  switch (data.type) {
    case 'schedule_task':
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.targetJid
      ) {
        // Resolve the target group from JID
        const targetJid = data.targetJid as string;
        const targetGroupEntry = registeredGroups[targetJid];

        if (!targetGroupEntry) {
          logger.warn(
            { targetJid },
            'Cannot schedule task: target group not registered',
          );
          break;
        }

        const targetFolder = targetGroupEntry.folder;

        // Authorization: non-main groups can only schedule for themselves
        if (!isMain && targetFolder !== sourceGroup) {
          logger.warn(
            { sourceGroup, targetFolder },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }

        const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';

        let nextRun: string | null = null;
        if (scheduleType === 'cron') {
          try {
            const interval = CronExpressionParser.parse(data.schedule_value, {
              tz: TIMEZONE,
            });
            nextRun = interval.next().toISOString();
          } catch {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid cron expression',
            );
            break;
          }
        } else if (scheduleType === 'interval') {
          const ms = parseInt(data.schedule_value, 10);
          if (isNaN(ms) || ms <= 0) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid interval',
            );
            break;
          }
          nextRun = new Date(Date.now() + ms).toISOString();
        } else if (scheduleType === 'once') {
          const scheduled = new Date(data.schedule_value);
          if (isNaN(scheduled.getTime())) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid timestamp',
            );
            break;
          }
          nextRun = scheduled.toISOString();
        }

        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const contextMode =
          data.context_mode === 'group' || data.context_mode === 'isolated'
            ? data.context_mode
            : 'isolated';

        // If depends_on is set, don't set next_run — parent completion will trigger it
        const effectiveNextRun = data.depends_on ? null : nextRun;

        createTask({
          id: taskId,
          group_folder: targetFolder,
          chat_jid: targetJid,
          prompt: data.prompt,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          context_mode: contextMode,
          next_run: effectiveNextRun,
          status: 'active',
          created_at: new Date().toISOString(),
          goal_id: data.goal_id || null,
          depends_on: data.depends_on || null,
          timeout: data.timeout || null,
          parent_task_id: data.parent_task_id || null,
        });
        logger.info(
          { taskId, sourceGroup, targetFolder, contextMode },
          'Task created via IPC',
        );
        writeDashboardData(targetFolder);
      }
      break;

    case 'pause_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'paused' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task paused via IPC',
          );
          writeDashboardData(task.group_folder);
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task pause attempt',
          );
        }
      }
      break;

    case 'resume_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'active' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task resumed via IPC',
          );
          writeDashboardData(task.group_folder);
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task resume attempt',
          );
        }
      }
      break;

    case 'cancel_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          deleteTask(data.taskId);
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task cancelled via IPC',
          );
          writeDashboardData(task.group_folder);
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task cancel attempt',
          );
        }
      }
      break;

    case 'refresh_groups':
      // Only main group can request a refresh
      if (isMain) {
        logger.info(
          { sourceGroup },
          'Group metadata refresh requested via IPC',
        );
        await syncGroupMetadata(true);
        // Write updated snapshot immediately
        const availableGroups = getAvailableGroups();
        writeGroupsSnapshot(
          sourceGroup,
          true,
          availableGroups,
          new Set(Object.keys(registeredGroups)),
        );
      } else {
        logger.warn(
          { sourceGroup },
          'Unauthorized refresh_groups attempt blocked',
        );
      }
      break;

    case 'register_group':
      // Only main group can register new groups
      if (!isMain) {
        logger.warn(
          { sourceGroup },
          'Unauthorized register_group attempt blocked',
        );
        break;
      }
      if (data.jid && data.name && data.folder && data.trigger) {
        registerGroup(data.jid, {
          name: data.name,
          folder: data.folder,
          trigger: data.trigger,
          added_at: new Date().toISOString(),
          containerConfig: data.containerConfig,
        });
      } else {
        logger.warn(
          { data },
          'Invalid register_group request - missing required fields',
        );
      }
      break;

    case 'create_goal':
      if (data.id && data.title) {
        const now = new Date().toISOString();
        const goalPriority =
          data.priority === 'high' || data.priority === 'medium' || data.priority === 'low'
            ? data.priority
            : 'medium';
        createGoal({
          id: data.id,
          group_folder: sourceGroup,
          project_id: data.project_id || null,
          title: data.title,
          description: data.description || null,
          status: 'active',
          priority: goalPriority,
          progress: 0,
          deadline: data.deadline || null,
          created_at: now,
          updated_at: now,
          completed_at: null,
        });
        // Write updated goals snapshot
        writeGoalsSnapshotForGroup(sourceGroup, isMain);
        logger.info(
          { goalId: data.id, sourceGroup },
          'Goal created via IPC',
        );
        writeDashboardData(sourceGroup);
      }
      break;

    case 'update_goal':
      if (data.goalId) {
        const goal = getGoalById(data.goalId);
        if (goal && (isMain || goal.group_folder === sourceGroup)) {
          const goalUpdates: Partial<Goal> = {};
          if (data.status && ['active', 'paused', 'completed', 'cancelled'].includes(data.status)) {
            goalUpdates.status = data.status as Goal['status'];
          }
          if (data.progress !== undefined) {
            goalUpdates.progress = data.progress;
          }
          if (data.description !== undefined) {
            goalUpdates.description = data.description;
          }
          if (data.priority && ['high', 'medium', 'low'].includes(data.priority)) {
            goalUpdates.priority = data.priority as Goal['priority'];
          }
          if (data.deadline !== undefined) {
            goalUpdates.deadline = data.deadline;
          }
          updateGoal(data.goalId, goalUpdates);
          // Write updated goals snapshot
          writeGoalsSnapshotForGroup(sourceGroup, isMain);
          logger.info(
            { goalId: data.goalId, sourceGroup },
            'Goal updated via IPC',
          );
          writeDashboardData(goal.group_folder);
        } else {
          logger.warn(
            { goalId: data.goalId, sourceGroup },
            'Unauthorized goal update attempt',
          );
        }
      }
      break;

    case 'request_help':
      if (data.title && data.description) {
        const helpId = `help-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString();
        const requestType =
          data.request_type === 'blocker' || data.request_type === 'question' ||
          data.request_type === 'access' || data.request_type === 'integration'
            ? data.request_type
            : 'question';
        createHelpRequest({
          id: helpId,
          group_folder: sourceGroup,
          project_id: data.project_id || null,
          goal_id: data.goal_id || null,
          task_id: data.task_id || null,
          title: data.title,
          description: data.description,
          request_type: requestType as 'blocker' | 'question' | 'access' | 'integration',
          status: 'open',
          response: null,
          created_at: now,
          updated_at: now,
          resolved_at: null,
        });
        writeDashboardData(sourceGroup);

        // Send Telegram notification to the group
        const groupEntry = Object.entries(registeredGroups).find(
          ([, g]) => g.folder === sourceGroup,
        );
        if (groupEntry) {
          await sendMessage(
            groupEntry[0],
            `${ASSISTANT_NAME}: I need your help: ${data.title}\n\n${data.description}\n\nPlease respond via the dashboard (Requests tab).`,
          );
        }
        logger.info(
          { helpId, sourceGroup, type: requestType },
          'Help request created via IPC',
        );
      }
      break;

    case 'create_project':
      if (data.id && data.name) {
        const now = new Date().toISOString();
        createProject({
          id: data.id,
          group_folder: sourceGroup,
          name: data.name,
          description: data.description || null,
          status: 'active',
          created_at: now,
          updated_at: now,
        });
        writeProjectsSnapshotForGroup(sourceGroup, isMain);
        logger.info(
          { projectId: data.id, sourceGroup },
          'Project created via IPC',
        );
        writeDashboardData(sourceGroup);
      }
      break;

    case 'update_project':
      if (data.projectId) {
        const project = getProjectById(data.projectId);
        if (project && (isMain || project.group_folder === sourceGroup)) {
          const projectUpdates: Partial<Pick<Project, 'name' | 'description' | 'status'>> = {};
          if (data.name !== undefined) {
            projectUpdates.name = data.name;
          }
          if (data.description !== undefined) {
            projectUpdates.description = data.description;
          }
          if (data.status && ['active', 'paused', 'completed', 'archived'].includes(data.status)) {
            projectUpdates.status = data.status as Project['status'];
          }
          updateProject(data.projectId, projectUpdates);
          writeProjectsSnapshotForGroup(sourceGroup, isMain);
          logger.info(
            { projectId: data.projectId, sourceGroup },
            'Project updated via IPC',
          );
          writeDashboardData(project.group_folder);
        } else {
          logger.warn(
            { projectId: data.projectId, sourceGroup },
            'Unauthorized project update attempt',
          );
        }
      }
      break;

    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}

async function connectTelegram(): Promise<void> {
  if (!BOT_TOKEN) {
    logger.error('No BOT_TOKEN set. Run: npm run auth');
    process.exit(1);
  }

  bot = new Bot(BOT_TOKEN);

  // Validate token
  const me = await bot.api.getMe();
  logger.info({ username: me.username, id: me.id }, 'Connected to Telegram');

  // Message handler
  bot.on('message:text', (ctx) => {
    const chatId = String(ctx.chat.id);
    const timestamp = new Date(ctx.message.date * 1000).toISOString();
    const senderName = ctx.from?.first_name || 'Unknown';
    const senderId = String(ctx.from?.id || 0);
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const chatName = isGroup && 'title' in ctx.chat ? ctx.chat.title : undefined;

    logger.info({ chatId, senderName, isGroup, chatName }, 'Incoming message');

    // Always store chat metadata for group discovery
    storeChatMetadata(chatId, timestamp, chatName);

    // Only store full message content for registered groups
    if (registeredGroups[chatId]) {
      storeMessage({
        id: String(ctx.message.message_id),
        chatJid: chatId,
        sender: senderId,
        senderName,
        content: ctx.message.text,
        timestamp,
        isFromMe: ctx.from?.id === me.id,
      });
    }
  });

  // Error handler
  bot.catch((err) => {
    logger.error({ err: err.error }, 'Bot error');
  });

  // Sync group metadata on startup (respects 24h cache)
  syncGroupMetadata().catch((err) =>
    logger.error({ err }, 'Initial group sync failed'),
  );
  // Set up daily sync timer (only once)
  if (!groupSyncTimerStarted) {
    groupSyncTimerStarted = true;
    setInterval(() => {
      syncGroupMetadata().catch((err) =>
        logger.error({ err }, 'Periodic group sync failed'),
      );
    }, GROUP_SYNC_INTERVAL_MS);
  }

  // Start all subsystems (unchanged)
  startSchedulerLoop({
    sendMessage,
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    onProcess: (groupJid, proc, containerName) => queue.registerProcess(groupJid, proc, containerName),
  });
  startIpcWatcher();
  startApiServer({
    registeredGroups: () => registeredGroups,
    writeGoalsSnapshotForGroup,
  });
  queue.setProcessMessagesFn(processGroupMessages);
  queue.setStatusCallback((groupJid, active) => {
    const group = registeredGroups[groupJid];
    if (!group) return;
    const statusFile = path.join(GROUPS_DIR, group.folder, 'agent-status.json');
    const payload = JSON.stringify({
      status: active ? 'working' : 'idle',
      since: new Date().toISOString(),
    });
    fs.writeFile(statusFile, payload, () => {});
  });
  recoverPendingMessages();
  startMessageLoop();

  // Periodic dashboard data refresh (every 60 seconds)
  setInterval(() => {
    for (const group of Object.values(registeredGroups)) {
      try {
        writeDashboardData(group.folder);
      } catch (err) {
        logger.error({ err, folder: group.folder }, 'Dashboard write error');
      }
    }
  }, 60000);
  // Initial dashboard write
  for (const group of Object.values(registeredGroups)) {
    try {
      writeDashboardData(group.folder);
    } catch (err) {
      logger.error({ err, folder: group.folder }, 'Initial dashboard write error');
    }
  }

  // Start long polling (auto-reconnects)
  bot.start({
    onStart: () => logger.info('Telegram polling started'),
  }).catch((err) => {
    logger.error({ err }, 'Bot polling failed');
    process.exit(1);
  });
}

async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;

  logger.info(`NanoClaw running (trigger: @${ASSISTANT_NAME})`);

  while (true) {
    try {
      const jids = Object.keys(registeredGroups);
      const { messages, newTimestamp } = getNewMessages(
        jids,
        lastTimestamp,
        ASSISTANT_NAME,
      );

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        // Advance the "seen" cursor for all messages immediately
        lastTimestamp = newTimestamp;
        saveState();

        // Deduplicate by group and enqueue
        const groupsWithMessages = new Set<string>();
        for (const msg of messages) {
          groupsWithMessages.add(msg.chat_jid);
        }

        for (const chatJid of groupsWithMessages) {
          queue.enqueueMessageCheck(chatJid);
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

/**
 * Startup recovery: check for unprocessed messages in registered groups.
 * Handles crash between advancing lastTimestamp and processing messages.
 */
function recoverPendingMessages(): void {
  for (const [chatJid, group] of Object.entries(registeredGroups)) {
    const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
    const pending = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);
    if (pending.length > 0) {
      logger.info(
        { group: group.name, pendingCount: pending.length },
        'Recovery: found unprocessed messages',
      );
      queue.enqueueMessageCheck(chatJid);
    }
  }
}

function ensureContainerSystemRunning(): void {
  try {
    execSync('container system status', { stdio: 'pipe' });
    logger.debug('Apple Container system already running');
  } catch {
    logger.info('Starting Apple Container system...');
    try {
      execSync('container system start', { stdio: 'pipe', timeout: 30000 });
      logger.info('Apple Container system started');
    } catch (err) {
      logger.error({ err }, 'Failed to start Apple Container system');
      console.error(
        '\n╔════════════════════════════════════════════════════════════════╗',
      );
      console.error(
        '║  FATAL: Apple Container system failed to start                 ║',
      );
      console.error(
        '║                                                                ║',
      );
      console.error(
        '║  Agents cannot run without Apple Container. To fix:           ║',
      );
      console.error(
        '║  1. Install from: https://github.com/apple/container/releases ║',
      );
      console.error(
        '║  2. Run: container system start                               ║',
      );
      console.error(
        '║  3. Restart NanoClaw                                          ║',
      );
      console.error(
        '╚════════════════════════════════════════════════════════════════╝\n',
      );
      throw new Error('Apple Container system is required but failed to start');
    }
  }

  // Clean up stopped NanoClaw containers from previous runs
  try {
    const output = execSync('container ls -a --format {{.Names}}', {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    const stale = output
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n.startsWith('nanoclaw-'));
    if (stale.length > 0) {
      execSync(`container rm ${stale.join(' ')}`, { stdio: 'pipe' });
      logger.info({ count: stale.length }, 'Cleaned up stopped containers');
    }
  } catch {
    // No stopped containers or ls/rm not supported
  }
}

async function main(): Promise<void> {
  ensureContainerSystemRunning();
  initDatabase();
  logger.info('Database initialized');
  loadState();

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    stopApiServer();
    if (bot) bot.stop();
    await queue.shutdown(10000);
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await connectTelegram();
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start NanoClaw');
  process.exit(1);
});
