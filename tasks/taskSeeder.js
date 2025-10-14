const tasks = require("./taskDefinitions");

async function seedTaskDefinitions(prisma, logger) {
  if (!prisma) {
    throw new Error("Prisma client is required to seed task definitions");
  }

  for (const task of tasks) {
    await prisma.taskDefinition.upsert({
      where: {
        tag: task.tag,
      },
      update: {
        displayName: task.displayName,
        description: task.description,
        category: task.category,
        isActive: true,
      },
      create: {
        tag: task.tag,
        displayName: task.displayName,
        description: task.description,
        category: task.category,
        isActive: true,
      },
    });
    if (logger) {
      logger.info("Task definition seeded", { tag: task.tag });
    }
  }
}

module.exports = {
  seedTaskDefinitions,
};
