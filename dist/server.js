import express from "express";
import cors from "cors";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import { chatRouter } from "./routes/chat.router.js";
import { setupAndRunQdrant } from "./config/qdrant.config.js";
import { storage } from "./config/fileStorage.js";
import { logger } from "./config/logger.js";
import cookieParser from "cookie-parser";
import sessionMiddleware from "./middlewares/session.middleware.js";
import { chatSessionRouter } from "./routes/chat-session.router.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
// Request logging middleware
app.use((req, res, next) => {
    logger.info({ method: req.method, url: req.url }, "Incoming request");
    next();
});
const uploads = multer({ storage });
await setupAndRunQdrant();
export let sessions = {};
app.use("/api/sessions", sessionMiddleware, chatSessionRouter);
app.use("/api/chat", sessionMiddleware, uploads.array("files"), chatRouter);
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    logger.info(`Server is listening on port ${PORT}`);
});
