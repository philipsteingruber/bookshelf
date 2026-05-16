# Cover Image URL Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `CoverDropzone` with a `CoverSection` component that offers both a file-upload tab and a URL-input tab on the create and edit book forms.

**Architecture:** Rename `cover-dropzone.tsx` to `cover-section.tsx` and rewrite it with ShadCN Tabs. A `CoverValue` discriminated union replaces the separate `file`/`removeCover` states in both parent forms. Both forms update their `onSubmit` to branch on `coverValue.type`.

**Tech Stack:** React, ShadCN UI (Tabs, Input), react-dropzone, zod v4, Vitest + React Testing Library

---

## File Map

| Action          | Path                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| Create (shadcn) | `src/components/ui/tabs.tsx`                                            |
| Create          | `src/components/books/create-form/form-sections/cover-section.tsx`      |
| Create          | `src/components/books/create-form/form-sections/cover-section.test.tsx` |
| Modify          | `src/components/books/create-form.tsx`                                  |
| Modify          | `src/components/books/edit-form/edit-form.tsx`                          |
| Delete          | `src/components/books/create-form/form-sections/cover-dropzone.tsx`     |

---

## Task 1: Install ShadCN Tabs

**Files:**

- Create: `src/components/ui/tabs.tsx`

- [ ] **Step 1: Add the Tabs component**

```bash
pnpm dlx shadcn@latest add tabs
```

Expected: `src/components/ui/tabs.tsx` created with no errors.

- [ ] **Step 2: Verify the file exists**

```bash
ls src/components/ui/tabs.tsx
```

Expected: file listed.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/tabs.tsx
git commit -m "chore: add shadcn tabs component"
```

---

## Task 2: Write failing tests for `CoverSection`

**Files:**

- Create: `src/components/books/create-form/form-sections/cover-section.test.tsx`

- [ ] **Step 1: Create the test file**

Create `src/components/books/create-form/form-sections/cover-section.test.tsx` with the following content:

```tsx
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
      await user.click(screen.getByRole("button"));
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
      await user.click(screen.getByRole("button"));
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
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests — expect failure (module not found)**

```bash
pnpm vitest run src/components/books/create-form/form-sections/cover-section.test.tsx
```

Expected: test run fails with an error like `Cannot find module './cover-section'`.

---

## Task 3: Implement `CoverSection`

**Files:**

- Create: `src/components/books/create-form/form-sections/cover-section.tsx`

- [ ] **Step 1: Create the component file**

