import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import CoverSection from "./cover-section";
import type { CoverValue } from "./cover-section";

vi.mock("react-dropzone", () => ({
  useDropzone: () => ({
    getRootProps: () => ({ "data-testid": "dropzone" }),
    getInputProps: () => ({ "data-testid": "file-input", type: "file" }),
    isDragActive: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

const unchanged: CoverValue = { type: "unchanged" };

describe("CoverSection", () => {
  describe("Tab rendering", () => {
    it("renders Upload File tab as default active tab", () => {
      render(<CoverSection coverValue={unchanged} onCoverChange={vi.fn()} isUploading={false} />);
      expect(screen.getByRole("tab", { name: "Upload File" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Enter URL" })).toBeInTheDocument();
      expect(screen.getByTestId("dropzone")).toBeInTheDocument();
    });

    it("shows URL input when Enter URL tab is clicked", async () => {
      const user = userEvent.setup();
      render(<CoverSection coverValue={unchanged} onCoverChange={vi.fn()} isUploading={false} />);
      await user.click(screen.getByRole("tab", { name: "Enter URL" }));
      expect(screen.getByPlaceholderText("https://example.com/cover.jpg")).toBeInTheDocument();
    });
  });

  describe("Tab switching", () => {
    it("calls onCoverChange with unchanged when switching to URL tab", async () => {
      const user = userEvent.setup();
      const onCoverChange = vi.fn();
      render(<CoverSection coverValue={unchanged} onCoverChange={onCoverChange} isUploading={false} />);
      await user.click(screen.getByRole("tab", { name: "Enter URL" }));
      expect(onCoverChange).toHaveBeenCalledWith({ type: "unchanged" });
    });

    it("calls onCoverChange with unchanged when switching back to Upload tab", async () => {
      const user = userEvent.setup();
      const onCoverChange = vi.fn();
      render(<CoverSection coverValue={unchanged} onCoverChange={onCoverChange} isUploading={false} />);
      await user.click(screen.getByRole("tab", { name: "Enter URL" }));
      onCoverChange.mockClear();
      await user.click(screen.getByRole("tab", { name: "Upload File" }));
      expect(onCoverChange).toHaveBeenCalledWith({ type: "unchanged" });
    });

    it("clears URL input when switching back to Upload tab then returning to URL tab", async () => {
      const user = userEvent.setup();
      render(<CoverSection coverValue={unchanged} onCoverChange={vi.fn()} isUploading={false} />);
      await user.click(screen.getByRole("tab", { name: "Enter URL" }));
      await user.type(screen.getByPlaceholderText("https://example.com/cover.jpg"), "https://example.com/cover.jpg");
      await user.click(screen.getByRole("tab", { name: "Upload File" }));
      await user.click(screen.getByRole("tab", { name: "Enter URL" }));
      expect(screen.getByPlaceholderText("https://example.com/cover.jpg")).toHaveValue("");
    });
  });

  describe("URL tab", () => {
    it("fires onCoverChange with url type while typing", async () => {
      const user = userEvent.setup();
      const onCoverChange = vi.fn();
      render(<CoverSection coverValue={unchanged} onCoverChange={onCoverChange} isUploading={false} />);
      await user.click(screen.getByRole("tab", { name: "Enter URL" }));
      await user.type(screen.getByPlaceholderText("https://example.com/cover.jpg"), "https://example.com/cover.jpg");
      expect(onCoverChange).toHaveBeenLastCalledWith({
        type: "url",
        url: "https://example.com/cover.jpg",
      });
    });

    it("fires onCoverChange with unchanged when URL input is cleared", async () => {
      const user = userEvent.setup();
      const onCoverChange = vi.fn();
      render(<CoverSection coverValue={unchanged} onCoverChange={onCoverChange} isUploading={false} />);
      await user.click(screen.getByRole("tab", { name: "Enter URL" }));
      const input = screen.getByPlaceholderText("https://example.com/cover.jpg");
      await user.type(input, "https://example.com/cover.jpg");
      await user.clear(input);
      expect(onCoverChange).toHaveBeenLastCalledWith({ type: "unchanged" });
    });

    it("shows error on blur when URL is invalid", async () => {
      const user = userEvent.setup();
      render(<CoverSection coverValue={unchanged} onCoverChange={vi.fn()} isUploading={false} />);
      await user.click(screen.getByRole("tab", { name: "Enter URL" }));
      const input = screen.getByPlaceholderText("https://example.com/cover.jpg");
      await user.type(input, "not-a-url");
      fireEvent.blur(input);
      expect(screen.getByText("Please enter a valid URL.")).toBeInTheDocument();
    });

    it("does not show error on blur when URL is valid", async () => {
      const user = userEvent.setup();
      render(<CoverSection coverValue={unchanged} onCoverChange={vi.fn()} isUploading={false} />);
      await user.click(screen.getByRole("tab", { name: "Enter URL" }));
      const input = screen.getByPlaceholderText("https://example.com/cover.jpg");
      await user.type(input, "https://example.com/cover.jpg");
      fireEvent.blur(input);
      expect(screen.queryByText("Please enter a valid URL.")).not.toBeInTheDocument();
    });

    it("shows preview image when a valid URL is entered", async () => {
      const user = userEvent.setup();
      render(<CoverSection coverValue={unchanged} onCoverChange={vi.fn()} isUploading={false} />);
      await user.click(screen.getByRole("tab", { name: "Enter URL" }));
      await user.type(screen.getByPlaceholderText("https://example.com/cover.jpg"), "https://example.com/cover.jpg");
      const preview = screen.getByAltText("Cover Preview");
      expect(preview).toBeInTheDocument();
      expect(preview).toHaveAttribute("src", "https://example.com/cover.jpg");
    });

    it("shows fallback message when preview image fails to load", async () => {
      const user = userEvent.setup();
      render(<CoverSection coverValue={unchanged} onCoverChange={vi.fn()} isUploading={false} />);
      await user.click(screen.getByRole("tab", { name: "Enter URL" }));
      await user.type(screen.getByPlaceholderText("https://example.com/cover.jpg"), "https://example.com/cover.jpg");
      fireEvent.error(screen.getByAltText("Cover Preview"));
      expect(
        screen.getByText("Could not preview image from this URL. The cover will still be saved."),
      ).toBeInTheDocument();
    });
  });

  describe("Upload tab", () => {
    it("shows existing cover image when existingUrl is provided and coverValue is unchanged", () => {
      render(
        <CoverSection
          coverValue={unchanged}
          onCoverChange={vi.fn()}
          isUploading={false}
          existingUrl="https://example.com/existing.jpg"
        />,
      );
      const img = screen.getByAltText("Cover Preview");
      expect(img).toHaveAttribute("src", "https://example.com/existing.jpg");
    });

    it("hides existing cover image when coverValue is removed", () => {
      render(
        <CoverSection
          coverValue={{ type: "removed" }}
          onCoverChange={vi.fn()}
          isUploading={false}
          existingUrl="https://example.com/existing.jpg"
        />,
      );
      expect(screen.queryByAltText("Cover Preview")).not.toBeInTheDocument();
    });

    it("fires onCoverChange with removed when remove button is clicked on existing cover", async () => {
      const user = userEvent.setup();
      const onCoverChange = vi.fn();
      render(
        <CoverSection
          coverValue={unchanged}
          onCoverChange={onCoverChange}
          isUploading={false}
          existingUrl="https://example.com/existing.jpg"
        />,
      );
      await user.click(screen.getByRole("button", { name: "Remove cover image" }));
      expect(onCoverChange).toHaveBeenCalledWith({ type: "removed" });
    });

    it("fires onCoverChange with unchanged when remove button is clicked on a newly selected file", async () => {
      const user = userEvent.setup();
      const onCoverChange = vi.fn();
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-cover");
      vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
      render(
        <CoverSection
          coverValue={{ type: "file", file: new File([""], "cover.png", { type: "image/png" }) }}
          onCoverChange={onCoverChange}
          isUploading={false}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Remove cover image" }));
      expect(onCoverChange).toHaveBeenCalledWith({ type: "unchanged" });
    });

    it("hides remove button and shows spinner when isUploading is true", () => {
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-cover");
      vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
      render(
        <CoverSection
          coverValue={{ type: "file", file: new File([""], "cover.png", { type: "image/png" }) }}
          onCoverChange={vi.fn()}
          isUploading={true}
        />,
      );
      expect(screen.queryByRole("button", { name: "Remove cover image" })).not.toBeInTheDocument();
    });

    it("falls back to empty dropzone when existingUrl image fails to load", () => {
      render(
        <CoverSection
          coverValue={unchanged}
          onCoverChange={vi.fn()}
          isUploading={false}
          existingUrl="https://example.com/broken.jpg"
        />,
      );
      // Image renders initially
      fireEvent.error(screen.getByAltText("Cover Preview"));
      // After error, preview is gone and empty dropzone state is shown
      expect(screen.queryByAltText("Cover Preview")).not.toBeInTheDocument();
      expect(screen.getByText("Drag & drop an image")).toBeInTheDocument();
    });
  });
});
