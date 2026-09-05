import { Composition, registerRoot } from "remotion";
import { ReelComposition } from "./Composition";
import { DEFAULT_FPS, DEFAULT_HEIGHT, DEFAULT_WIDTH, type ReelProps } from "./schema";

export const REEL_COMPOSITION_ID = "Reel";

function calculateMetadata({ props }: { props: ReelProps }) {
  const fps = props.fps ?? DEFAULT_FPS;
  return {
    durationInFrames: Math.max(1, Math.round(props.durationSeconds * fps)),
    fps,
    width: props.width ?? DEFAULT_WIDTH,
    height: props.height ?? DEFAULT_HEIGHT,
  };
}

const defaultProps: ReelProps = {
  audioUrl: "",
  captions: [{ text: "...", startSeconds: 0, endSeconds: 2 }],
  durationSeconds: 2,
  fps: DEFAULT_FPS,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
};

function Root() {
  return (
    <Composition
      id={REEL_COMPOSITION_ID}
      component={ReelComposition}
      durationInFrames={DEFAULT_FPS * 2}
      fps={DEFAULT_FPS}
      width={DEFAULT_WIDTH}
      height={DEFAULT_HEIGHT}
      calculateMetadata={calculateMetadata}
      defaultProps={defaultProps}
    />
  );
}

registerRoot(Root);