Create `src/components/books/create-form/form-sections/cover-section.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Upload, XIcon } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import z from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useImageError } from "@/hooks/ui";
import { cn } from "@/lib/utils";

export type CoverValue =
  | { type: "file"; file: File }
  | { type: "url"; url: string }
  | { type: "removed" }
  | { type: "unchanged" };

interface CoverSectionProps {
  coverValue: CoverValue;
  onCoverChange: (value: CoverValue) => void;
  isUploading: boolean;
  disabled?: boolean;
  existingUrl?: string | null;
}

const CoverSection = ({
  coverValue,
  onCoverChange,
  isUploading,
  disabled,
  existingUrl,
}: CoverSectionProps): React.ReactElement => {
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  const file = coverValue.type === "file" ? coverValue.file : null;

  const blobUrl = useMemo(() => {
    return file ? URL.createObjectURL(file) : null;
  }, [file]);

  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  const uploadPreviewUrl = coverValue.type === "removed" ? null : (blobUrl ?? existingUrl ?? null);

  const urlPreviewUrl = useMemo(() => {
    if (!urlInput) return null;
    return z.url().safeParse(urlInput).success ? urlInput : null;
  }, [urlInput]);

  const { imageError: urlImageError, handleImageError: handleUrlImageError } = useImageError(urlPreviewUrl);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onCoverChange({ type: "file", file: acceptedFiles[0] });
      }
    },
    [onCoverChange],
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (coverValue.type === "file") {
        onCoverChange({ type: "unchanged" });
      } else {
        onCoverChange({ type: "removed" });
      }
    },
    [coverValue.type, onCoverChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
    maxFiles: 1,
    maxSize: 4 * 1024 * 1024,
    multiple: false,
    disabled,
    onDrop,
    onDropRejected: (fileRejections) => {
      const rejection = fileRejections[0];
      const error = rejection?.errors[0];
      if (error?.code === "file-too-large") {
        toast.error("File is too large", { description: "Maximum size is 4MB." });
      } else if (error?.code === "file-invalid-type") {
        toast.error("Invalid file type", {
          description: "Please upload a PNG, JPG, or WebP image.",
        });
      } else {
        toast.error("Could not upload file", {
          description: error?.message ?? "Unknown error",
        });
      }
    },
  });

  const handleTabChange = (_value: string): void => {
    onCoverChange({ type: "unchanged" });
    setUrlInput("");
    setUrlError(null);
  };

  const handleUrlBlur = (): void => {
    if (!urlInput) {
      setUrlError(null);
      return;
    }
    if (!z.url().safeParse(urlInput).success) {
      setUrlError("Please enter a valid URL.");
    } else {
      setUrlError(null);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value;
    setUrlInput(val);
    onCoverChange(val ? { type: "url", url: val } : { type: "unchanged" });
  };

  return (
    <div className="mt-4 flex flex-col items-start gap-y-2">
      <Label>Cover Image</Label>
      <Tabs defaultValue="upload" className="w-full" onValueChange={handleTabChange}>
        <TabsList className="mb-2">
          <TabsTrigger value="upload">Upload File</TabsTrigger>
          <TabsTrigger value="url">Enter URL</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <div
            {...getRootProps()}
            className={cn(
              "relative flex min-h-[180px] w-full cursor-pointer flex-col items-center justify-center",
              isDragActive
                ? "border-primary bg-primary/5 border"
                : "border-muted-foreground/25 hover:border-primary/50 border",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input {...getInputProps()} />
            {uploadPreviewUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uploadPreviewUrl} alt="Cover Preview" className="max-h-[160px] rounded-md object-contain" />
                {isUploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/50">
                    <Spinner className="size-6 text-white" />
                  </div>
                )}
                {!isUploading && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    className="absolute -top-2 -right-2"
                    onClick={handleRemove}
                    disabled={disabled}
                  >
                    <XIcon className="size-4" />
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground flex flex-col items-center gap-y-2">
                <Upload className="size-10" />
                <div className="text-center">
                  <p className="font-medium">{isDragActive ? "Drop image here" : "Drag & drop an image"}</p>
                  <p className="text-sm">or click to select</p>
                </div>
                <p className="text-xs">PNG, JPG, JPEG, WebP - Max 4MB</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="url">
          <div className="flex flex-col gap-y-3">
            <Input
              type="url"
              placeholder="https://example.com/cover.jpg"
              value={urlInput}
              onChange={handleUrlChange}
              onBlur={handleUrlBlur}
              disabled={disabled}
            />
            {urlError && <p className="text-destructive text-sm">{urlError}</p>}
            {urlPreviewUrl && (
              <div className="flex flex-col items-center gap-y-2">
                {urlImageError ? (
                  <p className="text-muted-foreground text-sm">
                    Could not preview image from this URL. The cover will still be saved.
                  </p>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urlPreviewUrl}
                    alt="Cover Preview"
                    className="max-h-[160px] rounded-md object-contain"
                    onError={handleUrlImageError}
                  />
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CoverSection;
```

- [ ] **Step 2: Run the tests**

```bash
pnpm vitest run src/components/books/create-form/form-sections/cover-section.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/books/create-form/form-sections/cover-section.tsx \
        src/components/books/create-form/form-sections/cover-section.test.tsx
git commit -m "feat(books): add CoverSection component with upload and URL tabs"
```

---

## Task 4: Update `create-form.tsx`

**Files:**

- Modify: `src/components/books/create-form.tsx`

- [ ] **Step 1: Replace `pendingCoverFile` state and update imports**

Open `src/components/books/create-form.tsx`.

Replace the import line:

```ts
import CoverDropzone from "@/components/books/create-form/form-sections/cover-dropzone";
```

with:

```ts
import CoverSection, { type CoverValue } from "@/components/books/create-form/form-sections/cover-section";
```

- [ ] **Step 2: Replace component state**

Replace:

```ts
const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
```

with:

```ts
const [coverValue, setCoverValue] = useState<CoverValue>({ type: "unchanged" });
```

- [ ] **Step 3: Update `onSubmit`**

Replace the entire `onSubmit` function body with:

```ts
const onSubmit = async (data: z.infer<typeof createBookInputSchema>): Promise<void> => {
  let coverUrl = "";

  if (coverValue.type === "file") {
    try {
      const uploadResult = await startUpload([coverValue.file]);
      if (!uploadResult?.length) return;
      coverUrl = uploadResult[0].ufsUrl;
    } catch {
      return;
    }
  } else if (coverValue.type === "url") {
    coverUrl = coverValue.url;
  }

  createBook({ ...data, coverUrl });
};
```

