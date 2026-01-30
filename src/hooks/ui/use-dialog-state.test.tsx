import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDialogState } from "./use-dialog-state";

describe("useDialogState", () => {
  describe("Initial state and basic operations", () => {
    it("should return isOpen as false initially", () => {
      const { result } = renderHook(() => useDialogState());

      expect(result.current.isOpen).toBe(false);
    });

    it("should update isOpen when setIsOpen is called directly", () => {
      const { result } = renderHook(() => useDialogState());

      act(() => {
        result.current.setIsOpen(true);
      });

      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.setIsOpen(false);
      });

      expect(result.current.isOpen).toBe(false);
    });

    it("should open dialog when handleOpenChange is called with true", () => {
      const { result } = renderHook(() => useDialogState());

      act(() => {
        result.current.handleOpenChange(true);
      });

      expect(result.current.isOpen).toBe(true);
    });

    it("should close dialog when handleOpenChange is called with false", () => {
      const { result } = renderHook(() => useDialogState());

      // First open the dialog
      act(() => {
        result.current.handleOpenChange(true);
      });

      expect(result.current.isOpen).toBe(true);

      // Then close it
      act(() => {
        result.current.handleOpenChange(false);
      });

      expect(result.current.isOpen).toBe(false);
    });
  });

  describe("onClose callback", () => {
    it("should call onClose callback when dialog closes", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useDialogState({ onClose }));

      // Open the dialog
      act(() => {
        result.current.handleOpenChange(true);
      });

      expect(onClose).not.toHaveBeenCalled();

      // Close the dialog
      act(() => {
        result.current.handleOpenChange(false);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should not call onClose callback when dialog opens", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useDialogState({ onClose }));

      act(() => {
        result.current.handleOpenChange(true);
      });

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("preventClose option", () => {
    it("should prevent closing when preventClose is true", () => {
      const { result } = renderHook(() =>
        useDialogState({ preventClose: true }),
      );

      // Open the dialog
      act(() => {
        result.current.handleOpenChange(true);
      });

      expect(result.current.isOpen).toBe(true);

      // Try to close - should be prevented
      act(() => {
        result.current.handleOpenChange(false);
      });

      expect(result.current.isOpen).toBe(true);
    });

    it("should allow opening even when preventClose is true", () => {
      const { result } = renderHook(() =>
        useDialogState({ preventClose: true }),
      );

      act(() => {
        result.current.handleOpenChange(true);
      });

      expect(result.current.isOpen).toBe(true);
    });

    it("should allow closing when preventClose is false (default behavior)", () => {
      const { result } = renderHook(() => useDialogState());

      // Open the dialog
      act(() => {
        result.current.handleOpenChange(true);
      });

      expect(result.current.isOpen).toBe(true);

      // Close the dialog - should work with default preventClose: false
      act(() => {
        result.current.handleOpenChange(false);
      });

      expect(result.current.isOpen).toBe(false);
    });
  });
});
