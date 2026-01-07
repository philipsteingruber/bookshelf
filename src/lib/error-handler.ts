import { TRPCClientErrorLike } from "@trpc/client";
import { toast } from "sonner";

import type { AppRouter } from "@/trpc/routers/_app";

/**
 * Centralized TRPC error handler for consistent error messaging
 * @param error - The TRPC error from a mutation or query
 * @param context - Optional context string to include in console error (e.g., "Book creation")
 */
export const handleTRPCError = (
  error: TRPCClientErrorLike<AppRouter>,
  context?: string,
) => {
  // Handle different error types with user-friendly messages
  if (error.data?.code === "CONFLICT") {
    // Server sends specific messages for conflicts (ISBN, series, etc.)
    toast.error(error.message);
  } else if (error.message.includes("unique constraint")) {
    toast.error("This item already exists in your library.");
  } else if (
    error.message.includes("network") ||
    error.message.includes("fetch")
  ) {
    toast.error("Network error. Please check your connection and try again.");
  } else if (error.data?.code === "UNAUTHORIZED") {
    toast.error("Please sign in to continue.");
  } else if (error.data?.code === "FORBIDDEN") {
    toast.error("You don't have permission to do that.");
  } else if (error.data?.code === "NOT_FOUND") {
    toast.error("The requested item was not found.");
  } else if (error.data?.code === "BAD_REQUEST") {
    toast.error("Invalid information. Please check your entries.");
  } else {
    toast.error("Something went wrong. Please try again or contact support.");
  }

  // Log the full error for debugging
  if (context) {
    console.error(`${context} failed:`, error);
  } else {
    console.error("Operation failed:", error);
  }
};

/**
 * Centralized upload error handler for file uploads (UploadThing)
 * @param error - The upload error
 * @param context - Optional context string (e.g., "Cover upload")
 */
export const handleUploadError = (error: Error, context?: string) => {
  // Provide specific error messages based on error type
  if (
    error.message.includes("file too large") ||
    error.message.includes("FileSizeMismatch")
  ) {
    toast.error("Image too large. Please use an image under 4MB.");
  } else if (
    error.message.includes("file type") ||
    error.message.includes("InvalidFileType")
  ) {
    toast.error("Invalid file type. Please upload a JPG or PNG image.");
  } else if (
    error.message.includes("network") ||
    error.message.includes("fetch")
  ) {
    toast.error("Network error. Please check your connection and try again.");
  } else {
    toast.error("Upload failed. Please try again.");
  }

  // Log the full error for debugging
  if (context) {
    console.error(`${context} failed:`, error);
  } else {
    console.error("Upload failed:", error);
  }
};
