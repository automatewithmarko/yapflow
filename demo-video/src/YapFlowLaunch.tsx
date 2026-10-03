import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { C, Fonts, clamp, ramp } from "./design";
import {
  Hook,
  Dictation,
  Corrections,
  Vocabulary,
  Meeting,
  Capture,
  History,
  Privacy,
  OpenSource,
  Finale,
} from "./scenes";

export const SHOTS = [
  { name: "Don’t type. Just talk.", from: 0, duration: 204, component: Hook },
  {
    name: "Hold → speak → release",
    from: 204,
    duration: 426,
    component: Dictation,
  },
  {
    name: "Corrections without stopping",
    from: 630,
    duration: 350,
    component: Corrections,
  },
  {
    name: "Vocabulary and languages",
    from: 980,
    duration: 196,
    component: Vocabulary,
  },
  {
    name: "Zoom / Meet detection",
    from: 1176,
    duration: 318,
    component: Meeting,
  },
  {
    name: "Microphone + system audio",
    from: 1494,
    duration: 198,
    component: Capture,
  },
  {
    name: "Save and replay",
    from: 1692,
    duration: 180,
    component: History,
  },
  {
    name: "Your voice stays on your device",
    from: 1872,
    duration: 275,
    component: Privacy,
  },
  {
    name: "Free and open source",
    from: 2147,
    duration: 178,
    component: OpenSource,
  },
  { name: "YapFlow / download", from: 2325, duration: 375, component: Finale },
];

export const YapFlowLaunch = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.black }}>
      <Fonts />
      {SHOTS.map((s) => (
        <Sequence
          key={s.name}
          name={s.name}
          from={s.from}
          durationInFrames={s.duration}
        >
          <s.component />
        </Sequence>
      ))}
      <Audio src={staticFile("launch-voice.mp3")} volume={1} />
      {[205, 429, 735, 1220, 1421, 1662, 1742, 1792].map((at) => (
        <Sequence key={at} from={at} durationInFrames={48}>
          <Audio src={staticFile("launch-click.mp3")} volume={0.3} />
        </Sequence>
      ))}
      <Audio
        src={staticFile("launch-score.mp3")}
        volume={(frame) =>
          interpolate(
            frame,
            [0, 45, 2500, 2550, 2650, 2699],
            [0, 0.16, 0.16, 0.32, 0.32, 0],
            clamp,
          )
        }
      />
      <AbsoluteFill
        style={{ background: "#080b10", opacity: ramp(f, 2665, 2699) }}
      />
    </AbsoluteFill>
  );
};
