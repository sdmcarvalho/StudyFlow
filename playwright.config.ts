import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_DIR } from "./tests/e2e/helpers";

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
    // /login é pública e não consulta o banco, então responde mesmo antes do primeiro seed.
    url: `http://localhost:${PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: false,
    // Pastas dos Estudos criadas pelo app ficam na pasta temporária e2e (ver resetData).
    // O gateway falso de configuracao.spec.ts é http em 127.0.0.1; a política contra SSRF só o aceita relaxada.
    env: { DATABASE_URL, STUDYFLOW_BASE_DIR: E2E_BASE_DIR, STUDYFLOW_AI_ALLOW_PRIVATE: "1" },
  },
});
