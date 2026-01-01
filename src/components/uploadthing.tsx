import { BookshelfFileRouter } from "@/app/api/uploadthing/core";
import {
  generateUploadButton,
  generateUploadDropzone,
} from "@uploadthing/react";

export const UploadButton = generateUploadButton<BookshelfFileRouter>();
export const UploadDropzone = generateUploadDropzone<BookshelfFileRouter>();
