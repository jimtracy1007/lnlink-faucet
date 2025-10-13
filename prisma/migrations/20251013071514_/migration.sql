-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_faucet_records" (
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
    "queued_at" DATETIME,
    "confirmed_at" DATETIME,
    "last_check_at" DATETIME,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "fee_rate" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_faucet_records" ("amount", "asset_id", "asset_name", "asset_type", "claim_time", "created_at", "id", "invoice", "nostr_address", "status", "tx_hash", "updated_at") SELECT "amount", "asset_id", "asset_name", "asset_type", "claim_time", "created_at", "id", "invoice", "nostr_address", "status", "tx_hash", "updated_at" FROM "faucet_records";
DROP TABLE "faucet_records";
ALTER TABLE "new_faucet_records" RENAME TO "faucet_records";
CREATE INDEX "faucet_records_nostr_address_claim_time_idx" ON "faucet_records"("nostr_address", "claim_time");
CREATE INDEX "faucet_records_asset_type_status_claim_time_idx" ON "faucet_records"("asset_type", "status", "claim_time");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
