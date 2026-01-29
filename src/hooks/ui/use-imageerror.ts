import { useCallback, useState } from "react";

export const useImageError = (
  imageUrl: string | null,
): {
  imageError: boolean;
  handleImageError: () => void;
} => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const handleImageError = useCallback(() => {
    setFailedUrl(imageUrl);
  }, [imageUrl]);

  const imageError = !!failedUrl && failedUrl === imageUrl;

  return { imageError, handleImageError } as const;
};
