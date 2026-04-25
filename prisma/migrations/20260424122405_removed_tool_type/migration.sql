/*
  Warnings:

  - You are about to drop the column `toolUsed` on the `Message` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "toolUsed";

-- DropEnum
DROP TYPE "ToolType";
