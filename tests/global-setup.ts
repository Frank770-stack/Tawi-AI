import { execSync } from "child_process";
import { loadEnv } from "vite";

export default function setup() {
  const env = loadEnv("test", process.cwd(), "");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: env.TEST_DATABASE_URL },
  });
}
