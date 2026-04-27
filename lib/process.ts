import pLimit from "p-limit";
import fs from "fs";
import { logger } from "../config/logger.js";
import { Readable } from "stream";
import { getFileStream } from "../config/s3.js";
import { PDFParse } from "pdf-parse";
import { buildEmbeddings } from "../buildEmbeddings.js";

export const limit = pLimit(3);

export async function processFile(fileKey: string): Promise<void> {
    if (!fileKey) {
        logger.error('File key is undefined')
        return
    }

    const fileStart = performance.now()
    const safeKey = fileKey.replace(/[\/\\]/g, '_')
    const localFilePath = `uploads/${safeKey}.txt`

    try {
        const downloadStart = performance.now()
        const stream = await getFileStream(process.env.S3_BUCKET_NAME as string, fileKey)
        const fileBuffer = await streamToBuffer(stream as Readable)
        logger.info({ fileKey, ms: (performance.now() - downloadStart).toFixed(0) }, 'Downloaded from S3')

        const parseStart = performance.now()
        const parser = new PDFParse({ data: fileBuffer })
        const data = await parser.getText()
        logger.info({ fileKey, ms: (performance.now() - parseStart).toFixed(0) }, 'Parsed PDF')

        if (!fs.existsSync('uploads')) fs.mkdirSync('uploads')

        await fs.promises.writeFile(localFilePath, data.text, 'utf8')
        await buildEmbeddings(localFilePath, fileKey)

        logger.info({ fileKey, totalMs: (performance.now() - fileStart).toFixed(0) }, 'File processed')

    } finally {
        try {
            await fs.promises.unlink(localFilePath)
            logger.info({ fileKey }, 'Temp file deleted')
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