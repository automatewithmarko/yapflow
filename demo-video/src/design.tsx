import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Img,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from "remotion";

export const C = {
  black: "#080b10",
  ink: "#15202c",
  blue: "#8ed5ff",
  white: "#f7f9fc",
  muted: "#8e9ba8",
  line: "#26313e",
};
export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
export const ease = (frame: number, start: number, duration: number) =>
  spring({
    frame: frame - start,
    fps: 60,
    durationInFrames: duration,
    config: { damping: 200, stiffness: 160, overshootClamping: true },
  });
export const ramp = (frame: number, a: number, b: number) =>
  interpolate(frame, [a, b], [0, 1], clamp);

export const Fonts: React.FC = () => {
  const [handle] = useState(() => delayRender("Load bundled Manrope"));
  useEffect(() => {
    const font = new FontFace("Manrope", `url(${staticFile("Manrope.ttf")})`, {
      weight: "200 800",
    });
    font
      .load()
      .then((f) => {
        document.fonts.add(f);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }, [handle]);
  return null;
};
export const Mark: React.FC<{ size?: number }> = ({ size = 70 }) => (
  <Img
    src={staticFile("yapflow-mark.svg")}
    style={{ width: size, height: (size * 80) / 94, objectFit: "contain" }}
  />
);
export const Brand: React.FC<{ size?: number }> = ({ size = 42 }) => (
  <div
    style={{
      display: "flex",
      gap: size * 0.28,
      alignItems: "center",
      fontSize: size,
      fontWeight: 750,
      letterSpacing: -size * 0.055,
    }}
  >
    <Mark size={size * 1.15} />
    YapFlow
  </div>
);
export const Label: React.FC<{
  children: React.ReactNode;
  light?: boolean;
}> = ({ children, light }) => (
  <div
    style={{
      fontSize: 23,
      letterSpacing: 3,
      fontWeight: 650,
      textTransform: "uppercase",
      color: light ? "#597186" : C.muted,
    }}
  >
    {children}
  </div>
);
export const Head: React.FC<{
  children: React.ReactNode;
  size?: number;
  style?: React.CSSProperties;
}> = ({ children, size = 100, style }) => (
  <div
    style={{
      fontSize: size,
      fontWeight: 650,
      lineHeight: 1.06,
      letterSpacing: -size * 0.065,
      ...style,
    }}
  >
    {children}
  </div>
);
export const Backdrop: React.FC<{
  light?: boolean;
  children: React.ReactNode;
}> = ({ light, children }) => (
  <AbsoluteFill
    style={{
      background: light ? "#edf5fb" : C.black,
      color: light ? C.ink : C.white,
      fontFamily: "Manrope, sans-serif",
      overflow: "hidden",
    }}
  >
    {children}
  </AbsoluteFill>
);
export const Reveal: React.FC<{
  children: React.ReactNode;
  at?: number;
  duration?: number;
  style?: React.CSSProperties;
}> = ({ children, at = 0, duration = 32, style }) => {
  const f = useCurrentFrame(),
    p = ease(f, at, duration);
  return (
    <div
      style={{
        opacity: ramp(f, at, at + 10),
        transform: `translateY(${(1 - p) * 55}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
export const Wave: React.FC<{
  width?: number;
  height?: number;
  color?: string;
  count?: number;
  active?: boolean;
  seed?: number;
}> = ({
  width = 130,
  height = 44,
  color = C.blue,
  count = 17,
  active = true,
  seed = 0,
}) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        gap: 3,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {Array.from({ length: count }, (_, i) => {
        const envelope = Math.pow(
          Math.sin(((i + 1) / (count + 1)) * Math.PI),
          0.65,
        );
        const h = active
          ? 4 +
            envelope *
              (height - 4) *
              (0.25 + 0.75 * Math.abs(Math.sin(f * 0.13 + i * 0.67 + seed)))
          : 4;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              maxWidth: 8,
              height: h,
              borderRadius: 10,
              background: color,
            }}
          />
        );
      })}
    </div>
  );
};
export const Cursor: React.FC<{
  x: number;
  y: number;
  click?: number;
  frame: number;
}> = ({ x, y, click = 0, frame }) => {
  const pulse = ramp(frame, click, click + 20);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        zIndex: 40,
        transform: `scale(${frame >= click && frame < click + 10 ? 0.88 : 1})`,
        transformOrigin: "top left",
      }}
    >
      {frame >= click && frame < click + 20 && (
        <div
          style={{
            position: "absolute",
            width: 100,
            height: 100,
            border: "3px solid #8ed5ff",
            borderRadius: "50%",
            left: -50,
            top: -50,
            opacity: 1 - pulse,
            transform: `scale(${0.1 + pulse})`,
          }}
        />
      )}
      <svg
        width="38"
        height="48"
        viewBox="0 0 38 48"
        style={{ filter: "drop-shadow(0 3px 3px #0006)" }}
      >
        <path
          d="M4 3L31 27L18 29L12 42L4 3Z"
          fill="white"
          stroke="#111"
          strokeWidth="3"
        />
      </svg>
    </div>
  );
};
export const GmailLogo: React.FC<{ size?: number }> = ({ size = 46 }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 64 48">
    <path d="M6 45V8L18 17V45" fill="#4285f4" />
    <path d="M46 45V17L58 8V45" fill="#34a853" />
    <path
      d="M6 8L18 17L32 28L46 17L58 8"
      fill="none"
      stroke="#ea4335"
      strokeWidth="12"
      strokeLinejoin="round"
    />
    <path d="M6 8L18 17V3L10 0C5-2 0 2 0 7V18Z" fill="#c5221f" />
    <path d="M46 17L58 8L64 18V7C64 2 59-2 54 0L46 5Z" fill="#fbbc04" />
  </svg>
);
export const Provider: React.FC<{
  name: "zoom" | "google-meet";
  size?: number;
}> = ({ name, size = 46 }) => (
  <Img
    src={staticFile(`${name}.webp`)}
    style={{ width: size, height: size, objectFit: "contain" }}
  />
);
export const Notch: React.FC<{
  state?: "idle" | "listening" | "meeting" | "recording";
  provider?: "zoom" | "google-meet";
  expanded?: number;
  scale?: number;
}> = ({ state = "idle", provider = "zoom", expanded = 1, scale = 1 }) => {
  const meeting = state === "meeting";
  return (
    <div
      style={{
        position: "relative",
        width: meeting ? 570 : 410,
        height: meeting ? 54 + 105 * expanded : 54,
        background: "#000",
        borderRadius: "0 0 22px 22px",
        transform: `scale(${scale})`,
        transformOrigin: "top center",
        boxShadow: "0 7px 22px #0003",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 54,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          justifyContent: "space-between",
        }}
      >
        <Mark size={30} />
        <div style={{ width: 180 }} />
        {state === "listening" ? (
          <Wave width={68} height={25} count={9} />
        ) : state === "recording" ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 18,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 8,
                background: "#ff6975",
              }}
            />
            REC
          </div>
        ) : (
          <div style={{ width: 30 }} />
        )}
      </div>
      {meeting && (
        <div
          style={{
            padding: "15px 18px 20px",
            display: "flex",
            gap: 14,
            alignItems: "center",
            opacity: expanded,
          }}
        >
          <Provider name={provider} size={45} />
          <div style={{ fontSize: 25, fontWeight: 700, whiteSpace: "nowrap" }}>
            Meeting detected
          </div>
          <div
            style={{
              background: "#343434",
              borderRadius: 11,
              padding: "13px 15px",
              fontSize: 19,
              fontWeight: 650,
              whiteSpace: "nowrap",
            }}
          >
            Start Recording
          </div>
          <div style={{ fontSize: 26, color: "#aaa" }}>×</div>
        </div>
      )}
    </div>
  );
};
export const WindowBar: React.FC<{
  title: string;
  light?: boolean;
  icon?: React.ReactNode;
}> = ({ title, light, icon }) => (
  <div
    style={{
      height: 64,
      padding: "0 24px",
      background: light ? "#f7f9fc" : "#1b2028",
      display: "flex",
      alignItems: "center",
      gap: 11,
      borderBottom: `1px solid ${light ? "#e1e5eb" : "#343943"}`,
      color: light ? "#526172" : "#d3dae1",
      fontSize: 22,
    }}
  >
    <div style={{ display: "flex", gap: 9, marginRight: 22 }}>
      {["#ff625c", "#ffbd44", "#00c84d"].map((c) => (
        <span
          key={c}
          style={{ width: 14, height: 14, borderRadius: 20, background: c }}
        />
      ))}
    </div>
    {icon}
    {title}
  </div>
);
export const Icon: React.FC<{
  kind: string;
  size?: number;
  color?: string;
}> = ({ kind, size = 40, color = "currentColor" }) => {
  const paths: Record<string, React.ReactNode> = {
    mic: (
      <>
        <rect x="9" y="2" width="6" height="13" rx="3" />
        <path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8" />
      </>
    ),
    speaker: (
      <>
        <path d="M11 4L5 9H2v6h3l6 5V4Z" />
        <path d="M15 8a6 6 0 010 8M18 5a10 10 0 010 14" />
      </>
    ),
    play: <path d="M6 3l15 9-15 9V3Z" />,
    copy: (
      <>
        <rect x="8" y="8" width="13" height="13" rx="2" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
    lock: (
      <>
        <rect x="4" y="10" width="16" height="12" rx="3" />
        <path d="M8 10V6a4 4 0 018 0v4" />
      </>
    ),
    check: <path d="M4 12l5 5L20 5" />,
    folder: <path d="M2 6h8l2 3h10v12H2V6Z" />,
    code: (
      <>
        <path d="M8 6L2 12l6 6M16 6l6 6-6 6M14 3l-4 18" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[kind] || paths.check}
    </svg>
  );
};
