import React from "react";
import { interpolate, staticFile, useCurrentFrame } from "remotion";
import {
  Backdrop,
  Brand,
  C,
  Cursor,
  GmailLogo,
  Head,
  Icon,
  Label,
  Mark,
  Notch,
  Provider,
  Reveal,
  Wave,
  WindowBar,
  clamp,
  ease,
  ramp,
} from "./design";

// Original interaction-led shots, built from a blank composition.
export const Hook = () => {
  const f = useCurrentFrame(),
    talk = f >= 74,
    intro = ease(f, talk ? 74 : 0, 25),
    out = ramp(f, 170, 204);
  return (
    <Backdrop light={!talk}>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 76,
          color: talk ? C.white : C.ink,
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 30,
          fontWeight: 750,
        }}
      >
        <div style={{ filter: talk ? "none" : "invert(1)" }}>
          <Mark size={44} />
        </div>
        YapFlow
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          transform: `scale(${1 + out * 0.13})`,
          opacity: 1 - out,
        }}
      >
        <div
          style={{
            transform: `translateY(${(1 - intro) * 100}px)`,
            opacity: intro,
          }}
        >
          <Head size={220}>{talk ? "Just talk." : "Don’t type."}</Head>
          {!talk && (
            <div
              style={{
                height: 11,
                background: C.ink,
                width: 1200,
                transform: `scaleX(${ramp(f, 40, 61)})`,
                transformOrigin: "left",
                marginTop: -118,
              }}
            />
          )}
          {talk && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginTop: 45,
              }}
            >
              <Wave width={350} height={75} count={33} />
            </div>
          )}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 100,
          bottom: 76,
          fontSize: 24,
          fontWeight: 550,
          color: talk ? C.muted : "#6b7d8d",
        }}
      >
        Your voice. A better way to write.
      </div>
    </Backdrop>
  );
};

export const Dictation = () => {
  const f = useCurrentFrame(),
    reveal = ease(f, 0, 50),
    result = ease(f, 260, 48),
    zoom = interpolate(reveal, [0, 1], [2.15, 1]) + result * 0.36;
  const released = f >= 225,
    textP = ease(f, 235, 26),
    stage = f < 80 ? "Hold" : released ? "Release" : "Speak";
  return (
    <Backdrop light>
      <div
        style={{ position: "absolute", left: 96, top: 90, opacity: 1 - result }}
      >
        <Label light>01 / Anywhere you write</Label>
        <Head size={94} style={{ marginTop: 20 }}>
          Thought → text.
        </Head>
      </div>
      <div
        style={{
          position: "absolute",
          left: 405,
          top: 285 - result * 170,
          width: 1110,
          height: 615,
          transform: `scale(${zoom})`,
          transformOrigin: "50% 0%",
          borderRadius: 27,
          boxShadow: "0 30px 100px #183c5c29",
          background: "#d9e6f2",
          border: "6px solid #1b222d",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 52,
            display: "flex",
            justifyContent: "space-between",
            padding: "0 22px",
            alignItems: "center",
            fontSize: 16,
            fontWeight: 650,
            color: "#243546",
          }}
        >
          ● &nbsp; Gmail &nbsp; File &nbsp; Edit &nbsp; View
          <span>◉ &nbsp; ⌁ &nbsp; ▰ &nbsp; 9:41</span>
        </div>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 4,
          }}
        >
          <Notch state={released ? "idle" : "listening"} />
        </div>
        <div
          style={{
            margin: "37px 65px 0",
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 10px 40px #16304c20",
            background: "white",
            height: 468,
          }}
        >
          <WindowBar
            title="Gmail · New message"
            light
            icon={<GmailLogo size={26} />}
          />
          <div
            style={{
              padding: "16px 30px",
              fontSize: 22,
              color: "#5c6878",
              borderBottom: "1px solid #eef0f3",
            }}
          >
            To &nbsp; Alex
          </div>
          <div
            style={{
              padding: "16px 30px",
              fontSize: 22,
              color: "#15202c",
              borderBottom: "1px solid #eef0f3",
            }}
          >
            Friday’s launch
          </div>
          <div
            style={{
              padding: "23px 30px",
              fontSize: 25,
              lineHeight: 1.55,
              color: "#202b37",
              opacity: released ? textP : 1,
              transform: `translateY(${released ? (1 - textP) * 12 : 0}px)`,
            }}
          >
            {released ? (
              <>
                <div>Hi Alex,</div>
                <div style={{ marginTop: 15 }}>
                  Let’s launch on Friday. The Supabase integration is ready.
                </div>
                <div style={{ marginTop: 15 }}>
                  Can you review the final build?
                </div>
              </>
            ) : (
              <span style={{ color: "#b8c2ce" }}>|</span>
            )}
          </div>
          {released && (
            <div
              style={{
                marginLeft: 30,
                width: 110,
                height: 41,
                borderRadius: 8,
                background: "#1769e0",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
              }}
            >
              Send
            </div>
          )}
        </div>
      </div>
      {!released && f >= 80 && (
        <div
          style={{
            position: "absolute",
            left: 100,
            right: 100,
            bottom: 75,
            fontSize: 34,
            textAlign: "right",
            color: "#618198",
            opacity: ramp(f, 80, 100),
          }}
        >
          “Hi Alex, let’s launch on Friday...”
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 96,
          bottom: 80,
          display: "flex",
          alignItems: "center",
          gap: 22,
          opacity: 1 - result,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            transform: `translateY(${f >= 225 ? 0 : 4}px)`,
          }}
        >
          {["⌘", "⇧", "Space"].map((k) => (
            <div
              key={k}
              style={{
                background: f >= 225 ? "#fff" : "#cceaff",
                border: "2px solid #b7c7d6",
                borderBottomWidth: f >= 225 ? 6 : 2,
                borderRadius: 12,
                padding: "13px 22px",
                fontSize: 28,
                fontWeight: 650,
              }}
            >
              {k}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 32, fontWeight: 650, color: "#45637b" }}>
          {stage}
          {released
            ? " to insert."
            : stage === "Hold"
              ? " your shortcut."
              : " naturally."}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 100,
          top: 109,
          display: "flex",
          alignItems: "center",
          gap: 15,
          color: "#627b8f",
          fontSize: 24,
        }}
      >
        <GmailLogo size={42} />
        Gmail
      </div>
    </Backdrop>
  );
};

