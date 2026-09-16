-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "scoresEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GamePlay" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT,
    "participantKey" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GamePlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePlayRequest" (
    "gameId" TEXT NOT NULL,
    "participantKey" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "playId" TEXT NOT NULL,

    CONSTRAINT "GamePlayRequest_pkey" PRIMARY KEY ("gameId","participantKey","requestId")
);

-- CreateTable
CREATE TABLE "GameRating" (
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,

    CONSTRAINT "GameRating_pkey" PRIMARY KEY ("gameId","userId")
);

-- CreateTable
CREATE TABLE "GameComment" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameCommentCooldown" (
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastCommentAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameCommentCooldown_pkey" PRIMARY KEY ("gameId","userId")
);

-- CreateTable
CREATE TABLE "GameScore" (
    "playId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "GameScore_pkey" PRIMARY KEY ("playId")
);

-- CreateIndex
CREATE INDEX "GamePlay_gameId_createdAt_idx" ON "GamePlay"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "GamePlay_gameId_participantKey_createdAt_idx" ON "GamePlay"("gameId", "participantKey", "createdAt");

-- CreateIndex
CREATE INDEX "GameComment_gameId_createdAt_id_idx" ON "GameComment"("gameId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "GamePlay" ADD CONSTRAINT "GamePlay_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlay" ADD CONSTRAINT "GamePlay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayRequest" ADD CONSTRAINT "GamePlayRequest_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayRequest" ADD CONSTRAINT "GamePlayRequest_playId_fkey" FOREIGN KEY ("playId") REFERENCES "GamePlay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRating" ADD CONSTRAINT "GameRating_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRating" ADD CONSTRAINT "GameRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameComment" ADD CONSTRAINT "GameComment_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameComment" ADD CONSTRAINT "GameComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCommentCooldown" ADD CONSTRAINT "GameCommentCooldown_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCommentCooldown" ADD CONSTRAINT "GameCommentCooldown_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameScore" ADD CONSTRAINT "GameScore_playId_fkey" FOREIGN KEY ("playId") REFERENCES "GamePlay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameRating" ADD CONSTRAINT "GameRating_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "GamePlay" ADD CONSTRAINT "GamePlay_duration_check" CHECK ("activeSeconds" >= 0 AND "sequence" >= 0);
ALTER TABLE "GameScore" ADD CONSTRAINT "GameScore_score_check" CHECK ("score" >= 0);
ALTER TABLE "GameComment" ADD CONSTRAINT "GameComment_body_check" CHECK (length(trim("body")) BETWEEN 1 AND 2000);
