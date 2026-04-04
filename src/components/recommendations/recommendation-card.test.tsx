import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RecommendationBook } from "./recommendation-card";
import { RecommendationCard } from "./recommendation-card";

const makeBook = (
  overrides: Partial<RecommendationBook> = {},
): RecommendationBook => ({
  title: "The Name of the Wind",
  author: "Patrick Rothfuss",
  reason: "A lyrical coming-of-age with a brilliant magic system.",
  type: "standard",
  coverUrl: null,
  pageCount: 662,
  ...overrides,
});

describe("RecommendationCard", () => {
  it("renders title as a Goodreads search link opening in new tab", () => {
    render(<RecommendationCard recommendation={makeBook()} />);
    const link = screen.getByRole("link", { name: "The Name of the Wind" });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("goodreads.com/search"),
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders author name", () => {
    render(<RecommendationCard recommendation={makeBook()} />);
    expect(screen.getByText("Patrick Rothfuss")).toBeInTheDocument();
  });

  it("renders page count when provided", () => {
    render(<RecommendationCard recommendation={makeBook({ pageCount: 662 })} />);
    expect(screen.getByText("662 pages")).toBeInTheDocument();
  });

  it("omits page count when null", () => {
    render(<RecommendationCard recommendation={makeBook({ pageCount: null })} />);
    expect(screen.queryByText(/pages/)).not.toBeInTheDocument();
  });

  it("renders reason text", () => {
    render(<RecommendationCard recommendation={makeBook()} />);
    expect(
      screen.getByText(
        "A lyrical coming-of-age with a brilliant magic system.",
      ),
    ).toBeInTheDocument();
  });

  it("renders 'Safe pick' badge for safe type", () => {
    render(<RecommendationCard recommendation={makeBook({ type: "safe" })} />);
    expect(screen.getByText("Safe pick")).toBeInTheDocument();
  });

  it("renders 'Stretch pick' badge for stretch type", () => {
    render(<RecommendationCard recommendation={makeBook({ type: "stretch" })} />);
    expect(screen.getByText("Stretch pick")).toBeInTheDocument();
  });

  it("renders 'Risky pick' badge for risky type", () => {
    render(<RecommendationCard recommendation={makeBook({ type: "risky" })} />);
    expect(screen.getByText("Risky pick")).toBeInTheDocument();
  });

  it("renders no badge for standard type", () => {
    render(<RecommendationCard recommendation={makeBook({ type: "standard" })} />);
    expect(screen.queryByText(/pick/i)).not.toBeInTheDocument();
  });

  it("renders cover image with alt text when coverUrl provided", () => {
    render(
      <RecommendationCard
        recommendation={makeBook({ coverUrl: "https://example.com/cover.jpg" })}
      />,
    );
    const img = screen.getByAltText("Cover of The Name of the Wind");
    expect(img).toHaveAttribute(
      "src",
      expect.stringContaining("example.com%2Fcover.jpg"),
    );
  });

  it("renders placeholder when coverUrl is null (no cover image)", () => {
    render(<RecommendationCard recommendation={makeBook({ coverUrl: null })} />);
    expect(
      screen.queryByAltText("Cover of The Name of the Wind"),
    ).not.toBeInTheDocument();
  });
});