export const Corrections = () => {
  const f = useCurrentFrame(),
    p = ease(f, 105, 30);
  return (
    <Backdrop>
      <div style={{ position: "absolute", left: 100, top: 90 }}>
        <Label>02 / Say it your way</Label>
        <Head size={90} style={{ marginTop: 20 }}>
          Change your mind.
          <br />
          <span style={{ color: C.blue }}>Not your flow.</span>
        </Head>
      </div>
      <Reveal
        at={15}
        style={{ position: "absolute", left: 100, top: 415, right: 100 }}
      >
        <div style={{ fontSize: 53, color: "#6c7989", letterSpacing: -2 }}>
          “<span style={{ opacity: 1 - p * 0.6 }}>Uh, let’s launch on </span>
          <span style={{ position: "relative", color: "#b8c5d3" }}>
            Thursday
            <span
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                height: 3,
                background: "#f18787",
                top: "53%",
                transform: `scaleX(${ramp(f, 64, 87)})`,
                transformOrigin: "left",
              }}
            />
          </span>
          <span style={{ opacity: ramp(f, 60, 92) }}>... no, Friday.”</span>
        </div>
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 555,
          right: 100,
          height: 220,
          borderTop: "1px solid #2a3745",
          paddingTop: 40,
        }}
      >
        <div style={{ position: "relative", height: 135, overflow: "hidden" }}>
          <Head
            size={110}
            style={{
              position: "absolute",
              top: 0,
              transform: `translateY(${-p * 150}px)`,
              opacity: 1 - p,
            }}
          >
            Let’s launch on Thursday.
          </Head>
          <Head
            size={110}
            style={{
              position: "absolute",
              top: 0,
              transform: `translateY(${(1 - p) * 150}px)`,
            }}
          >
            Let’s launch on <span style={{ color: C.blue }}>Friday.</span>
          </Head>
        </div>
        <div
          style={{
            marginTop: 27,
            fontSize: 27,
            color: C.muted,
            opacity: ramp(f, 138, 160),
            display: "flex",
            gap: 14,
            alignItems: "center",
          }}
        >
          <Icon kind="check" color={C.blue} size={28} />
          Filler words removed. Correction kept.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 100,
          bottom: 75,
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <Mark size={42} />
        <Wave active={f < 120} width={170} height={35} />
      </div>
    </Backdrop>
  );
};

