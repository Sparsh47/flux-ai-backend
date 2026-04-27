import { rateLimit } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import redis from "./redis.js";

export const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
        sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as any
    }),
    message: { error: "Too many requests, please slow down", status: 429 }
});

export const processLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,           // stricter — embedding is expensive
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
        sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as any
    }),
    message: { error: "Too many requests, please slow down", status: 429 }
});