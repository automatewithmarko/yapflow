# YapFlow launch video

The new 45-second launch film is rendered at 1080p/60fps with Remotion. It was built from a blank composition after the research documented in [RESEARCH.md](RESEARCH.md), using the current five-bar white YapFlow mark. Narration, music, and click sounds were generated specifically for this film with ElevenLabs. Meeting participants are fictional AI-generated supporting photographs.

```bash
npm install
npm run studio
npm run render
```

The final MP4 is written to `out/yapflow-launch.mp4`. The default command uses the installed macOS Chrome executable; on another OS, remove or replace that option with your browser path.

For the published version, normalize the mix and move playback metadata to the beginning of the file (requires FFmpeg):

```bash
ffmpeg -i out/yapflow-launch.mp4 -c:v copy -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a aac -b:a 256k -ar 48000 -movflags +faststart ../public/yapflow-launch.mp4
```

`node review.mjs` renders a set of scene and transition review frames. Scene timing and all motion are deterministic and editable in `src/`. The UI sequences are illustrative compositions based on supported app workflows, not a screen recording or a benchmark. No speaker-labelled meeting transcript or computer-agent capability is implied.

The bundled Manrope font is distributed under its accompanying SIL Open Font License. Product interface art and motion code are original; external motion resources were consulted for technique and pacing, not copied as templates.