export const Vocabulary = () => {
  const f = useCurrentFrame(),
    language = f >= 115,
    p = ease(f, 0, 30),
    flip = ease(f, 115, 30),
    languageIndex = Math.min(2, Math.floor(Math.max(0, f - 135) / 40));
  const strings = [
    "Your voice, your words.",
    "Tu voz, tus palabras.",
    "Votre voix, vos mots.",
  ];
  return (
    <Backdrop light>
      <div style={{ position: "absolute", left: 100, top: 92 }}>
        <Label light>03 / Personal by design</Label>
        <Head size={104} style={{ marginTop: 22 }}>
          It speaks <span style={{ color: "#2389c3" }}>you.</span>
        </Head>
      </div>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 345,
          width: 790,
          transform: `translateY(${(1 - p) * 35}px)`,
        }}
      >
        <div style={{ fontSize: 33, color: "#7390a6", marginBottom: 28 }}>
          Your names. Your vocabulary.
        </div>
        <div
          style={{
            fontSize: 90,
            letterSpacing: -5,
            fontWeight: 650,
            color: "#889dad",
            position: "relative",
            opacity: 1 - flip,
          }}
        >
          super base
          <span
            style={{
              position: "absolute",
              left: 0,
              top: "53%",
              height: 4,
              width: 440,
              background: "#aebfcc",
              transform: `scaleX(${ramp(f, 27, 45)})`,
              transformOrigin: "left",
            }}
          />
        </div>
        <Head
          size={105}
          style={{
            color: "#17628e",
            marginTop: 10,
            opacity: ramp(f, 43, 58) * (1 - flip),
            transform: `translateY(${(1 - ease(f, 43, 23)) * 20}px)`,
          }}
        >
          Supabase
        </Head>
        <div
          style={{
            position: "absolute",
            top: 70,
            left: 0,
            opacity: flip,
            background: "#edf5fb",
            padding: "15px 0",
            width: 860,
          }}
        >
          <Head size={76}>{strings[languageIndex]}</Head>
          <div style={{ fontSize: 28, marginTop: 35, color: "#5d7b92" }}>
            Language detected automatically.
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 1100,
          top: 330,
          width: 620,
          height: 410,
          boxSizing: "border-box",
          background: C.black,
          color: "white",
          borderRadius: 24,
          padding: 38,
          boxShadow: "0 30px 65px #123f5e21",
          transform: `translateX(${(1 - p) * 100}px) rotate(${(1 - p) * 4}deg)`,
        }}
      >
        <Brand size={27} />
        <div style={{ fontSize: 36, fontWeight: 650, marginTop: 28 }}>
          {language ? "Languages" : "Vocabulary"}
        </div>
        {!language ? (
          <>
            <div
              style={{
                marginTop: 28,
                padding: "16px 20px",
                border: "1px solid #3a4654",
                borderRadius: 10,
                fontSize: 25,
                color: C.muted,
              }}
            >
              Add a name or term...
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
              {["Supabase", "YapFlow"].map((t) => (
                <div
                  key={t}
                  style={{
                    borderRadius: 10,
                    padding: "12px 18px",
                    background: "#233746",
                    color: C.blue,
                    fontSize: 25,
                  }}
                >
                  {t} &nbsp; ×
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ marginTop: 25 }}>
            {["English", "Español", "Français"].map((t, i) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "13px 0",
                  fontSize: 25,
                  color: i === languageIndex ? C.blue : "#a7b6c5",
                  borderBottom: "1px solid #25303a",
                }}
              >
                <span>{t}</span>
                <Icon size={23} kind="check" />
              </div>
            ))}
          </div>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          left: 100,
          bottom: 100,
          fontSize: 28,
          color: "#5b778b",
        }}
      >
        Multilingual local models. No cloud transcription.
      </div>
    </Backdrop>
  );
};

