# Launch film research and creative brief

Research began at **2026-10-03 18:22:56 UTC**. The required ten-minute research-only window ended at **18:32:56 UTC**. No video implementation, asset generation, or edits began before that deadline. Research continued afterwards.

## Sources reviewed

- [Remotion official skills](https://github.com/remotion-dev/skills): creation, scene layout, deterministic animation, transitions, typography, voiceover, rendering, audio visualization, and motion blur.
- [Remotion prompt gallery](https://www.remotion.dev/prompts): Presscut product demo, OpenClawd launch film, and cinematic typography. Inspected example playback, scene structure, and the prompts behind the films.
- [Animation Techniques Kit](https://github.com/platan821/animation-techniques-kit): reference decomposition, kinetic typography, type-to-object handoffs, match cuts, camera moves, device/UI choreography, and restrained brand reveals.
- [Hyperframes](https://hyperframes.app/showcases) and its [source resources](https://github.com/heygen-com/hyperframes): product-launch workflow, motion language, cut catalog, story spine, and frame presets. These were research references, not installed project skills.
- [Every product launch workflow](https://github.com/EveryInc/product-launch-video): early product reveal, before/after demonstration, truthful UI, storyboard and render review.
- [Montage](https://github.com/simplexlabs/montage): cursor choreography, masked typography, transition recipes, and camera focus.
- [Magnific Remotion example](https://github.com/naveen-annam/creativly.ai-magnific-video-remotion): seven-scene pacing, palette constraints, and motion tokens.
- [Peates](https://www.peates.com/), [Linear](https://linear.app/now/behind-the-latest-design-refresh), and [Raycast](https://www.raycast.com/blog/the-new-raycast): product-first storytelling and coherent interface presentation.
- ElevenLabs official [speech prompting](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices), [music prompting](https://elevenlabs.io/docs/overview/capabilities/music/best-practices), [sound effects](https://elevenlabs.io/docs/overview/capabilities/sound-effects), and [alignment](https://elevenlabs.io/docs/overview/capabilities/forced-alignment).

## Decisions

Start from a blank composition and a new voice script. Do not reuse the old scene layout, old narration, or old soundtrack. Use the actual five-bar white YapFlow mark, black, ice blue, and strong editorial typography. The product appears immediately.

Every motion has a job: a held key activates the notch; a released key inserts the finished message; spoken corrections replace a wrong term; a meeting prompt expands vertically; recording becomes a saved item; audio stays inside a device boundary. No decorative orbiting cards, floating particles, fake rotating devices, or meaningless waveform backgrounds.

Keep one focal point, vary shot scale, use fast transitions followed by readable holds, and carry visual anchors across cuts. Review transitions as well as scene peaks. Mix narration above music and use sparse tactile sound effects.

## Truthfulness constraints

The app currently inserts finished dictation after release. Meeting capture records microphone and system audio and supports local history/playback/renaming. This film must not imply word-by-word streaming, speaker-labelled saved transcripts, meeting summaries, or removed computer-agent features.

## Supporting image

Built-in image-generation skill was used for `public/meeting-participants.png`, a fictional four-person webcam contact sheet. Prompt: an edge-to-edge 2×2 grid of four distinct centered adult teammates in natural home-office webcam photographs, equal quadrants, real skin texture, friendly expressions, no text, interface, logos, or borders. The app interface is separately built in code.

## Audio and edit

Fresh narration was generated with Roger / Eleven v4, using short paragraphs and confident delivery. Its 42.1-second output was checked with local Whisper word timestamps to align the edit. A fresh 60-second instrumental score was generated with Eleven Music v2.5, then cut into a 45-second arrangement with a two-second crossfade into its closing chime. A new 0.8-second tactile click was generated with ElevenLabs SFX and placed only at interactions. Final delivery uses a normalized narration-led mix.

Music prompt: instrumental-only minimal UK garage / future-house at 120 BPM; plucked glass synths, warm bass, dry syncopated drums; sparse three-second opening, groove at four seconds, bass at eighteen, quieter narration space at thirty-two, uplifting resolution and a clean closing chime; no vocals, orchestra, guitars, or epic trailer drums.

SFX prompt: a single delicate tactile UI click, muted mechanical tap with a tiny warm glass confirmation tick; crisp attack, soft decay, no melody, music, voices, or bass impact.

Review caught and corrected a language-text overlap, cursor alignment, inconsistent meeting provider/history naming, and an unnecessarily small final email view. The meeting shot now has intentional close-ups during detection and recording activation. The finished MP4 is 1920×1080, 60fps, H.264/AAC with web fast-start metadata. App code, permissions, release manifests, installers, and the updater are unchanged.
