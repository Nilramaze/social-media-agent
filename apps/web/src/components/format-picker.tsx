"use client";

export const CONTENT_FORMATS = ["reel", "carousel", "post"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

const FORMAT_META: Record<ContentFormat, { label: string; hint: string }> = {
  reel: { label: "Reel", hint: "Video mit Voiceover und Untertiteln" },
  carousel: { label: "Carousel", hint: "4-6 Bild-Slides" },
  post: { label: "Post", hint: "Ein einzelnes Bild" },
};

/**
 * Which formats a campaign may produce. At least one stays selected -
 * unchecking the last one would leave the strategist nothing to plan.
 */
export function FormatPicker({
  idPrefix,
  value,
  onChange,
  disabled = false,
}: {
  idPrefix: string;
  value: ContentFormat[];
  onChange: (next: ContentFormat[]) => void;
  disabled?: boolean;
}) {
  function toggle(format: ContentFormat) {
    const next = value.includes(format)
      ? value.filter((f) => f !== format)
      : [...CONTENT_FORMATS].filter((f) => f === format || value.includes(f));
    if (next.length === 0) return;
    onChange(next);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {CONTENT_FORMATS.map((format) => {
        const checked = value.includes(format);
        const isLastChecked = checked && value.length === 1;
        return (
          <label
            key={format}
            htmlFor={`${idPrefix}-${format}`}
            title={isLastChecked ? "Mindestens ein Format muss aktiv bleiben." : undefined}
            className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
              checked
                ? "border-primary bg-surface-bone"
                : "border-border-subtle bg-surface-bone/40 hover:border-ink-muted"
            } ${disabled || isLastChecked ? "cursor-not-allowed opacity-70" : ""}`}
          >
            <input
              id={`${idPrefix}-${format}`}
              type="checkbox"
              checked={checked}
              disabled={disabled || isLastChecked}
              onChange={() => toggle(format)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="flex flex-col">
              <span className="text-body-md text-primary font-medium">
                {FORMAT_META[format].label}
              </span>
              <span className="text-mono-data text-ink-muted">{FORMAT_META[format].hint}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
