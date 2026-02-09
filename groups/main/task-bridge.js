/**
 * Task Bridge - Connects Andy's work to the dashboard
 *
 * This script provides functions for Andy to:
 * 1. Add tasks to the dashboard when user requests them
 * 2. Update task status as work progresses
 * 3. Monitor backlog and work on tasks automatically
 */

const fs = require('fs');
const path = require('path');

const TASKS_FILE = path.join(__dirname, 'tasks.json');

// Load tasks from storage
function loadTasks() {
    try {
        if (fs.existsSync(TASKS_FILE)) {
            return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading tasks:', e);
    }
    return [];
}

// Save tasks to storage
function saveTasks(tasks) {
    try {
        fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
        return true;
    } catch (e) {
        console.error('Error saving tasks:', e);
        return false;
    }
}

// Add a new task
function addTask(title, description = '', priority = 'medium', deadline = null) {
    const tasks = loadTasks();

    const newTask = {
        id: Date.now(),
        title,
        description,
        status: 'backlog',
        priority,
        deadline,
        timestamp: new Date().toISOString(),
        createdBy: 'andy'
    };

    tasks.push(newTask);
    saveTasks(tasks);

    console.log(`✅ Task added to backlog: "${title}"`);
    return newTask;
}

// Update task status
function updateTaskStatus(taskId, newStatus) {
    const tasks = loadTasks();
    const task = tasks.find(t => t.id === taskId);

    if (task) {
        const oldStatus = task.status;
        task.status = newStatus;
        task.lastUpdated = new Date().toISOString();
        saveTasks(tasks);

        console.log(`📊 Task "${task.title}" moved from ${oldStatus} → ${newStatus}`);
        return task;
    }

    return null;
}

// Move task to in-progress
function startTask(taskId) {
    return updateTaskStatus(taskId, 'progress');
}

// Complete a task
function completeTask(taskId) {
    return updateTaskStatus(taskId, 'completed');
}

// Get all tasks in backlog
function getBacklog() {
    const tasks = loadTasks();
    return tasks.filter(t => t.status === 'backlog');
}

// Get all tasks in progress
function getInProgress() {
    const tasks = loadTasks();
    return tasks.filter(t => t.status === 'progress');
}

// Get task by ID
function getTask(taskId) {
    const tasks = loadTasks();
    return tasks.find(t => t.id === taskId);
}

// Delete a task
function deleteTask(taskId) {
    let tasks = loadTasks();
    const task = tasks.find(t => t.id === taskId);

    if (task) {
        tasks = tasks.filter(t => t.id !== taskId);
        saveTasks(tasks);
        console.log(`🗑️  Task deleted: "${task.title}"`);
        return true;
    }

    return false;
}

// Find task by title (fuzzy match)
function findTaskByTitle(searchTitle) {
    const tasks = loadTasks();
    const lowerSearch = searchTitle.toLowerCase();
    return tasks.find(t => t.title.toLowerCase().includes(lowerSearch));
}

// Get summary of all tasks
function getTaskSummary() {
    const tasks = loadTasks();

    return {
        total: tasks.length,
        backlog: tasks.filter(t => t.status === 'backlog').length,
        inProgress: tasks.filter(t => t.status === 'progress').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        tasks: tasks
    };
}

module.exports = {
    addTask,
    updateTaskStatus,
    startTask,
    completeTask,
    getBacklog,
    getInProgress,
    getTask,
    deleteTask,
    findTaskByTitle,
    getTaskSummary,
    loadTasks,
    saveTasks
};
