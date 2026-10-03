import { bundle } from "@remotion/bundler";
import {
  openBrowser,
  selectComposition,
  renderStill,
} from "@remotion/renderer";
import { mkdir } from "node:fs/promises";
const serveUrl = await bundle({ entryPoint: "src/index.ts" });
const browser = await openBrowser("chrome", {
  browserExecutable:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const composition = await selectComposition({
  serveUrl,
  id: "YapFlowLaunch",
  puppeteerInstance: browser,
});
await mkdir("out/review", { recursive: true });
const frames = [
  40, 130, 220, 320, 500, 680, 800, 1000, 1100, 1280, 1390, 1460, 1600, 1750,
  1870, 2040, 2270, 2550,
];
for (let i = 0; i < frames.length; i += 2) {
  await Promise.all(
    frames
      .slice(i, i + 2)
      .map((frame) =>
        renderStill({
          serveUrl,
          composition,
          frame,
          output: `out/review/frame-${String(frame).padStart(4, "0")}.png`,
          puppeteerInstance: browser,
          scale: 0.5,
        }),
      ),
  );
  console.log(`Reviewed frames ${frames.slice(i, i + 2).join(", ")}`);
}
await browser.close({ silent: true });
