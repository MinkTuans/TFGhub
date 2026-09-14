-- CreateTable
CREATE TABLE "GameProject" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "formatVersion" TEXT NOT NULL DEFAULT '1',
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameProject_gameId_key" ON "GameProject"("gameId");

-- AddForeignKey
ALTER TABLE "GameProject" ADD CONSTRAINT "GameProject_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
