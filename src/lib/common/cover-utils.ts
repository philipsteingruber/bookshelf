import { TRPCError } from "@trpc/server";
import { put } from "@vercel/blob";

export const isBlobUrl = (url: string): boolean => {
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
};

export const uploadCoverFromUrl = async (url: string): Promise<string> => {
  let response: Response;
  try {
    response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Could not fetch the cover image from the provided URL. Please check the URL or upload an image directly.",
    });
  }

  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "image/jpeg";

  const blob = await put(`covers/${Date.now()}`, buffer, {
    access: "public",
    contentType,
  });

  return blob.url;
};
