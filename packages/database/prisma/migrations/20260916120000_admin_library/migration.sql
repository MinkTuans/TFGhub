CREATE TABLE "AdminLibraryState" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminLibraryState_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AdminCategory" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" VARCHAR(500) NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminCategory_version_check" CHECK ("version" > 0)
);
CREATE TABLE "AdminDocument" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "sourcePath" VARCHAR(500),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminDocument_version_check" CHECK ("version" > 0),
  CONSTRAINT "AdminDocument_content_check" CHECK (char_length("content") <= 200000)
);
CREATE UNIQUE INDEX "AdminDocument_sourcePath_key" ON "AdminDocument"("sourcePath");
CREATE INDEX "AdminDocument_categoryId_idx" ON "AdminDocument"("categoryId");
ALTER TABLE "AdminDocument" ADD CONSTRAINT "AdminDocument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AdminCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
