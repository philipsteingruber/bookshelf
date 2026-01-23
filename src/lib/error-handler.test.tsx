import type { TRPCClientErrorLike } from "@trpc/client";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppRouter } from "@/trpc/routers/_app";

import { handleTRPCError, handleUploadError } from "./error-handler";
import { createMockTRPCError } from "./test-utils";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("error-handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("handleTRPCError", () => {
    it("should show appropriate toast for NOT_FOUND errors", () => {
      const error = createMockTRPCError("NOT_FOUND");

      handleTRPCError(error as TRPCClientErrorLike<AppRouter>);

      expect(toast.error).toHaveBeenCalledWith(
        "The requested item was not found.",
      );
    });

    it("should show appropriate toast for FORBIDDEN errors", () => {
      const error = createMockTRPCError("FORBIDDEN");

      handleTRPCError(error as TRPCClientErrorLike<AppRouter>);

      expect(toast.error).toHaveBeenCalledWith(
        "You don't have permission to do that.",
      );
    });

    it("should show appropriate toast for BAD_REQUEST errors", () => {
      const error = createMockTRPCError("BAD_REQUEST");

      handleTRPCError(error as TRPCClientErrorLike<AppRouter>);

      expect(toast.error).toHaveBeenCalledWith(
        "Invalid information. Please check your entries.",
      );
    });

    it("should show generic error toast for unknown error codes", () => {
      const error = createMockTRPCError("INTERNAL_SERVER_ERROR");

      handleTRPCError(error as TRPCClientErrorLike<AppRouter>);

      expect(toast.error).toHaveBeenCalledWith(
        "Something went wrong. Please try again or contact support.",
      );
    });
  });

  describe("handleUploadError", () => {
    it("should show appropriate toast for upload errors", () => {
      const error = new Error("Something unexpected happened");

      handleUploadError(error);

      expect(toast.error).toHaveBeenCalledWith(
        "Upload failed. Please try again.",
      );
    });

    it("should handle file size limit errors", () => {
      const error = new Error("file too large");

      handleUploadError(error);

      expect(toast.error).toHaveBeenCalledWith(
        "Image too large. Please use an image under 4MB.",
      );
    });

    it("should handle file type errors", () => {
      const error = new Error("InvalidFileType");

      handleUploadError(error);

      expect(toast.error).toHaveBeenCalledWith(
        "Invalid file type. Please upload a JPG or PNG image.",
      );
    });
  });
});
