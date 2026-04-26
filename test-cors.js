import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
    region: "us-east-1",
    endpoint: "http://localhost:8333",
    credentials: { accessKeyId: "any", secretAccessKey: "any" },
    forcePathStyle: true
});

async function run() {
    try {
        await s3.send(new PutBucketCorsCommand({
            Bucket: "flux-ai-bucket",
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedHeaders: ["*"],
                        AllowedMethods: ["PUT", "POST", "GET", "HEAD"],
                        AllowedOrigins: ["*"],
                        ExposeHeaders: ["ETag"]
                    }
                ]
            }
        }));
        console.log("CORS updated!");
    } catch(err) {
        console.error("Failed", err);
    }
}
run();
