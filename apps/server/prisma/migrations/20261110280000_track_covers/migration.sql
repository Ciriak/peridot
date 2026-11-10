-- CreateTable
CREATE TABLE "TrackCover" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hash" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackCover_hash_key" ON "TrackCover"("hash");

-- AlterTable
ALTER TABLE "Track" ADD COLUMN "coverId" TEXT;

-- CreateIndex
CREATE INDEX "Track_coverId_idx" ON "Track"("coverId");
