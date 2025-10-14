-- CreateTable
CREATE TABLE "lnlink_identities" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nostr_address" TEXT NOT NULL,
    "lnlink_npub" TEXT NOT NULL,
    "node_type" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "lnlink_identities_nostr_address_key" ON "lnlink_identities"("nostr_address");

-- CreateIndex
CREATE UNIQUE INDEX "lnlink_identities_lnlink_npub_key" ON "lnlink_identities"("lnlink_npub");
