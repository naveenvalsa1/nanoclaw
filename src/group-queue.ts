import { ChildProcess, exec } from 'child_process';

import { MAX_CONCURRENT_CONTAINERS } from './config.js';
import { logger } from './logger.js';

interface QueuedTask {
  id: string;
  groupJid: string;
  fn: () => Promise<void>;
}

const MAX_RETRIES = 5;
const BASE_RETRY_MS = 5000;

interface GroupState {
  active: boolean; // true when processing messages (serialized)
  activeTasks: number; // count of concurrently running tasks
  pendingMessages: boolean;
  pendingTasks: QueuedTask[];
  process: ChildProcess | null;
  containerName: string | null;
  retryCount: number;
}

export class GroupQueue {
  private groups = new Map<string, GroupState>();
  private activeCount = 0;
  private waitingGroups: string[] = [];
  private allProcesses = new Map<string, { jid: string; proc: ChildProcess; containerName: string }>();
  private processMessagesFn: ((groupJid: string) => Promise<boolean>) | null =
    null;
  private statusCallbackFn: ((groupJid: string, active: boolean) => void) | null =
    null;
  private shuttingDown = false;

  private getGroup(groupJid: string): GroupState {
    let state = this.groups.get(groupJid);
    if (!state) {
      state = {
        active: false,
        activeTasks: 0,
        pendingMessages: false,
        pendingTasks: [],
        process: null,
        containerName: null,
        retryCount: 0,
      };
      this.groups.set(groupJid, state);
    }
    return state;
  }

  setProcessMessagesFn(fn: (groupJid: string) => Promise<boolean>): void {
    this.processMessagesFn = fn;
  }

  setStatusCallback(fn: (groupJid: string, active: boolean) => void): void {
    this.statusCallbackFn = fn;
  }

  private emitStatus(groupJid: string, active: boolean): void {
    if (this.statusCallbackFn) {
      try {
        this.statusCallbackFn(groupJid, active);
      } catch (err) {
        logger.warn({ groupJid, err }, 'Status callback error');
      }
    }
  }

  enqueueMessageCheck(groupJid: string): void {
    if (this.shuttingDown) return;

    const state = this.getGroup(groupJid);

    if (state.active) {
      state.pendingMessages = true;
      logger.debug({ groupJid }, 'Container active, message queued');
      return;
    }

    if (this.activeCount >= MAX_CONCURRENT_CONTAINERS) {
      state.pendingMessages = true;
      if (!this.waitingGroups.includes(groupJid)) {
        this.waitingGroups.push(groupJid);
      }
      logger.debug(
        { groupJid, activeCount: this.activeCount },
        'At concurrency limit, message queued',
      );
      return;
    }

    this.runForGroup(groupJid, 'messages');
  }

  enqueueTask(groupJid: string, taskId: string, fn: () => Promise<void>): void {
    if (this.shuttingDown) return;

    const state = this.getGroup(groupJid);

    // Prevent double-queuing of the same task
    if (state.pendingTasks.some((t) => t.id === taskId)) {
      logger.debug({ groupJid, taskId }, 'Task already queued, skipping');
      return;
    }

    // Tasks run in parallel — only blocked by global concurrency limit
    if (this.activeCount >= MAX_CONCURRENT_CONTAINERS) {
      state.pendingTasks.push({ id: taskId, groupJid, fn });
      if (!this.waitingGroups.includes(groupJid)) {
        this.waitingGroups.push(groupJid);
      }
      logger.debug(
        { groupJid, taskId, activeCount: this.activeCount },
        'At concurrency limit, task queued',
      );
      return;
    }

    // Run immediately (parallel with other tasks in same group)
    this.runTask(groupJid, { id: taskId, groupJid, fn });
  }

  registerProcess(groupJid: string, proc: ChildProcess, containerName: string): void {
    const state = this.getGroup(groupJid);
    // For message processing, track on the group state (single at a time)
    state.process = proc;
    state.containerName = containerName;
    // Also track in global set for shutdown
    this.allProcesses.set(containerName, { jid: groupJid, proc, containerName });
    proc.on('close', () => {
      this.allProcesses.delete(containerName);
    });
  }

  private async runForGroup(
    groupJid: string,
    reason: 'messages' | 'drain',
  ): Promise<void> {
    const state = this.getGroup(groupJid);
    state.active = true;
    state.pendingMessages = false;
    this.activeCount++;
    this.emitStatus(groupJid, true);

    logger.debug(
      { groupJid, reason, activeCount: this.activeCount },
      'Starting container for group',
    );

    try {
      if (this.processMessagesFn) {
        const success = await this.processMessagesFn(groupJid);
        if (success) {
          state.retryCount = 0;
        } else {
          this.scheduleRetry(groupJid, state);
        }
      }
    } catch (err) {
      logger.error({ groupJid, err }, 'Error processing messages for group');
      this.scheduleRetry(groupJid, state);
    } finally {
      state.active = false;
      state.process = null;
      state.containerName = null;
      this.activeCount--;
      this.emitStatus(groupJid, false);
      this.drainGroup(groupJid);
    }
  }