const People = ({ f }: { f: number }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12,
      height: 465,
    }}
  >
    {["Alex", "Jamie", "Sam", "You"].map((name, i) => (
      <div
        key={name}
        style={{
          position: "relative",
          borderRadius: 10,
          overflow: "hidden",
          border:
            Math.floor(f / 55) % 4 === i
              ? "3px solid #8ed5ff"
              : "3px solid transparent",
          background: "#20252b",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundImage: `url(${staticFile("meeting-participants.png")})`,
            backgroundSize: "200% 200%",
            backgroundPosition: `${i % 2 ? 100 : 0}% ${i > 1 ? 100 : 0}%`,
            transform: `scale(${1 + ramp(f, 0, 340) * 0.025})`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            background: "#0009",
            borderRadius: 5,
            padding: "5px 10px",
            fontSize: 20,
            color: "white",
          }}
        >
          {name}
        </div>
        {Math.floor(f / 55) % 4 === i && (
          <div style={{ position: "absolute", right: 12, bottom: 14 }}>
            <Wave width={28} height={20} count={4} />
          </div>
        )}
      </div>
    ))}
  </div>
);

export const Meeting = () => {
  const f = useCurrentFrame(),
    p = ease(f, 0, 34),
    meet = f >= 155,
    click = 245,
    recording = f >= click,
    provider = meet ? "google-meet" : "zoom";
  const camera = 1 + 0.32 * ease(f, 65, 34) - 0.32 * ease(f, 150, 28) + 0.38 * ease(f, 200, 35) - 0.38 * ease(f, 270, 38);
  const cx = 960 + (interpolate(f, [175, 220, 245], [1450, 1110, 1110], clamp) - 960) * camera,
    cy = 280 + (interpolate(f, [175, 220, 245], [600, 388, 388], clamp) - 280) * camera;
  return (
    <Backdrop>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 75,
          display: "flex",
          justifyContent: "space-between",
          right: 100,
          alignItems: "center",
        }}
      >
        <div>
          <Label>04 / Meetings, remembered</Label>
          <Head size={84} style={{ marginTop: 19 }}>
            Be in the conversation.
          </Head>
        </div>
        <div style={{ display: "flex", gap: 23 }}>
          <Provider name="zoom" size={65} />
          <Provider name="google-meet" size={65} />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 360,
          top: 280,
          width: 1200,
          height: 665,
          background: "#101419",
          border: "5px solid #34404e",
          borderRadius: 22,
          overflow: "hidden",
          boxShadow: "0 30px 100px #0005",
          transform: `translateY(${(1 - p) * 70}px) scale(${(0.94 + 0.06 * p) * camera})`,
          transformOrigin: '50% 0%',
        }}
      >
        <div
          style={{
            height: 50,
            background: "#b9cddb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px",
            color: "#233343",
            fontSize: 17,
          }}
        >
          ● &nbsp; {meet ? "Chrome" : "Zoom"} &nbsp; File &nbsp; View
          <span>⌁ &nbsp; ▰ &nbsp; 10:00</span>
        </div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            transform: "translateX(-50%)",
            zIndex: 10,
          }}
        >
          <Notch
            state={recording ? "recording" : "meeting"}
            provider={provider}
            expanded={ease(f, 30, 30)}
          />
        </div>
        <div
          style={{
            padding: "10px 22px",
            fontSize: 20,
            color: "#a7b4c3",
            height: 45,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <Provider name={provider} size={25} />
          {meet
            ? "meet.google.com / product-sync"
            : "Zoom Meeting · Product sync"}
        </div>
        <div style={{ padding: "18px 24px" }}>
          <People f={f} />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 45,
            alignItems: "center",
            marginTop: 4,
            color: "#c4ccd6",
          }}
        >
          <Icon kind="mic" size={27} />
          <span style={{ fontSize: 25 }}>▣</span>
          <span style={{ fontSize: 24 }}>Participants &nbsp; 4</span>
          <div
            style={{
              background: "#bc3848",
              padding: "10px 24px",
              borderRadius: 8,
              fontSize: 19,
            }}
          >
            Leave
          </div>
        </div>
      </div>
      {f >= 175 && <Cursor frame={f} click={click} x={cx} y={cy} />}
    </Backdrop>
  );
};

