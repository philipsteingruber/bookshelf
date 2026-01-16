import {
  generateReactHelpers,
  generateUploadButton,
  generateUploadDropzone,
} from "@uploadthing/react";

import type { BookshelfFileRouter } from "@/app/api/uploadthing/core";

export const UploadButton = generateUploadButton<BookshelfFileRouter>();
export const UploadDropzone = generateUploadDropzone<BookshelfFileRouter>();
export const { useUploadThing } = generateReactHelpers<BookshelfFileRouter>();
