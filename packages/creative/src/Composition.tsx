import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { ReelProps } from "./schema";

export function ReelComposition({ scenes }: ReelProps) {
  const { fps } = useVideoConfig();
  let startFrame = 0;

  return (
    <AbsoluteFill>
      {scenes.map((scene, i) => {
        const durationInFrames = Math.round(scene.durationSeconds * fps);
        const from = startFrame;
        startFrame += durationInFrames;

        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <AbsoluteFill
              style={{
                backgroundColor: scene.backgroundColor,
                alignItems: "center",
                justifyContent: "center",
                padding: 80,
              }}
            >
              <div
                style={{
                  color: "white",
                  fontSize: 64,
                  fontWeight: 700,
                  textAlign: "center",
                  fontFamily: "Arial, Helvetica, sans-serif",
                  lineHeight: 1.25,
                }}
              >
                {scene.text}
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
