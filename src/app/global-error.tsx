"use client";

import React from "react";

const GlobalError = ({ reset }: { error: Error & { digest?: string }; reset: () => void }): React.ReactElement => {
  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "1rem", fontFamily: "sans-serif" }}>
          <h2>Something went wrong</h2>
          <button onClick={reset}>Try again</button>
        </div>
      </body>
    </html>
  );
};

export default GlobalError;
