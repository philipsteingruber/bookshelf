import {
  generateUploadButton,
  generateUploadDropzone,
} from "@uploadthing/react";

import type { BookshelfFileRouter } from "@/app/api/uploadthing/core";

export const UploadButton = generateUploadButton<BookshelfFileRouter>();
export const UploadDropzone = generateUploadDropzone<BookshelfFileRouter>();
