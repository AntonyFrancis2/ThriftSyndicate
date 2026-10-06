import "dotenv/config";
import { execSync } from "node:child_process";

export default function setup() {
  if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL in .env");
  const url = process.env.TEST_DATABASE_URL;
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
