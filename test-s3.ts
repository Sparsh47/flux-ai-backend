import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
    region: "us-east-1",
    endpoint: "http://localhost:8333",
    credentials: { accessKeyId: "any", secretAccessKey: "any" },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED"
});

async function run() {
    const command = new PutObjectCommand({ Bucket: "flux-ai-bucket", Key: "test" });
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    console.log(url);
}
run();
