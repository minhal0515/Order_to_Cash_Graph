"use client";

import { useEffect, useState } from "react";

type ElementSize = {
  width: number;
  height: number;
};

export function useElementSize<T extends HTMLElement>(element: T | null) {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    if (!element) {
      return;
    }

    const update = () => {
      const next = {
        width: element.offsetWidth,
        height: element.offsetHeight,
      };

      setSize((current) => {
        if (current.width === next.width && current.height === next.height) {
          return current;
        }

        return next;
      });
    };

    update();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => observer.disconnect();
  }, [element]);

  return size;
}
