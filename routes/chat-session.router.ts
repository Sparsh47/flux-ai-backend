import { Router, Request, Response } from "express";
import { sessions } from "../server.js";
import { prisma } from "../config/db.js";

export const chatSessionRouter = Router();

chatSessionRouter.get("/", async (req: Request, res: Response) => {
    const userId = req.sessionId || "default_user";

    const conversations = await prisma.conversation.findMany({
        where: {
            OR: [
                { userId: userId },
                { userId: "default_user" }
            ]
        },
        select: {
            id: true,
            title: true
        },
        orderBy: {
            updatedAt: "desc"
        },
        take: 10
    })

    // Map DB conversations to the format the frontend expects
    const dbSessions = conversations.map(c => ({
        id: c.id,
        summary: c.title ? (c.title.length > 18 ? c.title.slice(0, 15) + "..." : c.title) : "New Chat"
    }));

    res.json(dbSessions);
})

chatSessionRouter.get("/:id", async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const conversation = await prisma.conversation.findUnique({
        where: { id },
        include: { messages: { orderBy: { createdAt: "asc" } } }
    });

    if (conversation) {
        return res.json(conversation.messages.map(m => ({
            role: m.role.toLowerCase(),
            content: m.content
        })));
    }

    if (sessions[id]) {
        return res.json(sessions[id].messages.map(m => ({
            role: m.role || 'user',
            content: m.content
        })));
    }
    res.status(404).json({ error: "Session not found" });
})