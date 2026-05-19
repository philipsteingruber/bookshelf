export const DEFAULT_CALIBRE_DB = "E:\\Calibre Library\\metadata.db";
export const DEFAULT_CWA_DB = "E:\\cwa\\config\\app.db";
export const GOODREADS_BASE = "https://www.goodreads.com/book/show";

export function normaliseGoodreadsUrl(url: string): string {
  return url.replace(/(\/book\/show\/)(\d+)[^/]*$/, "$1$2");
}

export function extractErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  // Prisma errors include file/line context before the actual message — take the last non-empty line
  const lines = err.message.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.at(-1) ?? err.message;
}
