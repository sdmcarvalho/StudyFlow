-- CreateTable
CREATE TABLE "VoiceSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "voice" TEXT NOT NULL DEFAULT 'pt_BR-faber-medium',
    "speed" REAL NOT NULL DEFAULT 1,
    "volume" REAL NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoiceSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VoiceSettings_userId_key" ON "VoiceSettings"("userId");
