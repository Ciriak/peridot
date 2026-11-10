-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "name" TEXT,
    "path" TEXT,
    "url" TEXT,
    "integration" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Track" (
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
    "updatedAt" DATETIME NOT NULL,
    "sourceId" TEXT,
    CONSTRAINT "Track_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Track" ("album", "artist", "available", "createdAt", "durationMs", "fileModifiedAt", "fileSizeBytes", "id", "lastSeenScanId", "mimeType", "relativePath", "sourceId", "title", "updatedAt")
SELECT "album", "artist", "available", "createdAt", "durationMs", "fileModifiedAt", "fileSizeBytes", "id", "lastSeenScanId", "mimeType", "relativePath", NULL, "title", "updatedAt"
FROM "Track";
DROP TABLE "Track";
ALTER TABLE "new_Track" RENAME TO "Track";
CREATE UNIQUE INDEX "Track_sourceId_relativePath_key" ON "Track"("sourceId", "relativePath");
CREATE INDEX "Track_available_idx" ON "Track"("available");
CREATE INDEX "Track_artist_album_title_idx" ON "Track"("artist", "album", "title");
CREATE INDEX "Track_sourceId_idx" ON "Track"("sourceId");
CREATE INDEX "Source_kind_idx" ON "Source"("kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
