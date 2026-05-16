import { TRPCError } from "@trpc/server";
import { UTApi } from "uploadthing/server";

export const extractFileKeyFromUrl = (url: string): string | null => {
  try {
    const parsedUrl = new URL(url);
    const pathSegments = parsedUrl.pathname.split("/");
    // The key is the last segment after "/f/"
    const fIndex = pathSegments.indexOf("f");
    if (fIndex !== -1 && pathSegments[fIndex + 1]) {
      return pathSegments[fIndex + 1];
    }
    return null;
  } catch {
    return null;
  }
};

export const isUploadThingUrl = (url: string): boolean => {
  return extractFileKeyFromUrl(url) !== null;
};

export const uploadCoverFromUrl = async (url: string): Promise<string> => {
  const utApi = new UTApi();
  const result = await utApi.uploadFilesFromUrl(url);

  if (result.error || !result.data) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Could not fetch the cover image from the provided URL. Please check the URL or upload an image directly.",
    });
  }

  return result.data.ufsUrl;
};
