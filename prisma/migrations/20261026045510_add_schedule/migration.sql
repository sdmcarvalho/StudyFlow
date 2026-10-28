-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewDate" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    CONSTRAINT "Schedule_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "StudyRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Schedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Schedule_userId_studyId_idx" ON "Schedule"("userId", "studyId");

-- CreateIndex
CREATE INDEX "Schedule_userId_reviewDate_idx" ON "Schedule"("userId", "reviewDate");
