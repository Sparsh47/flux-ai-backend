import { Router, Request, Response } from "express";
import { getPresignedUploadUrl } from "../config/s3.js";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../config/logger.js";

export const uploadRouter = Router();

uploadRouter.post("/presigned-url", async (req: Request, res: Response) => {
    try {
        const { fileName, fileType } = req.body;
        
        if (!fileName) {
            return res.status(400).json({ error: "fileName is required" });
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