  private async runTask(groupJid: string, task: QueuedTask): Promise<void> {
    const state = this.getGroup(groupJid);
    state.activeTasks++;
    this.activeCount++;
    this.emitStatus(groupJid, true);

    logger.debug(
      { groupJid, taskId: task.id, activeCount: this.activeCount, activeTasks: state.activeTasks },
      'Running queued task',
    );

    try {
      await task.fn();
    } catch (err) {
      logger.error({ groupJid, taskId: task.id, err }, 'Error running task');
    } finally {
      state.activeTasks--;
      this.activeCount--;
      if (!state.active && state.activeTasks === 0) {
        this.emitStatus(groupJid, false);
      }
      this.drainGroup(groupJid);
    }
  }

  private scheduleRetry(groupJid: string, state: GroupState): void {
    state.retryCount++;
    if (state.retryCount > MAX_RETRIES) {
      logger.error(
        { groupJid, retryCount: state.retryCount },
        'Max retries exceeded, dropping messages (will retry on next incoming message)',
      );
      state.retryCount = 0;
      return;
    }

    const delayMs = BASE_RETRY_MS * Math.pow(2, state.retryCount - 1);
    logger.info(
      { groupJid, retryCount: state.retryCount, delayMs },
      'Scheduling retry with backoff',
    );
    setTimeout(() => {
      if (!this.shuttingDown) {
        this.enqueueMessageCheck(groupJid);
      }
    }, delayMs);
  }

  private drainGroup(groupJid: string): void {
    if (this.shuttingDown) return;

    const state = this.getGroup(groupJid);

    // Launch as many pending tasks as concurrency allows
    while (
      state.pendingTasks.length > 0 &&
      this.activeCount < MAX_CONCURRENT_CONTAINERS
    ) {
      const task = state.pendingTasks.shift()!;
      this.runTask(groupJid, task);
    }

    // Then pending messages (only if no message processing is active)
    if (state.pendingMessages && !state.active && this.activeCount < MAX_CONCURRENT_CONTAINERS) {
      this.runForGroup(groupJid, 'drain');
      return;
    }

    // Check if other groups are waiting for a slot
    if (this.activeCount < MAX_CONCURRENT_CONTAINERS) {
      this.drainWaiting();
    }
  }

  private drainWaiting(): void {
    while (
      this.waitingGroups.length > 0 &&
      this.activeCount < MAX_CONCURRENT_CONTAINERS
    ) {
      const nextJid = this.waitingGroups.shift()!;
      const state = this.getGroup(nextJid);

      // Prioritize tasks over messages
      if (state.pendingTasks.length > 0) {
        const task = state.pendingTasks.shift()!;
        this.runTask(nextJid, task);
      } else if (state.pendingMessages) {
        this.runForGroup(nextJid, 'drain');
      }
      // If neither pending, skip this group
    }
  }

  async shutdown(gracePeriodMs: number): Promise<void> {
    this.shuttingDown = true;
    logger.info(
      { activeCount: this.activeCount, gracePeriodMs },
      'GroupQueue shutting down',
    );

    // Collect all active processes from the global tracker
    const activeProcs = Array.from(this.allProcesses.values()).filter(
      ({ proc }) => !proc.killed,
    );

    if (activeProcs.length === 0) return;

    // Stop all active containers gracefully
    for (const { jid, proc, containerName } of activeProcs) {
      if (containerName) {
        // Defense-in-depth: re-sanitize before shell interpolation.
        const safeName = containerName.replace(/[^a-zA-Z0-9-]/g, '');
        logger.info({ jid, containerName: safeName }, 'Stopping container');
        exec(`container stop ${safeName}`, (err) => {
          if (err) {
            logger.warn({ jid, containerName: safeName, err: err.message }, 'container stop failed');
          }
        });
      } else {
        logger.info({ jid, pid: proc.pid }, 'Sending SIGTERM to process');
        proc.kill('SIGTERM');
      }
    }

    // Wait for grace period
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        const alive = activeProcs.filter(
          ({ proc }) => !proc.killed && proc.exitCode === null,
        );
        if (alive.length === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 500);

      setTimeout(() => {
        clearInterval(checkInterval);
        // SIGKILL survivors
        for (const { jid, proc } of activeProcs) {
          if (!proc.killed && proc.exitCode === null) {
            logger.warn({ jid, pid: proc.pid }, 'Sending SIGKILL to container');
            proc.kill('SIGKILL');
          }
        }
        resolve();
      }, gracePeriodMs);
    });
  }
}
