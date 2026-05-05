import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/require-user";
import { getTotalPdfBytesForUser } from "@/lib/storage-quota";
import {
  getMaxStorageBytesPerUser,
  getMaxUploadBytes,
} from "@/lib/upload-config";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const usedBytes = await getTotalPdfBytesForUser(user.id);
  const maxStorageBytesPerUser = getMaxStorageBytesPerUser();
  const maxUploadBytes = getMaxUploadBytes();

  return NextResponse.json({
    usedBytes,
    maxStorageBytesPerUser,
    maxUploadBytes,
    remainingBytes: Math.max(0, maxStorageBytesPerUser - usedBytes),
  });
}
