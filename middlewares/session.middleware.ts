import { NextFunction, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { env } from "../schema/env.js";

const sessionMiddleware = (req: Request, res: Response, next: NextFunction) => {
    let sessionId = req.cookies.session_id;

    if (!sessionId) {
        sessionId = uuid();

        res.cookie("session_id", sessionId, {
            httpOnly: true,
            secure: env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000
        })
    }

    req.sessionId = sessionId;
    next();
}

export default sessionMiddleware;