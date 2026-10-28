-- AlterTable
ALTER TABLE "StudyRecord" ADD COLUMN "lastTestedAt" DATETIME;

-- CreateTable
CREATE TABLE "CardResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardResult_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CardResult_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "StudyRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CardResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CardResult_userId_cardId_idx" ON "CardResult"("userId", "cardId");

-- CreateIndex
CREATE INDEX "CardResult_userId_studyId_idx" ON "CardResult"("userId", "studyId");
