CREATE TABLE "Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "relativePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "durationMs" INTEGER,
    "fileSizeBytes" BIGINT NOT NULL,
    "fileModifiedAt" DATETIME NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenScanId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "LibraryScan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "unchangedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "unavailableCount" INTEGER NOT NULL DEFAULT 0,
    "failureSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME
);

CREATE UNIQUE INDEX "Track_relativePath_key" ON "Track"("relativePath");
CREATE INDEX "Track_available_idx" ON "Track"("available");
CREATE INDEX "Track_artist_album_title_idx" ON "Track"("artist", "album", "title");
CREATE INDEX "LibraryScan_status_idx" ON "LibraryScan"("status");
CREATE INDEX "LibraryScan_createdAt_idx" ON "LibraryScan"("createdAt");
