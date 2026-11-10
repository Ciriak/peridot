-- CreateTable
CREATE TABLE "QueueItem" (
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "trackId"),
    CONSTRAINT "QueueItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QueueItem_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "QueueItem_userId_position_idx" ON "QueueItem"("userId", "position");

-- CreateIndex
CREATE INDEX "QueueItem_trackId_idx" ON "QueueItem"("trackId");
