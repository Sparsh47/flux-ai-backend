import pLimit from "p-limit";
import fs from "fs";
import { logger } from "../config/logger.js";
import { Readable } from "stream";
import { getFileStream } from "../config/s3.js";
import { PDFParse } from "pdf-parse";
import { buildEmbeddings } from "../buildEmbeddings.js";
import { env } from "../schema/env.js";

export const limit = pLimit(3);

export async function processFile(fileKey: string): Promise<any> {
    if (!fileKey) {
        logger.error('File key is undefined')
        throw new Error('File key is undefined')
    }

    const fileStart = performance.now()
    const safeKey = fileKey.replace(/[\/\\]/g, '_')
    const localFilePath = `uploads/${safeKey}.txt`

    try {
        const downloadStart = performance.now()
        const stream = await getFileStream(env.S3_BUCKET_NAME, fileKey)
        const fileBuffer = await streamToBuffer(stream as Readable)
        const downloadTimeMs = performance.now() - downloadStart

        const parseStart = performance.now()
        const parser = new PDFParse({ data: fileBuffer })
        const data = await parser.getText()
        const parseTimeMs = performance.now() - parseStart

        if (!fs.existsSync('uploads')) fs.mkdirSync('uploads')

        await fs.promises.writeFile(localFilePath, data.text, 'utf8')
        const embeddingResults = await buildEmbeddings(localFilePath, fileKey)

        return {
            fileKey,
            downloadTimeMs,
            parseTimeMs,
            ...embeddingResults,
            totalMs: performance.now() - fileStart
        }

    } finally {
        try {
            if (fs.existsSync(localFilePath)) {
                await fs.promises.unlink(localFilePath)
            }
        } catch (err) {
            logger.error({ err, fileKey }, 'Failed to delete temp file')
        }
    }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: any[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}