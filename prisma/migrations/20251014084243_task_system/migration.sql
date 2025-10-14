-- CreateTable
CREATE TABLE "task_definitions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tag" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "task_completions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "task_id" INTEGER NOT NULL,
    "nostr_address" TEXT NOT NULL,
    "completed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "task_completions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task_definitions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "task_definitions_tag_key" ON "task_definitions"("tag");

-- CreateIndex
CREATE INDEX "task_definitions_category_is_active_idx" ON "task_definitions"("category", "is_active");

-- CreateIndex
CREATE INDEX "task_completions_nostr_address_idx" ON "task_completions"("nostr_address");

-- CreateIndex
CREATE UNIQUE INDEX "task_completions_task_id_nostr_address_key" ON "task_completions"("task_id", "nostr_address");
