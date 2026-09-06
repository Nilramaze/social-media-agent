import { AbsoluteFill, Img } from "remotion";
import type { SlideProps } from "./schema";

export function StaticSlide({ imageUrl, text }: SlideProps) {
  return (
    <AbsoluteFill>
      <Img src={imageUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "flex-end",
          padding: 70,
          paddingBottom: 90,
        }}
      >
        <div
          style={{
            backgroundColor: "rgba(0,0,0,0.6)",
            padding: "24px 32px",
            borderRadius: 16,
          }}
        >
          <span
            style={{
              color: "white",
              fontSize: 56,
              fontWeight: 700,
              textAlign: "center",
              fontFamily: "Arial, Helvetica, sans-serif",
              lineHeight: 1.25,
            }}
          >
            {text}
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
