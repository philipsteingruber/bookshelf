import { useEffect, useState } from "react";

/**
 * Hook that returns true after the component has mounted on the client.
 * Useful for avoiding hydration mismatches with components that render
 * differently on server vs client (e.g., auth state, browser APIs).
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Required for mount detection pattern
    setMounted(true);
  }, []);

  return mounted;
}