- [ ] **Step 4: Update the Reset button's onClick**

Replace:

```ts
onClick={() => {
  form.reset();
  setPendingCoverFile(null);
}}
```

with:

```ts
onClick={() => {
  form.reset();
  setCoverValue({ type: "unchanged" });
}}
```

- [ ] **Step 5: Replace the `<CoverDropzone>` JSX**

Replace:

```tsx
<CoverDropzone
  file={pendingCoverFile}
  onFileSelect={setPendingCoverFile}
  disabled={isCreatingBook || isUploading}
  isUploading={isUploading}
/>
```

with:

```tsx
<CoverSection
  coverValue={coverValue}
  onCoverChange={setCoverValue}
  disabled={isCreatingBook || isUploading}
  isUploading={isUploading}
/>
```

- [ ] **Step 6: Run the type checker**

```bash
pnpm tsc --noEmit
```

Expected: no errors relating to `create-form.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/components/books/create-form.tsx
git commit -m "feat(books): wire CoverSection into create form"
```

---

## Task 5: Update `edit-form.tsx`

**Files:**

- Modify: `src/components/books/edit-form/edit-form.tsx`

- [ ] **Step 1: Replace import**

Replace:

```ts
import CoverDropzone from "@/components/books/create-form/form-sections/cover-dropzone";
```

with:

```ts
import CoverSection, { type CoverValue } from "@/components/books/create-form/form-sections/cover-section";
```

- [ ] **Step 2: Replace component state**

Remove both of these lines:

```ts
const [coverFile, setCoverFile] = useState<File | null>(null);
const [removeCover, setRemoveCover] = useState<boolean>(false);
```

Add in their place:

```ts
const [coverValue, setCoverValue] = useState<CoverValue>({ type: "unchanged" });
```

- [ ] **Step 3: Update `onSubmit`**

Replace the entire `onSubmit` function body with:

```ts
const onSubmit = async (data: z.infer<typeof createFormSchema>): Promise<void> => {
  let coverUrl: string | undefined;

  if (coverValue.type === "file") {
    const uploadResults = await startUpload([coverValue.file]);
    if (!uploadResults?.length) {
      handleUploadError(new Error("Failed to upload cover. Try again."));
      return;
    }
    coverUrl = uploadResults[0].ufsUrl;
  } else if (coverValue.type === "url") {
    coverUrl = coverValue.url;
  } else if (coverValue.type === "removed") {
    coverUrl = "";
  } else {
    coverUrl = undefined;
  }

  updateBook({
    bookId: book.id,
    data: {
      ...data,
      coverUrl,
    },
  });
};
```

- [ ] **Step 4: Remove the `onRemoveExisting` and `handleFileSelect` functions**

Delete both of these functions entirely — they are replaced by `setCoverValue`:

```ts
const onRemoveExisting = (): void => {
  setRemoveCover(true);
};
const handleFileSelect = (file: File | null): void => {
  setCoverFile(file);
  if (file) {
    setRemoveCover(false);
  }
};
```

- [ ] **Step 5: Replace the `<CoverDropzone>` JSX**

Replace:

```tsx
<CoverDropzone
  file={coverFile}
  onFileSelect={handleFileSelect}
  onRemoveExisting={onRemoveExisting}
  isUploading={isUploading}
  existingUrl={!removeCover ? book.coverUrl : undefined}
  disabled={isUpdatingBook || isUploading}
/>
```

with:

```tsx
<CoverSection
  coverValue={coverValue}
  onCoverChange={setCoverValue}
  isUploading={isUploading}
  existingUrl={book.coverUrl}
  disabled={isUpdatingBook || isUploading}
/>
```

- [ ] **Step 6: Run the type checker**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/books/edit-form/edit-form.tsx
git commit -m "feat(books): wire CoverSection into edit form"
```

---

## Task 6: Delete `cover-dropzone.tsx` and final verification

**Files:**

- Delete: `src/components/books/create-form/form-sections/cover-dropzone.tsx`

- [ ] **Step 1: Verify no remaining imports of `cover-dropzone`**

```bash
grep -r "cover-dropzone" src/
```

Expected: no output (zero matches).

- [ ] **Step 2: Delete the old file**

```bash
rm src/components/books/create-form/form-sections/cover-dropzone.tsx
```

- [ ] **Step 3: Run full type check and test suite**

```bash
pnpm tsc --noEmit && pnpm vitest run
```

Expected: zero type errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(books): remove CoverDropzone now replaced by CoverSection"
```
