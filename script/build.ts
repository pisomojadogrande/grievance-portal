import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, copyFile } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // Build Lambda handler
  console.log("building lambda handler...");
  await esbuild({
    entryPoints: ["server/lambda.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/lambda.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: ["@aws-sdk/*", "aws-sdk"], // AWS SDK available in Lambda runtime
    logLevel: "info",
    mainFields: ["main", "module"],
    target: "node20",
  });

  // Package Lambda for deployment
  console.log("packaging lambda...");
  await rm("lambda.zip", { force: true });
  await copyFile("dist/lambda.cjs", "dist/index.js");
  await execAsync("cd dist && zip -r ../lambda.zip index.js");
  console.log("lambda.zip created");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
