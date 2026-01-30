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
