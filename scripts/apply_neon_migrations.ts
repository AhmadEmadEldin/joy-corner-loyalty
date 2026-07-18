import dotenv from "dotenv";
import { applyNeonMigrations, neonHealth } from "../server/neon";

dotenv.config({ path: [".env.local", ".env"] });

async function main() {
  await applyNeonMigrations();
  const health = await neonHealth();
  console.log(JSON.stringify({ success: true, health }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
