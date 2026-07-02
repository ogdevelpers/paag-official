import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tryOnSource = readFileSync("frontend/app/try-on/try-on-client.tsx", "utf8");

test("try-on client keeps the MediaPipe live path stable", () => {
  assert.match(tryOnSource, /const enableSegmentationMasks = false;/);
  assert.doesNotMatch(tryOnSource, /getAsUint8Array/);
  assert.match(tryOnSource, /const livePoseDetectionIntervalMs = 90;/);
  assert.match(tryOnSource, /poseLandmarker: shouldDetectPose \? poseLandmarker : null/);
  assert.match(tryOnSource, /Holding the last stable/);
});
