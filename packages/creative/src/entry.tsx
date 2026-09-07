import { Composition, Still, registerRoot } from "remotion";
import { ReelComposition } from "./Composition";
import { StaticSlide } from "./StaticSlide";
import {
  DEFAULT_FPS,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  REEL_COMPOSITION_ID,
  SLIDE_COMPOSITION_ID,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type ReelProps,
  type SlideProps,
} from "./schema";

function calculateReelMetadata({ props }: { props: ReelProps }) {
  const fps = props.fps ?? DEFAULT_FPS;
  return {
    durationInFrames: Math.max(1, Math.round(props.durationSeconds * fps)),
    fps,
    width: props.width ?? DEFAULT_WIDTH,
    height: props.height ?? DEFAULT_HEIGHT,
  };
}

const defaultReelProps: ReelProps = {
  audioUrl: "",
  captions: [{ text: "...", startSeconds: 0, endSeconds: 2 }],
  scenes: [{ imageUrl: "", startSeconds: 0, endSeconds: 2 }],
  durationSeconds: 2,
  fps: DEFAULT_FPS,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
};

const defaultSlideProps: SlideProps = {
  imageUrl: "",
  text: "...",
  width: SLIDE_WIDTH,
  height: SLIDE_HEIGHT,
};

function Root() {
  return (
    <>
      <Composition
        id={REEL_COMPOSITION_ID}
        component={ReelComposition}
        durationInFrames={DEFAULT_FPS * 2}
        fps={DEFAULT_FPS}
        width={DEFAULT_WIDTH}
        height={DEFAULT_HEIGHT}
        calculateMetadata={calculateReelMetadata}
        defaultProps={defaultReelProps}
      />
      <Still
        id={SLIDE_COMPOSITION_ID}
        component={StaticSlide}
        width={SLIDE_WIDTH}
        height={SLIDE_HEIGHT}
        defaultProps={defaultSlideProps}
      />
    </>
  );
}

registerRoot(Root);
