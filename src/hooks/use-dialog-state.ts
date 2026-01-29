import { useCallback, useState } from "react";

interface UseDialogStateOptions {
  onClose?: () => void;
  preventClose?: boolean;
}
interface UseDialogStateReturn {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  handleOpenChange: (open: boolean) => void;
}

export const useDialogState = (
  options: UseDialogStateOptions = {},
): UseDialogStateReturn => {
  const { onClose, preventClose = false } = options;
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && preventClose) return;

      setIsOpen(open);

      if (!open && onClose) {
        onClose();
      }
    },
    [onClose, preventClose],
  );

  return { isOpen, setIsOpen, handleOpenChange } as const;
};
