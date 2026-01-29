import { describe, it } from "vitest";


describe("useImageError", () => {
  describe("Initial state", () => {
    it.todo("should return imageError as false initially");

    it.todo("should return imageError as false when imageUrl is null");
  });

  describe("Error handling", () => {
    it.todo("should set imageError to true when handleImageError is called");

    it.todo(
      "should keep imageError true when handleImageError called and URL unchanged",
    );
  });

  describe("URL change behavior", () => {
    it.todo("should auto-reset imageError to false when imageUrl changes");

    it.todo(
      "should not show error when failed URL doesn't match current URL",
    );
  });
});
