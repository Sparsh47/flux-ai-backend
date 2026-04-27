import { Router, Request, Response } from "express";
import { getPresignedUploadUrl } from "../config/s3.js";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../config/logger.js";

export const uploadRouter = Router();

uploadRouter.post("/presigned-url", async (req: Request, res: Response) => {
    try {
        const { fileName, fileType, fileSize } = req.body;

        if (!fileName) {
            return res.status(400).json({ error: "fileName is required" });
        }

        const allowedTypes = [
            "application/pdf",
        ];

        if (!allowedTypes.includes(fileType)) {
            return res.status(415).json({ error: "Unsupported file type! Only PDF is allowed." });
        }

        if (fileSize > 10485760) {
            return res.status(413).json({ error: "File is too large! Maximum is 10MB." });
        }

        const bucket = "flux-ai-bucket";
        const key = `uploads/${uuidv4()}-${fileName}`;

        const uploadUrl = await getPresignedUploadUrl(bucket, key);

        logger.info({ bucket, key }, "Generated presigned URL");

        res.json({
            uploadUrl,
            key,
            bucket
        });
    } catch (error) {
        logger.error({ error }, "Error generating presigned URL");
        res.status(500).json({ error: "Failed to generate upload URL" });
    }
});