export const Capture = () => {
  const f = useCurrentFrame(),
    p = ease(f, 0, 28);
  return (
    <Backdrop>
      <div style={{ position: "absolute", left: 100, top: 95 }}>
        <Label>05 / Every side of the conversation</Label>
        <Head size={100} style={{ marginTop: 22 }}>
          Your mic.
          <br />
          <span style={{ color: C.blue }}>Their voices.</span>
        </Head>
      </div>
      <div style={{ position: "absolute", left: 860, top: 340, width: 930 }}>
        {[
          ["mic", "Microphone"],
          ["speaker", "System audio"],
        ].map(([icon, title], i) => (
          <Reveal
            key={title}
            at={i * 22}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 25,
              marginBottom: 65,
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                border: "1px solid #304557",
                borderRadius: 22,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                color: C.blue,
              }}
            >
              <Icon kind={icon} size={41} />
            </div>
            <div style={{ width: 210, fontSize: 29, fontWeight: 650 }}>
              {title}
            </div>
            <Wave width={460} height={78} count={46} seed={i * 7} />
          </Reveal>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 630,
          display: "flex",
          alignItems: "center",
          gap: 17,
          color: "#ff8390",
          fontSize: 25,
          opacity: p,
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: 12,
            background: "#ff6975",
          }}
        />
        {f >= 180 ? "Recording saved" : "Recording locally"}
      </div>
      <div
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          bottom: 125,
          borderTop: "1px solid #2c3a46",
          paddingTop: 35,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 15,
            color: C.muted,
            fontSize: 28,
          }}
        >
          <Icon kind="folder" size={32} />
          Saved on your device
        </div>
        {f < 105 ? <div style={{ fontSize: 27, color: C.blue }}>Zoom + Google Meet</div> :
          <div style={{fontSize:25,color:C.white,background:'#283541',padding:'17px 25px',borderRadius:12,display:'flex',alignItems:'center',gap:14}}>
            <span style={{width:15,height:15,borderRadius:3,background:'#ff7985'}}/>{f>=180?'Saved':'Stop Recording'}
          </div>}
      </div>
      {f>=115&&f<180&&<Cursor frame={f} click={168} x={interpolate(ease(f,115,30),[0,1],[1720,1640])} y={920}/>}
    </Backdrop>
  );
};

