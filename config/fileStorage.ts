import multer from "multer";
import { logger } from "./logger.js";

export const storage = multer.diskStorage({
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