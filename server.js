import express from "express";
import cors from "cors";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import { chatRouter } from "./routes/chat.router.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, res, cb) => {
    cb(null, "uploads/")
  },
  filename: (req, file, cb) => {
    const sessionId = req.body.sessionId || "default";
    console.log("File: ", file)
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9) + "-" + file.originalname;
    cb(null, `${sessionId}-${uniqueSuffix}`);
  }
})

const uploads = multer({ storage })

// Serve Vite frontend build
app.use(express.static(path.join(__dirname, "../frontend/dist")));

export let sessions = {};

app.get("/api/sessions", (req, res) => {
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

app.get("/api/sessions/:id", (req, res) => {
  if (sessions[req.params.id]) {
    res.json(sessions[req.params.id].messages.map(m => ({
      role: m.role || 'user',
      content: m.content
    })));
  } else {
    res.status(404).json({ error: "Session not found" });
  }
});

app.use("/api/chat", uploads.array("files"), chatRouter);

// Front-end catch-all
app.get(/^\/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

app.listen(8000, () => {
  console.log("Server is listening on port 8000");
});
