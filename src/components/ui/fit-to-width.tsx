import React, { useLayoutEffect, useRef, useState } from 'react';

// Shows a fixed-width document (tax invoice, credit note, quotation, challan) whole on narrow screens
// by zooming it out to fit — like a PDF preview — instead of squeezing its columns. The document keeps
// its A4 layout; PDF export captures it at full size (pdf-generator resets this zoom while capturing).
export const FitToWidth: React.FC<{ width?: number; children: React.ReactNode }> = ({ width = 780, children }) => {
  const outer = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const update = () => setZoom(Math.min(1, el.clientWidth / width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  const fitted = zoom < 0.999;
  return (
    <div ref={outer} className="w-full overflow-hidden">
      <div data-fit-width style={fitted ? { width, zoom } : undefined}>
        {children}
      </div>
    </div>
  );
};
