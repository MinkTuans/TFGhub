ALTER TABLE "User"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "adminVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD CONSTRAINT "User_adminVersion_positive" CHECK ("adminVersion" > 0);
