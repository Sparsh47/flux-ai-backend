import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const isDev = process.env.NODE_ENV !== "production";

const s3Client = new S3Client({
    region: "us-east-1",
    endpoint: process.env.S3_ENDPOINT || "http://localhost:8333",
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "any",
        secretAccessKey: process.env.S3_SECRET_KEY || "any",
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED"
});

export const getPresignedUploadUrl = async (bucket: string, key: string) => {
    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key
    });

    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

export const getFileStream = async (bucket: string, key: string) => {
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key
    });

    const response = await s3Client.send(command);
    return response.Body;
}

export default s3Client;