import { AbsoluteFill, Audio, Sequence, useVideoConfig } from "remotion";
import { BACKGROUND_COLORS, type ReelProps } from "./schema";

export function ReelComposition({ audioUrl, captions }: ReelProps) {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: BACKGROUND_COLORS[0] }}>
      <Audio src={audioUrl} />
      {captions.map((caption, i) => {
        const from = Math.round(caption.startSeconds * fps);
        const durationInFrames = Math.max(
          1,
          Math.round((caption.endSeconds - caption.startSeconds) * fps),
        );
        const backgroundColor = BACKGROUND_COLORS[i % BACKGROUND_COLORS.length];

        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <AbsoluteFill
              style={{
                backgroundColor,
                alignItems: "center",
                justifyContent: "center",
                padding: 80,
              }}
            >
              <div
                style={{
                  color: "white",
                  fontSize: 72,
                  fontWeight: 700,
                  textAlign: "center",
                  fontFamily: "Arial, Helvetica, sans-serif",
                  lineHeight: 1.2,
                }}
              >
                {caption.text}
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
