const { PrismaClient } = require("@prisma/client");
const Logger = require("../logger");
const { seedTaskDefinitions } = require("../tasks/taskSeeder");

const prisma = new PrismaClient();
const logger = new Logger("task-service");

class TaskServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "TaskServiceError";
    this.status = status;
  }
}

class TaskService {
  constructor() {
    this.initPromise = null;
  }

  async listAllTasks() {
    await this.ensureSeeded();
    const definitions = await prisma.taskDefinition.findMany({
      where: {
        isActive: true,
      },
      orderBy: [{ category: "asc" }, { id: "asc" }],
    });

    return this.groupDefinitions(definitions);
  }

  async listTasksByUser(rawNostrAddress) {
    const nostrAddress = this.normalizeNostrAddress(rawNostrAddress);
    if (!nostrAddress) {
      throw new TaskServiceError("Invalid nostr address");
    }

    await this.ensureSeeded();

    const definitions = await prisma.taskDefinition.findMany({
      where: {
        isActive: true,
      },
      orderBy: [{ category: "asc" }, { id: "asc" }],
      include: {
        completions: {
          where: {
            nostrAddress,
          },
        },
      },
    });

    const grouped = {};

    for (const definition of definitions) {
      const category = definition.category;
      if (!grouped[category]) {
        grouped[category] = {
          category,
          completed: [],
          pending: [],
        };
      }

      const completion = definition.completions[0];
      if (completion) {
        grouped[category].completed.push({
          tag: definition.tag,
          displayName: definition.displayName,
          description: definition.description,
          completedAt: completion.completedAt,
          meta: this.parseMeta(completion.meta),
        });
      } else {
        grouped[category].pending.push({
          tag: definition.tag,
          displayName: definition.displayName,
          description: definition.description,
        });
      }
    }

    return Object.values(grouped);
  }

  formatCompletion(completion, task) {
    return {
      tag: task.tag,
      nostrAddress: completion.nostrAddress,
      completedAt: completion.completedAt,
      meta: this.parseMeta(completion.meta),
    };
  }

  async completeTask({ nostrAddress: rawNostrAddress, tag, meta, signature }) {
    const nostrAddress = this.normalizeNostrAddress(rawNostrAddress);
    // TODO signature verification

    if (!nostrAddress) {
      throw new TaskServiceError("Invalid nostr address");
    }

    if (!tag || typeof tag !== "string") {
      throw new TaskServiceError("Invalid task tag");
    }

    await this.ensureSeeded();

    const task = await prisma.taskDefinition.findFirst({
      where: {
        tag,
        isActive: true,
      },
    });

    if (!task) {
      throw new TaskServiceError("Task not found", 404);
    }

    const existing = await prisma.taskCompletion.findUnique({
      where: {
        taskId_nostrAddress: {
          taskId: task.id,
          nostrAddress,
        },
      },
    });

    if (existing) {
      logger.info("Task already completed", { tag, nostrAddress });
      return {
        created: false,
        completion: this.formatCompletion(existing, task),
      };
    }

    const completionRecord = await prisma.taskCompletion.create({
      data: {
        taskId: task.id,
        nostrAddress,
        meta: this.stringifyMeta(meta),
      },
    });

    logger.info("Task completed", { tag, nostrAddress });

    return {
      created: true,
      completion: this.formatCompletion(completionRecord, task),
    };
  }

  groupDefinitions(definitions) {
    const grouped = {};

    for (const definition of definitions) {
      const category = definition.category;
      if (!grouped[category]) {
        grouped[category] = {
          category,
          tasks: [],
        };
      }

      grouped[category].tasks.push({
        tag: definition.tag,
        displayName: definition.displayName,
        description: definition.description,
      });
    }

    return Object.values(grouped);
  }

  parseMeta(meta) {
    if (!meta) {
      return null;
    }

    try {
      return JSON.parse(meta);
    } catch (error) {
      return meta;
    }
  }

  stringifyMeta(meta) {
    if (meta === undefined || meta === null) {
      return null;
    }

    if (typeof meta === "string") {
      return meta;
    }

    return JSON.stringify(meta);
  }

  normalizeNostrAddress(value) {
    if (!value || typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  async ensureSeeded() {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const count = await prisma.taskDefinition.count();
        if (count === 0) {
          logger.info("Task definitions missing, seeding defaults");
          await seedTaskDefinitions(prisma, logger);
        }
      })().catch((error) => {
        this.initPromise = null;
        logger.error("Failed to ensure task definitions", error.message);
        throw error;
      });
    }

    return this.initPromise;
  }
}

const taskService = new TaskService();

module.exports = {
  taskService,
  TaskServiceError,
};
