const { PrismaClient } = require("@prisma/client");
const { seedTaskDefinitions } = require("../tasks/taskSeeder");

const prisma = new PrismaClient();

async function main() {
  await seedTaskDefinitions(prisma);
}

main()
  .catch((error) => {
    console.error("Failed to seed task definitions", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
