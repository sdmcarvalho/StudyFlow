import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const DATABASE_URL = "file:./prisma/e2e.db";

export default defineConfig({
  testDir: "tests/e2e",
  // Os testes compartilham um único banco SQLite; cada um reinicia os dados no beforeEach.
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // O webServer sobe antes de qualquer globalSetup, então as migrations rodam no próprio comando.
    command: `npx prisma migrate deploy && npm run build && npx next start -p ${PORT}`,
    // /testes não usa o banco, então responde mesmo antes do primeiro seed.
    url: `http://localhost:${PORT}/testes`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: { DATABASE_URL },
  },
});
