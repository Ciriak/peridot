-- CreateTable
CREATE TABLE "MetadataProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "credentialCiphertext" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "MetadataProvider_kind_key" ON "MetadataProvider"("kind");
CREATE INDEX "MetadataProvider_position_idx" ON "MetadataProvider"("position");

-- AlterTable
ALTER TABLE "Track" ADD COLUMN "metadataMode" TEXT NOT NULL DEFAULT 'automatic';
ALTER TABLE "Track" ADD COLUMN "metadataTitle" TEXT;
ALTER TABLE "Track" ADD COLUMN "metadataArtist" TEXT;
ALTER TABLE "Track" ADD COLUMN "metadataArtistCredits" TEXT;
ALTER TABLE "Track" ADD COLUMN "metadataAlbum" TEXT;
ALTER TABLE "Track" ADD COLUMN "metadataDiscNumber" INTEGER;
ALTER TABLE "Track" ADD COLUMN "metadataTrackNumber" INTEGER;
ALTER TABLE "Track" ADD COLUMN "metadataProviderId" TEXT;
ALTER TABLE "Track" ADD COLUMN "metadataProviderKind" TEXT;
ALTER TABLE "Track" ADD COLUMN "metadataProviderName" TEXT;
ALTER TABLE "Track" ADD COLUMN "metadataRecordingId" TEXT;
ALTER TABLE "Track" ADD COLUMN "metadataReleaseId" TEXT;
ALTER TABLE "Track" ADD COLUMN "metadataMatchedAt" DATETIME;
ALTER TABLE "Track" ADD COLUMN "metadataAttemptedSignature" TEXT;

-- AlterTable
ALTER TABLE "LibraryScan" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "LibraryScan" ADD COLUMN "sourceName" TEXT;
ALTER TABLE "LibraryScan" ADD COLUMN "metadataStatus" TEXT NOT NULL DEFAULT 'skipped';
ALTER TABLE "LibraryScan" ADD COLUMN "metadataTotalCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LibraryScan" ADD COLUMN "metadataProcessedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LibraryScan" ADD COLUMN "metadataMatchedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LibraryScan" ADD COLUMN "metadataUnmatchedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LibraryScan" ADD COLUMN "metadataErrorCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LibraryScan" ADD COLUMN "metadataFailureSummary" TEXT;
