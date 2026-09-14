-- CreateTable
CREATE TABLE "PlaySession" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "valid" BOOLEAN NOT NULL DEFAULT true,
    "countedSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayHeartbeat" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL,
    "active" BOOLEAN NOT NULL,
    "counted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaySession_gameId_visitorId_createdAt_idx" ON "PlaySession"("gameId", "visitorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayHeartbeat_eventId_key" ON "PlayHeartbeat"("eventId");

-- AddForeignKey
ALTER TABLE "PlaySession" ADD CONSTRAINT "PlaySession_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayHeartbeat" ADD CONSTRAINT "PlayHeartbeat_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PlaySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
