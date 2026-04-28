import z from "zod";
import process from "node:process";
import fs from "node:fs";

if (typeof process.loadEnvFile === "function" && fs.existsSync(".env")) {
    process.loadEnvFile();
}

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    QDRANT_HTTP_URL: z.string(),
    QDRANT_RPC_URL: z.string(),
    DATABASE_URL: z.string(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    LOG_PRETTY: z.preprocess((v) => v === 'true', z.boolean()).default(false),
    S3_PUBLIC_URL: z.string().optional(),
    S3_BUCKET_NAME: z.string().default("flux-ai-bucket"),
    SENTRY_DSN: z.string(),
});

const _serverEnv = envSchema.safeParse(process.env)

if (!_serverEnv.success) {
    console.error("❌ Invalid environment variables:", _serverEnv.error.issues);
    process.exit(1);
}

export const env = _serverEnv.data;