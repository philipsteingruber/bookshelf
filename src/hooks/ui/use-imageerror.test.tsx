import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useImageError } from "./use-imageerror";

describe("useImageError", () => {
  describe("Initial state", () => {
    it("should return imageError as false initially", () => {
      const { result } = renderHook(() =>
        useImageError("https://example.com/image.jpg"),
      );

      expect(result.current.imageError).toBe(false);
    });

    it("should return imageError as false when imageUrl is null", () => {
      const { result } = renderHook(() => useImageError(null));

      expect(result.current.imageError).toBe(false);
    });
  });

  describe("Error handling", () => {
    it("should set imageError to true when handleImageError is called", () => {
      const { result } = renderHook(() =>
        useImageError("https://example.com/image.jpg"),
      );

      act(() => {
        result.current.handleImageError();
      });

      expect(result.current.imageError).toBe(true);
    });

    it("should keep imageError true when handleImageError called and URL unchanged", () => {
      const { result } = renderHook(() =>
        useImageError("https://example.com/image.jpg"),
      );

      act(() => {
        result.current.handleImageError();
      });

      expect(result.current.imageError).toBe(true);

      // Call handleImageError again with the same URL
      act(() => {
        result.current.handleImageError();
      });

      expect(result.current.imageError).toBe(true);
    });
  });

  describe("URL change behavior", () => {
    it("should auto-reset imageError to false when imageUrl changes", () => {
      const { result, rerender } = renderHook(
        ({ url }) => useImageError(url),
        { initialProps: { url: "https://example.com/image1.jpg" } },
      );

      // Trigger error for the first URL
      act(() => {
        result.current.handleImageError();
      });

      expect(result.current.imageError).toBe(true);

      // Change the URL - error should auto-reset
      rerender({ url: "https://example.com/image2.jpg" });

      expect(result.current.imageError).toBe(false);
    });

    it("should not show error when failed URL doesn't match current URL", () => {
      const { result, rerender } = renderHook(
        ({ url }) => useImageError(url),
        { initialProps: { url: "https://example.com/image1.jpg" } },
      );

      // Trigger error for the first URL
      act(() => {
        result.current.handleImageError();
      });

      expect(result.current.imageError).toBe(true);

      // Change to a new URL
      rerender({ url: "https://example.com/image2.jpg" });

      // The failed URL (image1) doesn't match current URL (image2), so no error
      expect(result.current.imageError).toBe(false);

      // Change back to the originally failed URL - error should still be tracked
      rerender({ url: "https://example.com/image1.jpg" });

      // The failed URL is still stored, so error shows again
      expect(result.current.imageError).toBe(true);
    });
  });
});
