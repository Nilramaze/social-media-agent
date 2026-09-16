import { contentBriefFormatValues, type ContentBriefFormat } from "@sma/db";
import { z } from "zod";

/**
 * The strategist may only emit formats the campaign allows, so a deselected
 * format cannot be planned at all - the tool schema handed to the model has
 * no such value. `formats` is expected to be non-empty (see
 * normalizeCampaignFormats).
 */
function formatEnum(formats: ContentBriefFormat[]) {
  const values = (formats.length > 0 ? formats : [...contentBriefFormatValues]) as [
    ContentBriefFormat,
    ...ContentBriefFormat[],
  ];
  return z.enum(values);
}

export function buildStrategistOutputSchema(formats: ContentBriefFormat[]) {
  return z.object({
    pillars: z
      .array(
        z.object({
          name: z.string().min(1).max(80),
          description: z.string().min(1).max(500),
        }),
      )
      .min(1)
      .max(6),
    briefs: z
      .array(
        z.object({
          topic: z.string().min(1).max(200),
          format: formatEnum(formats),
          pillarName: z.string().min(1).max(80),
        }),
      )
      .min(1)
      .max(20),
  });
}

export function buildReplenishOutputSchema(formats: ContentBriefFormat[]) {
  return z.object({
    briefs: z
      .array(
        z.object({
          topic: z.string().min(1).max(200),
          format: formatEnum(formats),
          pillarName: z.string().min(1).max(80),
        }),
      )
      .min(1)
      .max(MAX_REPLENISH_COUNT),
  });
}

/** All-formats variant, used for the shared output type. */
export const strategistOutputSchema = buildStrategistOutputSchema([...contentBriefFormatValues]);

export type StrategistOutput = z.infer<typeof strategistOutputSchema>;

/** Upper bound for one replenish run - matches the strategist's brief cap. */
export const MAX_REPLENISH_COUNT = 20;

/**
 * Replenish runs keep the campaign's pillars and only add briefs, so the
 * strategist returns briefs alone (each still bound to an existing pillar).
 */
export const replenishOutputSchema = buildReplenishOutputSchema([...contentBriefFormatValues]);

export type ReplenishOutput = z.infer<typeof replenishOutputSchema>;
