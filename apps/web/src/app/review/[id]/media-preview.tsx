"use client";

import { useState } from "react";

export function MediaPreview({
  format,
  mediaUrls,
}: {
  format: string;
  mediaUrls: string[];
}) {
  const [index, setIndex] = useState(0);

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
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={current} alt="" className="w-full h-full object-cover" />
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
              <span
                key={url}
                className={`w-1.5 h-1.5 rounded-full ${i === index ? "bg-on-primary" : "bg-on-primary/40"}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
