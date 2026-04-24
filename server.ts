import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import { chatRouter } from "./routes/chat.router.js";
import { setupAndRunQdrant } from "./config/qdrant.config.js";
import { logger } from "./config/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.url }, "Incoming request");
  next();
});

const storage = multer.diskStorage({
  destination: (req: any, file: any, cb: any) => {
    cb(null, "uploads/")
  },
  filename: (req: any, file: any, cb: any) => {
    const sessionId = (req.body as any).sessionId || "default";
    logger.debug({ sessionId, originalname: file.originalname }, "Uploading file");
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9) + "-" + file.originalname;
    cb(null, `${sessionId}-${uniqueSuffix}`);
  }
})

const uploads = multer({ storage })

await setupAndRunQdrant();

// Serve Vite frontend build
app.use(express.static(path.join(__dirname, "../frontend/dist")));

interface Message {
  role: 'assistant' | 'user';
  content: string;
  attachments?: string[];
}

interface Session {
  messages: Message[];
  summary: string;
}

export let sessions: Record<string, Session> = {};

app.get("/api/sessions", (req: Request, res: Response) => {
  const sessionData = Object.keys(sessions).map(id => {
    let baseSum = sessions[id].summary || "New Chat";
    if (baseSum === "New Chat" && sessions[id].messages.length > 0) {
      baseSum = sessions[id].messages[0].content.slice(0, 25) + "...";
    }
    return {
      id,
      summary: baseSum
    };
  });
  res.json(sessionData);
});

app.get("/api/sessions/:id", (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (sessions[id]) {
    res.json(sessions[id].messages.map(m => ({
      role: m.role || 'user',
      content: m.content
    })));
  } else {
    res.status(404).json({ error: "Session not found" });
  }
});

app.use("/api/chat", uploads.array("files"), chatRouter);

// Front-end catch-all
app.get(/^\/(.*)/, (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  logger.info(`Server is listening on port ${PORT}`);
});
