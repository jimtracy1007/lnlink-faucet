-- CreateTable
CREATE TABLE "faucet_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nostr_address" TEXT NOT NULL,
    "claim_time" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "asset_type" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "asset_name" TEXT,
    "tx_hash" TEXT,
    "invoice" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "faucet_records_nostr_address_claim_time_idx" ON "faucet_records"("nostr_address", "claim_time");
