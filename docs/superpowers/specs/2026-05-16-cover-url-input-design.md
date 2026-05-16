# Cover Image URL Input — Design Spec

**Date:** 2026-05-16

## Summary

Allow users to supply a cover image either by uploading a file (existing behaviour) or by entering a direct URL. Both options are available on the create-book form and the edit-book form, presented as two tabs inside the cover section.

---

## Architecture

`src/components/books/create-form/form-sections/cover-dropzone.tsx` is renamed to `cover-section.tsx`. The component is renamed from `CoverDropzone` to `CoverSection`. All other files that import `CoverDropzone` are updated accordingly.

No new files are introduced. The change is self-contained to the component, its two parent forms, and their import paths.

---

## `CoverSection` Component

### Shared value type

```ts
type CoverValue =
  | { type: "file"; file: File }
  | { type: "url"; url: string }
  | { type: "removed" } // user explicitly cleared the cover
  | { type: "unchanged" }; // no interaction — used as the initial/reset state
```

### Props

```ts
interface CoverSectionProps {
  coverValue: CoverValue;
  onCoverChange: (value: CoverValue) => void;
  isUploading: boolean;
  disabled?: boolean;
  existingUrl?: string | null; // edit form only — the book's current cover URL
}
```

### Internal state

- `activeTab: "upload" | "url"` — always initialises to `"upload"`.
- `urlInput: string` — local state for the URL text field, independent of the parent's `coverValue`.

### Upload tab

Identical to the current `CoverDropzone` behaviour:

- Drag-and-drop or click-to-select, accepting PNG / JPG / JPEG / WebP up to 4 MB.
- If `existingUrl` is set and no file has been selected, the existing cover image is shown with a remove button.
- Selecting a file fires `onCoverChange({ type: "file", file })`.
- Clicking remove fires `onCoverChange({ type: "removed" })`.
- Upload progress overlay shown while `isUploading` is true.

### URL tab

- A labelled text input for the image URL.
- Validated on blur against `z.url()`. An inline error message is shown below the input if validation fails.
- When the input contains a URL that passes validation, a preview image is rendered below the input using `<img>` + the existing `useImageError` hook.
- If the image fails to load (network error, CORS, etc.), the preview is replaced with: `"Could not preview image from this URL. The cover will still be saved."` The URL remains submittable.
- Every change to the input fires `onCoverChange({ type: "url", url })`.

### Tab switching

Switching **upload → URL**:

- Clears the file selection (fires `onCoverChange({ type: "unchanged" })`).
- Resets `urlInput` to `""`.

Switching **URL → upload**:

- Clears the URL input (fires `onCoverChange({ type: "unchanged" })`).
- Resets `urlInput` to `""`.

The `existingUrl` display in the upload tab is not affected by switching — it persists until the user explicitly removes it.

---

## Parent Form Changes

### `create-form.tsx`

- Remove `pendingCoverFile` state.
- Add `coverValue` state, initialised to `{ type: "unchanged" }`.
- Pass `coverValue` and `onCoverChange` to `CoverSection`.
- Update `onSubmit`:

```ts
let coverUrl = "";

if (coverValue.type === "file") {
  const uploadResult = await startUpload([coverValue.file]);
  if (!uploadResult?.length) return; // upload error already toasted
  coverUrl = uploadResult[0].ufsUrl;
} else if (coverValue.type === "url") {
  coverUrl = coverValue.url;
}
// "unchanged" and "removed" both result in no cover (empty string)

createBook({ ...data, coverUrl });
```

- Reset handler also resets `coverValue` to `{ type: "unchanged" }`.

### `edit-form.tsx`

- Remove `coverFile` and `removeCover` state.
- Add `coverValue` state, initialised to `{ type: "unchanged" }`.
- Pass `coverValue`, `onCoverChange`, and `existingUrl={book.coverUrl}` to `CoverSection`.
- Update `onSubmit`:

```ts
let coverUrl: string | undefined;

if (coverValue.type === "file") {
  const uploadResult = await startUpload([coverValue.file]);
  if (!uploadResult?.length) {
    handleUploadError(new Error("Failed to upload cover. Try again."));
    return;
  }
  coverUrl = uploadResult[0].ufsUrl;
} else if (coverValue.type === "url") {
  coverUrl = coverValue.url;
} else if (coverValue.type === "removed") {
  coverUrl = ""; // explicit removal — backend clears the field
} else {
  coverUrl = undefined; // "unchanged" — backend keeps existing value
}

updateBook({ bookId: book.id, data: { ...data, coverUrl } });
```

---

## Validation

- **Client-side:** URL format validated with `z.url()` on blur; inline error shown on failure.
- **Server-side:** No new validation added. The tRPC router already accepts `coverUrl` as an optional URL string.
- **Image reachability:** Not validated. A URL that is syntactically valid but points to a broken image is stored as-is. The book detail page already handles broken cover images gracefully via `useImageError` + `BookCoverFallback`.

---

## Out of Scope

- Fetching / scraping the cover URL automatically from an external source.
- Any server-side proxying or caching of external cover images.
- Validating that the URL points to an image content type.
