import { AbsoluteFill, Audio, Img, Sequence, useVideoConfig } from "remotion";
import type { ReelProps } from "./schema";

export function ReelComposition({ audioUrl, captions, scenes }: ReelProps) {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#111111" }}>
      <Audio src={audioUrl} />

      {scenes.map((scene, i) => {
        const from = Math.round(scene.startSeconds * fps);
        const durationInFrames = Math.max(1, Math.round((scene.endSeconds - scene.startSeconds) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <AbsoluteFill>
              <Img src={scene.imageUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {captions.map((caption, i) => {
        const from = Math.round(caption.startSeconds * fps);
        const durationInFrames = Math.max(1, Math.round((caption.endSeconds - caption.startSeconds) * fps));

        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <AbsoluteFill
              style={{
                alignItems: "center",
                justifyContent: "flex-end",
                padding: 60,
                paddingBottom: 160,
              }}
            >
              <div
                style={{
                  backgroundColor: "rgba(0,0,0,0.6)",
                  padding: "20px 28px",
                  borderRadius: 16,
                }}
              >
                <span
                  style={{
                    color: "white",
                    fontSize: 60,
                    fontWeight: 700,
                    textAlign: "center",
                    fontFamily: "Arial, Helvetica, sans-serif",
                    lineHeight: 1.2,
                  }}
                >
                  {caption.text}
                </span>
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
