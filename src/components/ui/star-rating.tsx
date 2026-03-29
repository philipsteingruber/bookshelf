"use client";

import { Rating, Star } from "@smastrom/react-rating";

import "@smastrom/react-rating/style.css";

const starStyles = {
  itemShapes: Star,
  activeFillColor: "#f59e0b",
  inactiveFillColor: "#d1d5db",
  activeStrokeColor: "transparent",
  inactiveStrokeColor: "transparent",
  itemStrokeWidth: 0,
};

interface StarRatingProps {
  value: number | null;
  onChange: (value: number | null) => void;
  readOnly?: boolean;
}

export function StarRating({
  value,
  onChange,
  readOnly = false,
}: StarRatingProps) {
  return (
    <Rating
      value={value ?? 0}
      onChange={(newVal: number) => {
        onChange(newVal === value ? null : newVal);
      }}
      readOnly={readOnly}
      itemStyles={starStyles}
      style={{ maxWidth: 96 }}
    />
  );
}