export const History = () => {
  const f = useCurrentFrame(),
    opened = f >= 50,
    play = f >= 100;
  return (
    <Backdrop light>
      <div style={{ position: "absolute", left: 100, top: 90 }}>
        <Label light>06 / Right where you left it</Label>
        <Head size={93} style={{ marginTop: 20 }}>
          Recorded. Saved. <span style={{ color: "#2389c3" }}>Yours.</span>
        </Head>
      </div>
      <div
        style={{
          position: "absolute",
          left: 270,
          top: 300,
          width: 1380,
          height: 590,
          borderRadius: 24,
          overflow: "hidden",
          background: C.black,
          color: "white",
          boxShadow: "0 25px 75px #173f6225",
          transform: `translateY(${(1 - ease(f, 0, 35)) * 50}px)`,
        }}
      >
        <WindowBar title="YapFlow" />
        <div style={{ display: "flex", height: 526 }}>
          <div
            style={{
              width: 265,
              flexShrink: 0,
              boxSizing: "border-box",
              borderRight: "1px solid #25313e",
              padding: "28px 20px",
            }}
          >
            <Brand size={28} />
            <div style={{ marginTop: 40 }}>
              {[
                "Home",
                "Meeting history",
                "Speech history",
                "Vocabulary",
                "Languages",
              ].map((t) => (
                <div
                  key={t}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 9,
                    background:
                      t === "Meeting history" ? "#243744" : "transparent",
                    color: t === "Meeting history" ? C.blue : C.muted,
                    fontSize: 22,
                    marginBottom: 7,
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: "36px 40px", flex: 1 }}>
            <div style={{ color: C.muted, fontSize: 18, letterSpacing: 2 }}>
              LIBRARY
            </div>
            <div style={{ fontSize: 37, fontWeight: 650, marginTop: 9 }}>
              Meeting history
            </div>
            {!opened ? (
              <>
                <div style={{ marginTop: 13, fontSize: 23, color: C.muted }}>
                  Your local Zoom and Google Meet recordings.
                </div>
                <div
                  style={{
                    marginTop: 33,
                    border: "1px solid #2e3c4a",
                    borderRadius: 12,
                    padding: "23px 22px",
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                  }}
                >
                    <Provider name="google-meet" size={50} />
                  <div>
                    <div style={{ fontSize: 27, fontWeight: 650 }}>
                        Google Meet, October 4, 2026
                    </div>
                    <div style={{ fontSize: 21, color: C.muted, marginTop: 9 }}>
                      10:00 AM · Microphone + system audio
                    </div>
                  </div>
                  <span
                    style={{ marginLeft: "auto", fontSize: 35, color: C.blue }}
                  >
                    ›
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 16,
                    border: "1px solid #222d38",
                    borderRadius: 12,
                    padding: "18px 22px",
                    display: "flex",
                    gap: 18,
                    alignItems: "center",
                    color: C.muted,
                  }}
                >
                    <Provider name="zoom" size={42} />
                  <span style={{ fontSize: 25 }}>
                      Zoom, October 3, 2026
                  </span>
                </div>
              </>
            ) : (
              <>
                <div style={{ marginTop: 22, fontSize: 21, color: C.muted }}>
                  ← All meetings
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 23,
                  }}
                >
                  <div style={{ fontSize: 31, fontWeight: 600 }}>
                    Google Meet, October 4, 2026
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      padding: "10px 15px",
                      borderRadius: 9,
                      background: "#263440",
                    }}
                  >
                    Rename
                  </div>
                </div>
                <div style={{ display: "flex", gap: 15, marginTop: 24 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: "12px 18px",
                      borderRadius: 10,
                      background: play ? "#8ed5ff" : "#243846",
                      color: play ? "#14232f" : C.blue,
                      fontSize: 22,
                    }}
                  >
                    <Icon kind="play" size={22} />
                    {play ? "Playing recording" : "Play recording"}
                  </div>
                  <div
                    style={{
                      padding: "12px 18px",
                      border: "1px solid #34404c",
                      borderRadius: 10,
                      fontSize: 22,
                    }}
                  >
                    Show in folder
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 33,
                    display: "flex",
                    gap: 4,
                    alignItems: "center",
                    height: 80,
                    position: "relative",
                  }}
                >
                  {Array.from({ length: 90 }, (_, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height:
                          8 +
                          Math.abs(Math.sin(i * 1.7)) *
                            65 *
                            (0.3 + 0.7 * Math.sin(((i + 1) / 91) * Math.PI)),
                        borderRadius: 2,
                        background:
                          i < Math.max(0, f - 100) * 0.25 ? C.blue : "#314653",
                      }}
                    />
                  ))}
                  <div
                    style={{
                      position: "absolute",
                      height: 95,
                      width: 2,
                      left: Math.max(0, f - 100) * 2.4,
                      background: C.blue,
                      opacity: play ? 1 : 0,
                    }}
                  />
                </div>
                <div style={{ fontSize: 20, color: C.muted, marginTop: 14 }}>
                  00:
                  {String(Math.max(0, Math.floor((f - 100) / 60))).padStart(
                    2,
                    "0",
                  )}{" "}
                  / 00:06
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {f >= 25 && f < 160 && (
        <Cursor
          frame={f}
          click={opened ? 100 : 50}
          x={opened ? interpolate(ease(f, 52, 36), [0, 1], [1190, 650]) : interpolate(f, [25, 48], [1450, 1190], clamp)}
          y={opened ? interpolate(ease(f, 52, 36), [0, 1], [525, 640]) : 525}
        />
      )}
    </Backdrop>
  );
};

