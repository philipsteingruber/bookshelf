import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Page from "./page";

// --- Mocks ---

// jsdom doesn't implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useAuth: vi.fn(() => ({ userId: "user_1", isSignedIn: true, isLoaded: true })),
  RedirectToSignIn: () => null,
}));

const mockUseMutation = vi.fn(() => ({
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock("@/trpc/client", () => ({
  trpc: {
    recommendations: {
      chat: {
        useMutation: () => mockUseMutation(),
      },
    },
  },
}));

// --- Helpers ---

const STORAGE_KEY = "bookshelf-recommendations-user_1";

beforeEach(() => {
  localStorage.clear();
});

function seedLocalStorage(messages: unknown[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, includeHistory: true }));
}

function makeAnswerMessage(text: string) {
  return { id: "msg-1", role: "assistant", type: "answer", text, books: [] };
}

// --- Tests ---

describe("Recommendations page — answer message markdown rendering", () => {
  it("renders bold text as <strong> instead of literal asterisks", () => {
    seedLocalStorage([makeAnswerMessage("This is **important** information.")]);
    render(<Page />);

    expect(screen.queryByText(/\*\*important\*\*/)).not.toBeInTheDocument();
    expect(screen.getByText("important")).toBeInTheDocument();
    expect(screen.getByText("important").tagName).toBe("STRONG");
  });

  it("renders an unordered list as <ul>/<li> elements", () => {
    seedLocalStorage([makeAnswerMessage("Options:\n- First\n- Second\n- Third")]);
    render(<Page />);

    expect(screen.getByText("First").closest("li")).toBeInTheDocument();
    expect(screen.getByText("Second").closest("li")).toBeInTheDocument();
    expect(screen.getByText("Third").closest("li")).toBeInTheDocument();
  });

  it("renders plain text answers without modification", () => {
    seedLocalStorage([makeAnswerMessage("Just a simple answer with no markdown.")]);
    render(<Page />);

    expect(screen.getByText("Just a simple answer with no markdown.")).toBeInTheDocument();
  });
});
