"use client";

import { useRef, useState } from "react";

const SWIPE_THRESHOLD_PX = 40;

export function MediaPreview({
  format,
  mediaUrls,
}: {
  format: string;
  mediaUrls: string[];
}) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const deltaX = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;
    if (deltaX < 0) {
      setIndex((i) => Math.min(i + 1, mediaUrls.length - 1));
    } else {
      setIndex((i) => Math.max(i - 1, 0));
    }
  }

  if (mediaUrls.length === 0) {
    return (
      <span className="text-body-md text-ink-muted">
        {format === "reel" ? "Noch kein Video gerendert" : "Noch keine Bilder gerendert"}
      </span>
    );
  }

  if (format === "reel") {
    return <video src={mediaUrls[0]} controls className="w-full h-full object-cover" />;
  }

  // carousel / post: one or more static images, Instagram-style swipe dots.
  const current = mediaUrls[Math.min(index, mediaUrls.length - 1)];

  return (
    <div
      className="relative w-full h-full touch-pan-y"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={current} alt="" className="w-full h-full object-cover select-none" draggable={false} />
      {mediaUrls.length > 1 ? (
        <>
          {index > 0 ? (
            <button
              type="button"
              onClick={() => setIndex((i) => i - 1)}
              aria-label="Vorheriges Bild"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary/60 text-on-primary flex items-center justify-center"
            >
              &lsaquo;
            </button>
          ) : null}
          {index < mediaUrls.length - 1 ? (
            <button
              type="button"
              onClick={() => setIndex((i) => i + 1)}
              aria-label="Naechstes Bild"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary/60 text-on-primary flex items-center justify-center"
            >
              &rsaquo;
            </button>
          ) : null}
          <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-primary/60 text-on-primary text-mono-data">
            {index + 1}/{mediaUrls.length}
          </div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {mediaUrls.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Bild ${i + 1}`}
                className="p-1.5 -m-1.5"
              >
                <span className={`block w-1.5 h-1.5 rounded-full ${i === index ? "bg-on-primary" : "bg-on-primary/40"}`} />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