export const Privacy = () => {
  const f = useCurrentFrame(),
    p = ease(f, 0, 42),
    pct = interpolate(f, [0, 40], [0, 100], clamp);
  return (
    <Backdrop>
      <div style={{ position: "absolute", left: 100, top: 96 }}>
        <Label>Private by architecture</Label>
        <Head size={108} style={{ marginTop: 20 }}>
          Your voice
          <br />
          stays <span style={{ color: C.blue }}>yours.</span>
        </Head>
      </div>
      <div
        style={{
          position: "absolute",
          left: 970,
          top: 275,
          width: 690,
          height: 460,
          border: "3px solid #506c83",
          borderRadius: 30,
          boxShadow: "0 0 70px #7accff0a",
          overflow: "hidden",
          transform: `scale(${0.88 + 0.12 * p})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            transform: "translateX(-50%)",
          }}
        >
          <Notch />
        </div>
        <div
          style={{
            position: "absolute",
            left: 60,
            right: 60,
            top: 130,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Wave width={220} height={100} count={24} />
          <Icon kind="lock" size={85} color={C.blue} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 60,
            bottom: 100,
            color: "#f4f8fc",
            fontSize: 33,
            fontWeight: 550,
          }}
        >
          Voice → local model → text
        </div>
        <div
          style={{
            position: "absolute",
            left: 60,
            right: 60,
            bottom: 45,
            height: 6,
            background: "#263746",
            borderRadius: 5,
          }}
        >
          <div
            style={{
              height: 6,
              width: `${pct}%`,
              borderRadius: 5,
              background: C.blue,
            }}
          />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 945,
          top: 735,
          width: 740,
          height: 15,
          background: "#3a5266",
          borderRadius: "0 0 50% 50%",
        }}
      />
      <Reveal at={30} style={{ position: "absolute", left: 100, bottom: 145 }}>
        <Head size={95} style={{ color: C.blue }}>
          100% local.
        </Head>
        <div style={{ marginTop: 20, fontSize: 28, color: C.muted }}>
          No cloud transcription. No subscriptions.
        </div>
      </Reveal>
    </Backdrop>
  );
};

export const OpenSource = () => {
  const f = useCurrentFrame(),
    p = ease(f, 0, 30);
  return (
    <Backdrop light>
      <div style={{ position: "absolute", left: 100, top: 100 }}>
        <Label light>Built for everyone</Label>
      </div>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 300,
          transform: `translateY(${(1 - p) * 60}px)`,
        }}
      >
        <Head size={175}>Free.</Head>
        <Head size={175} style={{ color: "#2389c3", marginTop: 15 }}>
          Open source.
        </Head>
      </div>
      <Reveal
        at={20}
        style={{
          position: "absolute",
          right: 135,
          top: 425,
          display: "flex",
          flexDirection: "column",
          gap: 30,
          color: "#416278",
          fontSize: 34,
        }}
      >
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <Icon kind="code" size={48} />
          Made to be yours.
        </div>
        <div style={{ fontSize: 27 }}>macOS + Windows</div>
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: 100,
          bottom: 100,
          fontSize: 28,
          color: "#658195",
        }}
      >
        No plan to pick. Just a better way to work.
      </div>
    </Backdrop>
  );
};

export const Finale = () => {
  const f = useCurrentFrame(),
    p = ease(f, 0, 38),
    text = ease(f, 45, 30);
  return (
    <Backdrop>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 285,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 38,
          transform: `scale(${0.82 + 0.18 * p})`,
          opacity: p,
        }}
      >
        <Mark size={200} />
        <Head size={160}>YapFlow</Head>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 500,
          textAlign: "center",
          fontSize: 54,
          fontWeight: 500,
          letterSpacing: -2,
          opacity: text,
          transform: `translateY(${(1 - text) * 30}px)`,
        }}
      >
        Speak freely. <span style={{ color: C.blue }}>Write clearly.</span>
      </div>
      <Reveal
        at={78}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 690,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            padding: "22px 52px",
            background: C.blue,
            color: "#0b2435",
            borderRadius: 16,
            fontSize: 39,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 28,
          }}
        >
          yapflow.app <span style={{ fontSize: 40 }}>↗</span>
        </div>
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 105,
          textAlign: "center",
          fontSize: 25,
          color: C.muted,
          opacity: ramp(f, 100, 125),
        }}
      >
        Free · Open source · 100% local · Mac + Windows
      </div>
    </Backdrop>
  );
};
