import { execSync } from "child_process";
import { loadEnv } from "vite";

export default function setup() {
  const env = loadEnv("test", process.cwd(), "");
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: env.TEST_DATABASE_URL },
  });
}
