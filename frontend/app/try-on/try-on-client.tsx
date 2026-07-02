"use client";

import {
  Camera,
  Image as ImageIcon,
  Ruler,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Video,
  VideoOff,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { MPMask, NormalizedLandmark, PoseLandmarker, PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { currency } from "@/lib/domain";
import type { Product } from "@/lib/domain";
import { addProduct } from "../components/cart-store";

const tasksVisionVersion = "0.10.35";
const wasmPath = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${tasksVisionVersion}/wasm`;
const poseModelPath =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const enableSegmentationMasks = false;
const livePoseDetectionIntervalMs = 90;

const modelImages = [
  {
    id: "studio",
    label: "Studio",
    image: "",
  },
  {
    id: "petite",
    label: "Petite",
    image: "",
  },
  {
    id: "tall",
    label: "Tall",
    image: "",
  },
];

type TryOnMode = "camera" | "model" | "photo";

type Point = {
  x: number;
  y: number;
};

type ImageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BodyAnchors = {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
  confidence: number;
};

type VisionReport = {
  status: "Loading" | "Ready" | "Live" | "Detected" | "Fallback" | "Error";
  confidence: number;
  fitScale?: number;
  garmentMatte?: string;
  segmentation: boolean;
  message: string;
};

type RenderSource = HTMLImageElement | HTMLVideoElement;

type GarmentCutout = {
  crop: ImageRect;
  matte: "pose" | "fallback";
  source: HTMLCanvasElement;
  sourceAnchors: BodyAnchors;
};

function suggestSize(product: Product, height: number, fit: string) {
  if (product.sizes.includes("Free")) return "Free";

  const ordered = ["XS", "S", "M", "L", "XL", "XXL"].filter((size) => product.sizes.includes(size));
  if (!ordered.length) return product.sizes[0];

  let index = height < 158 ? 1 : height > 171 ? 3 : 2;
  if (fit === "relaxed") index += 1;
  if (fit === "close") index -= 1;

  return ordered[Math.min(Math.max(index, 0), ordered.length - 1)];
}

function garmentKind(category: string) {
  const normalized = category.toLowerCase();
  if (normalized.includes("saree")) return "saree";
  if (normalized.includes("dupatta")) return "dupatta";
  if (normalized.includes("top")) return "top";
  if (normalized.includes("bottom")) return "bottom";
  return "full";
}

function previewDefaults(product: Product) {
  const kind = garmentKind(product.category);
  return {
    scale: kind === "saree" ? 70 : kind === "dupatta" ? 58 : kind === "top" ? 50 : 64,
    vertical: kind === "saree" ? 10 : kind === "top" ? 6 : 8,
  };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded."));
    image.src = src;
  });
}

function waitForVideoReady(video: HTMLVideoElement) {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Camera stream did not become ready."));
    }, 6000);

    function cleanup() {
      window.clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
    }

    function onReady() {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        cleanup();
        resolve();
      }
    }

    function onError() {
      cleanup();
      reject(new Error("Camera stream could not be played."));
    }

    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);
  });
}

function cameraFailureMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Camera permission is blocked. Allow camera access for localhost in the browser, then start live camera again.";
    }

    if (error.name === "NotFoundError") {
      return "No camera was found on this device. Use a studio model or uploaded photo.";
    }

    if (error.name === "NotReadableError") {
      return "The camera is already in use by another app. Close that app and try live camera again.";
    }
  }

  return "Camera could not be opened. Use a studio model or uploaded photo, then try live camera again.";
}

function sourceDimensions(source: RenderSource) {
  if (source instanceof HTMLVideoElement) {
    return {
      height: source.videoHeight || 1125,
      width: source.videoWidth || 900,
    };
  }

  return {
    height: source.naturalHeight,
    width: source.naturalWidth,
  };
}

function containRect(source: RenderSource, width: number, height: number): ImageRect {
  const dimensions = sourceDimensions(source);
  const scale = Math.min(width / dimensions.width, height / dimensions.height);
  const rectWidth = dimensions.width * scale;
  const rectHeight = dimensions.height * scale;

  return {
    x: (width - rectWidth) / 2,
    y: (height - rectHeight) / 2,
    width: rectWidth,
    height: rectHeight,
  };
}

function mapLandmark(point: NormalizedLandmark, rect: ImageRect): Point {
  return {
    x: rect.x + point.x * rect.width,
    y: rect.y + point.y * rect.height,
  };
}

function visible(point: NormalizedLandmark | undefined) {
  return Boolean(point && point.visibility > 0.28);
}

function sortedPair(left: Point, right: Point) {
  return left.x <= right.x ? [left, right] : [right, left];
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function anchorCenter(anchors: BodyAnchors): Point {
  return {
    x: (anchors.topLeft.x + anchors.topRight.x + anchors.bottomLeft.x + anchors.bottomRight.x) / 4,
    y: (anchors.topLeft.y + anchors.topRight.y + anchors.bottomLeft.y + anchors.bottomRight.y) / 4,
  };
}

function interpolate(a: Point, b: Point, amount: number): Point {
  return {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function expandAroundCenter(point: Point, center: Point, amount: number): Point {
  return {
    x: center.x + (point.x - center.x) * amount,
    y: center.y + (point.y - center.y) * amount,
  };
}

function blendPoint(previous: Point, next: Point, stability: number): Point {
  return {
    x: previous.x * stability + next.x * (1 - stability),
    y: previous.y * stability + next.y * (1 - stability),
  };
}

function smoothAnchors(
  previous: BodyAnchors | null,
  next: BodyAnchors,
  imageRect: ImageRect,
  stability: number,
): BodyAnchors {
  if (!previous) return next;

  const jump = distance(anchorCenter(previous), anchorCenter(next));
  if (jump > imageRect.width * 0.24) return next;

  return {
    topLeft: blendPoint(previous.topLeft, next.topLeft, stability),
    topRight: blendPoint(previous.topRight, next.topRight, stability),
    bottomLeft: blendPoint(previous.bottomLeft, next.bottomLeft, stability),
    bottomRight: blendPoint(previous.bottomRight, next.bottomRight, stability),
    confidence: next.confidence,
  };
}

function anchorsFromPose(
  landmarks: NormalizedLandmark[] | undefined,
  rect: ImageRect,
  category: string,
  scalePercent: number,
  horizontal: number,
  vertical: number,
): BodyAnchors | null {
  if (!landmarks) return null;

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  if (!visible(leftShoulder) || !visible(rightShoulder) || !visible(leftHip) || !visible(rightHip)) {
    return null;
  }

  const [shoulderLeft, shoulderRight] = sortedPair(
    mapLandmark(leftShoulder, rect),
    mapLandmark(rightShoulder, rect),
  );
  const [hipLeft, hipRight] = sortedPair(mapLandmark(leftHip, rect), mapLandmark(rightHip, rect));
  const shoulderWidth = distance(shoulderLeft, shoulderRight);
  const torsoHeight = distance(
    interpolate(shoulderLeft, shoulderRight, 0.5),
    interpolate(hipLeft, hipRight, 0.5),
  );
  const multiplier = scalePercent / 60;
  const shoulderCenter = interpolate(shoulderLeft, shoulderRight, 0.5);
  const hipCenter = interpolate(hipLeft, hipRight, 0.5);
  const kind = garmentKind(category);
  const garmentTopCenter = interpolate(shoulderCenter, hipCenter, kind === "bottom" ? 0.92 : 0);
  const topLift = kind === "top" ? torsoHeight * 0.08 : torsoHeight * 0.12;
  const topWidth = shoulderWidth * (kind === "bottom" ? 0.92 : 1.42) * multiplier;
  const bottomLength =
    kind === "top"
      ? torsoHeight * 1.05
      : kind === "bottom"
        ? torsoHeight * 1.75
        : kind === "saree"
          ? torsoHeight * 2.65
          : kind === "dupatta"
            ? torsoHeight * 1.75
          : torsoHeight * 2.25;
  const bottomWidth = shoulderWidth * (kind === "top" ? 1.08 : kind === "dupatta" ? 1.28 : 1.62) * multiplier;
  const topY = garmentTopCenter.y - topLift + vertical;
  const bottomY = Math.min(rect.y + rect.height - 10, garmentTopCenter.y + bottomLength + vertical);
  const centerX = garmentTopCenter.x + horizontal;
  const centerTop: Point = { x: centerX, y: topY };
  const centerBottom: Point = {
    x: hipCenter.x + horizontal,
    y: bottomY,
  };
  const topLeft = expandAroundCenter({ x: centerTop.x - topWidth / 2, y: topY }, centerTop, 1);
  const topRight = expandAroundCenter({ x: centerTop.x + topWidth / 2, y: topY }, centerTop, 1);
  const bottomLeft = { x: centerBottom.x - bottomWidth / 2, y: bottomY };
  const bottomRight = { x: centerBottom.x + bottomWidth / 2, y: bottomY };
  const confidence =
    ((leftShoulder.visibility || 0) +
      (rightShoulder.visibility || 0) +
      (leftHip.visibility || 0) +
      (rightHip.visibility || 0)) /
    4;

  return {
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
    confidence,
  };
}

function fallbackAnchors(
  rect: ImageRect,
  category: string,
  scalePercent: number,
  horizontal: number,
  vertical: number,
): BodyAnchors {
  const multiplier = scalePercent / 60;
  const width = rect.width * 0.42 * multiplier;
  const centerX = rect.x + rect.width / 2 + horizontal;
  const topY = rect.y + rect.height * 0.19 + vertical;
  const kind = garmentKind(category);
  const height =
    kind === "top" ? rect.height * 0.32 : kind === "bottom" ? rect.height * 0.42 : rect.height * 0.62;
  const bottomY = Math.min(rect.y + rect.height - 10, topY + height);

  return {
    topLeft: { x: centerX - width / 2, y: topY },
    topRight: { x: centerX + width / 2, y: topY },
    bottomLeft: { x: centerX - width * 0.62, y: bottomY },
    bottomRight: { x: centerX + width * 0.62, y: bottomY },
    confidence: 0,
  };
}

function sourceGarmentScale(category: string) {
  const kind = garmentKind(category);
  if (kind === "saree") return 76;
  if (kind === "dupatta") return 58;
  if (kind === "top") return 56;
  if (kind === "bottom") return 54;
  if (
    category === "Co-ords" ||
    category === "Lehengas" ||
    category === "Ethnic Sets with Dupatta"
  ) {
    return 68;
  }
  return 64;
}

function sourceFallbackAnchors(rect: ImageRect, category: string): BodyAnchors {
  const centerX = rect.x + rect.width / 2;
  const kind = garmentKind(category);
  const topY =
    kind === "bottom"
      ? rect.y + rect.height * 0.42
      : kind === "top"
        ? rect.y + rect.height * 0.22
        : rect.y + rect.height * 0.16;
  const bottomY =
    kind === "top"
      ? rect.y + rect.height * 0.56
      : kind === "bottom"
        ? rect.y + rect.height * 0.88
        : kind === "dupatta"
          ? rect.y + rect.height * 0.78
        : rect.y + rect.height * 0.92;
  const topWidth =
    rect.width *
    (kind === "bottom" ? 0.28 : kind === "top" ? 0.42 : kind === "saree" ? 0.46 : 0.44);
  const bottomWidth =
    rect.width *
    (kind === "top" ? 0.36 : kind === "bottom" ? 0.38 : kind === "saree" ? 0.62 : 0.54);

  return {
    topLeft: { x: centerX - topWidth / 2, y: topY },
    topRight: { x: centerX + topWidth / 2, y: topY },
    bottomLeft: { x: centerX - bottomWidth / 2, y: bottomY },
    bottomRight: { x: centerX + bottomWidth / 2, y: bottomY },
    confidence: 0,
  };
}

function cropFromAnchors(anchors: BodyAnchors, width: number, height: number): ImageRect {
  const points = [anchors.topLeft, anchors.topRight, anchors.bottomLeft, anchors.bottomRight];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const paddingX = Math.max(14, (maxX - minX) * 0.18);
  const paddingY = Math.max(14, (maxY - minY) * 0.08);
  const x = clamp(minX - paddingX, 0, width - 1);
  const y = clamp(minY - paddingY, 0, height - 1);
  const right = clamp(maxX + paddingX, x + 1, width);
  const bottom = clamp(maxY + paddingY, y + 1, height);

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

function closePoseResult(result: PoseLandmarkerResult) {
  try {
    result.close();
  } catch {
    result.segmentationMasks?.forEach((mask) => {
      try {
        mask.close();
      } catch {
        return;
      }
    });
  }
}

function drawGarmentMaskPath(
  context: CanvasRenderingContext2D,
  anchors: BodyAnchors,
  category: string,
) {
  const topCenter = interpolate(anchors.topLeft, anchors.topRight, 0.5);
  const bottomCenter = interpolate(anchors.bottomLeft, anchors.bottomRight, 0.5);
  const topWidth = distance(anchors.topLeft, anchors.topRight);
  const garmentHeight = distance(topCenter, bottomCenter);
  const kind = garmentKind(category);
  const topArc = Math.max(4, topWidth * (kind === "bottom" ? 0.02 : 0.07));
  const sideCurve = Math.max(10, garmentHeight * 0.22);
  const sideEase = kind === "top" ? 0.58 : 0.72;

  context.beginPath();
  context.moveTo(anchors.topLeft.x, anchors.topLeft.y);
  context.quadraticCurveTo(topCenter.x, topCenter.y - topArc, anchors.topRight.x, anchors.topRight.y);
  context.bezierCurveTo(
    anchors.topRight.x + topWidth * 0.08,
    anchors.topRight.y + sideCurve * 0.25,
    anchors.bottomRight.x + topWidth * 0.04,
    anchors.bottomRight.y - sideCurve * sideEase,
    anchors.bottomRight.x,
    anchors.bottomRight.y,
  );
  context.quadraticCurveTo(
    bottomCenter.x,
    bottomCenter.y + Math.max(3, topWidth * 0.03),
    anchors.bottomLeft.x,
    anchors.bottomLeft.y,
  );
  context.bezierCurveTo(
    anchors.bottomLeft.x - topWidth * 0.04,
    anchors.bottomLeft.y - sideCurve * sideEase,
    anchors.topLeft.x - topWidth * 0.08,
    anchors.topLeft.y + sideCurve * 0.25,
    anchors.topLeft.x,
    anchors.topLeft.y,
  );
  context.closePath();
}

function createGarmentCutout(
  product: Product,
  image: HTMLImageElement,
  poseLandmarker: PoseLandmarker | null,
): GarmentCutout {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const sourceRect: ImageRect = { x: 0, y: 0, width, height };
  let anchors: BodyAnchors | null = null;
  let sourcePoseMask: HTMLCanvasElement | null = null;

  if (poseLandmarker) {
    let result: PoseLandmarkerResult | null = null;

    try {
      result = poseLandmarker.detect(image);
      anchors = anchorsFromPose(
        result.landmarks[0],
        sourceRect,
        product.category,
        sourceGarmentScale(product.category),
        0,
        0,
      );
      sourcePoseMask = enableSegmentationMasks && result.segmentationMasks?.[0]
        ? buildPoseMask(result.segmentationMasks[0], sourceRect, width, height)
        : null;
    } catch {
      anchors = null;
      sourcePoseMask = null;
    } finally {
      if (result) {
        closePoseResult(result);
      }
    }
  }

  const sourceAnchors = anchors || sourceFallbackAnchors(sourceRect, product.category);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext("2d");

  if (sourceContext) {
    sourceContext.drawImage(image, 0, 0, width, height);

    if (sourcePoseMask) {
      sourceContext.globalCompositeOperation = "destination-in";
      sourceContext.drawImage(sourcePoseMask, 0, 0);
      sourceContext.globalCompositeOperation = "source-over";
    }

    const boundaryMask = document.createElement("canvas");
    boundaryMask.width = width;
    boundaryMask.height = height;
    const boundaryContext = boundaryMask.getContext("2d");

    if (boundaryContext) {
      boundaryContext.fillStyle = "#fff";
      drawGarmentMaskPath(boundaryContext, sourceAnchors, product.category);
      boundaryContext.fill();
      sourceContext.globalCompositeOperation = "destination-in";
      sourceContext.drawImage(boundaryMask, 0, 0);
      sourceContext.globalCompositeOperation = "source-over";
    }
  }

  return {
    crop: cropFromAnchors(sourceAnchors, width, height),
    matte: anchors ? "pose" : "fallback",
    source: sourceCanvas,
    sourceAnchors,
  };
}

function estimateFitScale(cutout: GarmentCutout, anchors: BodyAnchors, imageRect: ImageRect) {
  const sourceWidthRatio =
    distance(cutout.sourceAnchors.topLeft, cutout.sourceAnchors.topRight) /
    Math.max(cutout.source.width, 1);
  const liveWidthRatio = distance(anchors.topLeft, anchors.topRight) / Math.max(imageRect.width, 1);
  const ratio = liveWidthRatio / Math.max(sourceWidthRatio, 0.01);

  return Math.round(clamp(ratio * 100, 45, 220));
}

function drawSourceStripToQuad(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  source: { x: number; y: number; width: number; height: number },
  topLeft: Point,
  topRight: Point,
  bottomLeft: Point,
  bottomRight: Point,
) {
  context.save();
  context.beginPath();
  context.moveTo(topLeft.x, topLeft.y);
  context.lineTo(topRight.x, topRight.y);
  context.lineTo(bottomRight.x, bottomRight.y);
  context.lineTo(bottomLeft.x, bottomLeft.y);
  context.closePath();
  context.clip();

  const a = (topRight.x - topLeft.x) / source.width;
  const b = (topRight.y - topLeft.y) / source.width;
  const c = (bottomLeft.x - topLeft.x) / source.height;
  const d = (bottomLeft.y - topLeft.y) / source.height;
  const e = topLeft.x - a * source.x - c * source.y;
  const f = topLeft.y - b * source.x - d * source.y;

  context.setTransform(a, b, c, d, e, f);
  context.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    source.x,
    source.y,
    source.width,
    source.height,
  );
  context.restore();
}

function drawWarpedGarment(
  context: CanvasRenderingContext2D,
  cutout: GarmentCutout,
  anchors: BodyAnchors,
) {
  const crop = cutout.crop;
  const strips = 40;

  for (let index = 0; index < strips; index += 1) {
    const start = index / strips;
    const end = (index + 1) / strips;
    const source = {
      x: crop.x + crop.width * start,
      y: crop.y,
      width: crop.width / strips + 1,
      height: crop.height,
    };

    drawSourceStripToQuad(
      context,
      cutout.source,
      source,
      interpolate(anchors.topLeft, anchors.topRight, start),
      interpolate(anchors.topLeft, anchors.topRight, end),
      interpolate(anchors.bottomLeft, anchors.bottomRight, start),
      interpolate(anchors.bottomLeft, anchors.bottomRight, end),
    );
  }
}

function buildPoseMask(mask: MPMask, rect: ImageRect, width: number, height: number) {
  const smallCanvas = document.createElement("canvas");
  smallCanvas.width = mask.width;
  smallCanvas.height = mask.height;
  const smallContext = smallCanvas.getContext("2d");
  if (!smallContext) return null;

  if (!mask.hasFloat32Array()) {
    return null;
  }

  let data: Float32Array;

  try {
    data = mask.getAsFloat32Array();
  } catch {
    return null;
  }

  if (data.length !== mask.width * mask.height) {
    return null;
  }

  const imageData = smallContext.createImageData(mask.width, mask.height);

  for (let index = 0; index < data.length; index += 1) {
    const alpha = Math.min(255, Math.max(0, Number(data[index]) * 255));
    const offset = index * 4;
    imageData.data[offset] = 255;
    imageData.data[offset + 1] = 255;
    imageData.data[offset + 2] = 255;
    imageData.data[offset + 3] = alpha;
  }

  smallContext.putImageData(imageData, 0, 0);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) return null;

  maskContext.drawImage(smallCanvas, rect.x, rect.y, rect.width, rect.height);
  return maskCanvas;
}

function drawLandmarkOverlay(context: CanvasRenderingContext2D, anchors: BodyAnchors) {
  context.save();
  context.strokeStyle = "rgba(246, 229, 185, 0.7)";
  context.lineWidth = 2;
  context.setLineDash([6, 5]);
  context.beginPath();
  context.moveTo(anchors.topLeft.x, anchors.topLeft.y);
  context.lineTo(anchors.topRight.x, anchors.topRight.y);
  context.lineTo(anchors.bottomRight.x, anchors.bottomRight.y);
  context.lineTo(anchors.bottomLeft.x, anchors.bottomLeft.y);
  context.closePath();
  context.stroke();
  context.restore();
}

function renderTryOnFrame({
  anchorMemory,
  canvas,
  context,
  detectorMode,
  garmentCutout,
  garmentLayer,
  horizontal,
  opacity,
  personSource,
  poseLandmarker,
  product,
  scale,
  timestamp,
  vertical,
}: {
  anchorMemory?: { current: BodyAnchors | null };
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  detectorMode: "IMAGE" | "VIDEO";
  garmentCutout: GarmentCutout;
  garmentLayer?: HTMLCanvasElement | null;
  horizontal: number;
  opacity: number;
  personSource: RenderSource;
  poseLandmarker: PoseLandmarker | null;
  product: Product;
  scale: number;
  timestamp?: number;
  vertical: number;
}) {
  if (canvas.width !== 900 || canvas.height !== 1125) {
    canvas.width = 900;
    canvas.height = 1125;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#050403";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const imageRect = containRect(personSource, canvas.width, canvas.height);
  context.drawImage(personSource, imageRect.x, imageRect.y, imageRect.width, imageRect.height);

  let segmentationMask: HTMLCanvasElement | null = null;
  let anchors = fallbackAnchors(imageRect, product.category, scale, horizontal, vertical);
  let report: VisionReport = {
    status: "Fallback",
    confidence: 0,
    fitScale: 0,
    garmentMatte: garmentCutout.matte === "pose" ? "product boundary" : "fallback shape",
    segmentation: false,
    message: "Manual placement active. Garment cutout is ready; stand in a clear full-body frame for stronger detection.",
  };

  if (poseLandmarker) {
    let result: PoseLandmarkerResult | null = null;

    try {
      result =
        detectorMode === "VIDEO" && personSource instanceof HTMLVideoElement
          ? poseLandmarker.detectForVideo(personSource, timestamp || performance.now())
          : poseLandmarker.detect(personSource);
      const poseAnchors = anchorsFromPose(
        result.landmarks[0],
        imageRect,
        product.category,
        scale,
        horizontal,
        vertical,
      );
      const poseMask = enableSegmentationMasks ? result.segmentationMasks?.[0] : null;

      if (poseAnchors) {
        anchors = poseAnchors;
        segmentationMask = poseMask
          ? buildPoseMask(poseMask, imageRect, canvas.width, canvas.height)
          : null;
        report = {
          status: detectorMode === "VIDEO" ? "Live" : "Detected",
          confidence: Math.round(poseAnchors.confidence * 100),
          segmentation: Boolean(segmentationMask),
          message:
            detectorMode === "VIDEO"
              ? "Live pose tracking active. Stabilized anchors keep the product cutout smoother as you move."
              : "Pose landmarks locked. The product cutout is warped from shoulder and hip anchors.",
        };
      } else if (detectorMode === "VIDEO" && anchorMemory?.current) {
        anchors = anchorMemory.current;
        report = {
          status: "Live",
          confidence: Math.round(anchors.confidence * 100),
          segmentation: false,
          message: "Tracking briefly dropped. Holding the last stable fit until full-body landmarks return.",
        };
      }
    } catch {
      if (detectorMode === "VIDEO" && anchorMemory?.current) {
        anchors = anchorMemory.current;
        report = {
          status: "Live",
          confidence: Math.round(anchors.confidence * 100),
          segmentation: false,
          message: "Live render recovered from a tracking error. Holding the last stable garment fit.",
        };
      } else {
        report = {
          status: "Fallback",
          confidence: 0,
          segmentation: false,
          message: "Pose model could not read this frame. Manual placement is active.",
        };
      }
    } finally {
      if (result) {
        closePoseResult(result);
      }
    }
  } else if (detectorMode === "VIDEO" && anchorMemory?.current) {
    anchors = anchorMemory.current;
    report = {
      status: "Live",
      confidence: Math.round(anchors.confidence * 100),
      segmentation: false,
      message: "Using stabilized anchors from the last detection frame.",
    };
  }

  if (anchorMemory) {
    anchors = smoothAnchors(anchorMemory.current, anchors, imageRect, 0.72);
    anchorMemory.current = anchors;
  }

  const layer = garmentLayer || document.createElement("canvas");
  if (layer.width !== canvas.width || layer.height !== canvas.height) {
    layer.width = canvas.width;
    layer.height = canvas.height;
  }
  const garmentContext = layer.getContext("2d");

  if (garmentContext) {
    garmentContext.setTransform(1, 0, 0, 1, 0, 0);
    garmentContext.imageSmoothingEnabled = true;
    garmentContext.imageSmoothingQuality = "high";
    garmentContext.clearRect(0, 0, layer.width, layer.height);
    drawWarpedGarment(garmentContext, garmentCutout, anchors);

    if (segmentationMask) {
      garmentContext.globalCompositeOperation = "destination-in";
      garmentContext.drawImage(segmentationMask, 0, 0);
      garmentContext.globalCompositeOperation = "source-over";
    }

    context.save();
    context.globalAlpha = opacity / 100;
    context.drawImage(layer, 0, 0);
    context.restore();
  }

  report.fitScale = estimateFitScale(garmentCutout, anchors, imageRect);
  report.garmentMatte = garmentCutout.matte === "pose" ? "product boundary" : "fallback shape";

  drawLandmarkOverlay(context, anchors);

  context.fillStyle = "rgba(0, 0, 0, 0.68)";
  context.fillRect(24, 24, 260, 64);
  context.fillStyle = "#f6e5b9";
  context.font = "700 18px Arial";
  context.fillText(detectorMode === "VIDEO" ? "Live PAAG Lens" : "MediaPipe try-on", 42, 50);
  context.font = "500 13px Arial";
  context.fillText(`${report.status} · garment boundary + ${report.segmentation ? "body matte" : "pose fit"}`, 42, 74);

  return report;
}

export function TryOnClient({
  products,
  selectedSlug,
}: {
  products: Product[];
  selectedSlug: string;
}) {
  const initialProduct =
    products.find((product) => product.slug === selectedSlug) || products[0];
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const garmentLayerRef = useRef<HTMLCanvasElement | null>(null);
  const liveAnchorsRef = useRef<BodyAnchors | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const poseModeRef = useRef<"IMAGE" | "VIDEO">("IMAGE");
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [productId, setProductId] = useState(initialProduct.id);
  const [modelId, setModelId] = useState(modelImages[0].id);
  const [tryOnMode, setTryOnMode] = useState<TryOnMode>("model");
  const [uploadedImage, setUploadedImage] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [scale, setScale] = useState(previewDefaults(initialProduct).scale);
  const [horizontal, setHorizontal] = useState(0);
  const [vertical, setVertical] = useState(previewDefaults(initialProduct).vertical);
  const [opacity, setOpacity] = useState(88);
  const [height, setHeight] = useState(164);
  const [fit, setFit] = useState("regular");
  const [modelReady, setModelReady] = useState(false);
  const [visionReport, setVisionReport] = useState<VisionReport>({
    status: "Loading",
    confidence: 0,
    segmentation: false,
    message: "Loading pose tracking and garment warping engine.",
  });

  const product = products.find((item) => item.id === productId) || initialProduct;
  const model = modelImages.find((item) => item.id === modelId) || modelImages[0];
  const sourceImage = uploadedImage || model.image;
  const suggestedSize = useMemo(
    () => suggestSize(product, height, fit),
    [fit, height, product],
  );

  const ensurePoseMode = useCallback(async (mode: "IMAGE" | "VIDEO") => {
    const poseLandmarker = poseLandmarkerRef.current;
    if (!poseLandmarker) return null;

    if (poseModeRef.current !== mode) {
      await poseLandmarker.setOptions({ runningMode: mode });
      poseModeRef.current = mode;
    }

    return poseLandmarker;
  }, []);

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    liveAnchorsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadVisionModel() {
      try {
        const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(wasmPath);
        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            delegate: "CPU",
            modelAssetPath: poseModelPath,
          },
          minPoseDetectionConfidence: 0.35,
          minPosePresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
          numPoses: 1,
          outputSegmentationMasks: enableSegmentationMasks,
          runningMode: "IMAGE",
        });

        if (cancelled) {
          poseLandmarker.close();
          return;
        }

        poseLandmarkerRef.current = poseLandmarker;
        setModelReady(true);
        setVisionReport({
          status: "Ready",
          confidence: 0,
          segmentation: false,
          message: "Model ready. Start live camera or use a studio model.",
        });
      } catch {
        if (!cancelled) {
          setModelReady(false);
          setVisionReport({
            status: "Error",
            confidence: 0,
            segmentation: false,
            message: "Model could not load. Using manual fallback placement.",
          });
        }
      }
    }

    void loadVisionModel();
    return () => {
      cancelled = true;
      poseLandmarkerRef.current?.close();
      poseLandmarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (uploadedImage) URL.revokeObjectURL(uploadedImage);
    };
  }, [uploadedImage]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (tryOnMode === "camera") return;

    let cancelled = false;

    async function renderTryOn() {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;

      const [personImage, garmentImage] = await Promise.all([
        loadImage(sourceImage),
        loadImage(product.images[0]),
      ]);

      if (cancelled) return;

      const poseLandmarker = await ensurePoseMode("IMAGE");
      if (cancelled) return;
      const garmentCutout = createGarmentCutout(product, garmentImage, poseLandmarker);

      const frameOptions = {
        canvas,
        context,
        detectorMode: "IMAGE" as const,
        garmentCutout,
        garmentLayer:
          garmentLayerRef.current || (garmentLayerRef.current = document.createElement("canvas")),
        horizontal,
        opacity,
        personSource: personImage,
        product,
        scale,
        vertical,
      };
      let report: VisionReport;

      try {
        report = renderTryOnFrame({ ...frameOptions, poseLandmarker });
      } catch {
        report = renderTryOnFrame({ ...frameOptions, poseLandmarker: null });
      }

      if (!cancelled) {
        setVisionReport(report);
      }
    }

    void renderTryOn().catch(() => {
      if (!cancelled) {
        setVisionReport({
          status: "Error",
          confidence: 0,
          segmentation: false,
          message: "Could not render this image. Try another photo or studio model.",
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ensurePoseMode, horizontal, modelReady, opacity, product, scale, sourceImage, tryOnMode, vertical]);

  useEffect(() => {
    if (tryOnMode !== "camera" || !cameraActive || !modelReady) return;

    let cancelled = false;
    let lastReportAt = 0;
    let lastDetectionAt = 0;

    async function renderLiveTryOn() {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      const video = videoRef.current;
      if (!canvas || !context || !video) return;

      const garmentImage = await loadImage(product.images[0]);
      if (cancelled) return;

      const imagePoseLandmarker = await ensurePoseMode("IMAGE");
      if (cancelled) return;
      const garmentCutout = createGarmentCutout(product, garmentImage, imagePoseLandmarker);

      const poseLandmarker = await ensurePoseMode("VIDEO");
      if (cancelled || !poseLandmarker) return;

      liveAnchorsRef.current = null;

      function paintFrame(timestamp: number) {
        if (cancelled || !canvas || !context || !video) return;

        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
          const shouldDetectPose =
            !liveAnchorsRef.current || timestamp - lastDetectionAt >= livePoseDetectionIntervalMs;
          if (shouldDetectPose) {
            lastDetectionAt = timestamp;
          }

          const frameOptions = {
            anchorMemory: liveAnchorsRef,
            canvas,
            context,
            detectorMode: "VIDEO" as const,
            garmentCutout,
            garmentLayer:
              garmentLayerRef.current || (garmentLayerRef.current = document.createElement("canvas")),
            horizontal,
            opacity,
            personSource: video,
            product,
            scale,
            timestamp,
            vertical,
          };
          let report: VisionReport | null = null;

          try {
            report = renderTryOnFrame({
              ...frameOptions,
              poseLandmarker: shouldDetectPose ? poseLandmarker : null,
            });
          } catch {
            try {
              report = renderTryOnFrame({ ...frameOptions, poseLandmarker: null });
            } catch {
              report = {
                status: "Fallback",
                confidence: 0,
                segmentation: false,
                message: "Live render recovered from a frame error. Manual placement remains active.",
              };
            }
          }

          if (report && timestamp - lastReportAt > 450) {
            lastReportAt = timestamp;
            setVisionReport(report);
          }
        }

        animationFrameRef.current = requestAnimationFrame(paintFrame);
      }

      animationFrameRef.current = requestAnimationFrame(paintFrame);
    }

    void renderLiveTryOn().catch(() => {
      if (!cancelled) {
        setVisionReport({
          status: "Error",
          confidence: 0,
          segmentation: false,
          message: "Live camera render failed. Stop camera and try again.",
        });
      }
    });

    return () => {
      cancelled = true;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [
    cameraActive,
    ensurePoseMode,
    horizontal,
    modelReady,
    opacity,
    product,
    scale,
    tryOnMode,
    vertical,
  ]);

  async function startLiveCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setVisionReport({
        status: "Error",
        confidence: 0,
        segmentation: false,
        message: "Camera is not available in this browser.",
      });
      return;
    }

    stopCamera();
    liveAnchorsRef.current = null;
    setUploadedImage("");
    setTryOnMode("camera");
    setVisionReport({
      status: "Loading",
      confidence: 0,
      segmentation: false,
      message: "Opening camera. Allow browser camera access to start live try-on.",
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          height: { ideal: 1280 },
          width: { ideal: 720 },
        },
      });
      const video = videoRef.current;
      if (!video) return;

      streamRef.current = stream;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      await waitForVideoReady(video);
      setCameraActive(true);
      setVisionReport({
        status: modelReady ? "Live" : "Loading",
        confidence: 0,
        segmentation: false,
        message: modelReady
          ? "Live camera active. Step back so shoulders and hips are visible."
          : "Camera active. Waiting for the vision model to finish loading.",
      });
    } catch (error) {
      stopCamera();
      setTryOnMode("model");
      setVisionReport({
        status: "Error",
        confidence: 0,
        segmentation: false,
        message: cameraFailureMessage(error),
      });
    }
  }

  function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    stopCamera();
    const nextUrl = URL.createObjectURL(file);
    setUploadedImage((current) => {
      if (current) URL.revokeObjectURL(current);
      return nextUrl;
    });
    setTryOnMode("photo");
  }

  return (
    <section className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">Virtual try-on</p>
          <h1 className="mt-2 font-serif text-5xl font-semibold">PAAG Lens</h1>
          <p className="mt-4 max-w-2xl text-[var(--muted)]">
            Live camera clothing try-on with MediaPipe pose tracking, stabilized
            body anchors and canvas garment warping.
          </p>
        </div>
        <div className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)] sm:min-w-80">
          <p className="flex items-center gap-2 font-semibold text-[var(--gold-soft)]">
            <ShieldCheck size={17} /> Privacy-first vision
          </p>
          <p>Live video and uploaded photos are processed inside this browser and are not saved by PAAG.</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(760px,1fr)_300px]">
        <aside className="h-fit rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
          <div className="flex items-center gap-2 text-[var(--gold-soft)]">
            <Sparkles size={18} />
            <h2 className="font-semibold">Choose outfit</h2>
          </div>
          <div className="mt-5 grid gap-3">
            {products.map((item) => (
              <button
                className={`grid grid-cols-[58px_1fr] gap-3 rounded-lg border p-2 text-left ${
                  item.id === product.id
                    ? "border-[var(--gold)] bg-[#21190f]"
                    : "border-[var(--line)] bg-[var(--panel-2)]"
                }`}
                key={item.id}
                type="button"
                onClick={() => {
                  const defaults = previewDefaults(item);
                  setProductId(item.id);
                  setScale(defaults.scale);
                  setVertical(defaults.vertical);
                }}
              >
                <img
                  alt={item.name}
                  className="h-20 w-14 rounded-md object-cover"
                  src={item.images[0]}
                />
                <span>
                  <span className="block text-sm font-semibold">{item.name}</span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    {item.category} · {currency.format(item.price)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex flex-col justify-between gap-3 border-b border-[var(--line)] p-5 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm text-[var(--muted)]">
                {tryOnMode === "camera" ? "Live camera render" : "CV render"}
              </p>
              <h2 className="text-2xl font-semibold">{product.name}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {modelImages.map((item) => (
                <button
                  className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                    modelId === item.id && tryOnMode === "model"
                      ? "border-[var(--gold)] bg-[var(--gold)] text-black"
                      : "border-[var(--line)] bg-[var(--panel-2)] text-[var(--gold-soft)]"
                  }`}
                  key={item.id}
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setUploadedImage("");
                    setTryOnMode("model");
                    setModelId(item.id);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 p-5">
            <div className="mx-auto w-full max-w-[900px] overflow-hidden rounded-lg border border-[var(--line)] bg-black shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
              <canvas
                aria-label="MediaPipe virtual try-on render"
                className="aspect-[4/5] w-full"
                ref={canvasRef}
              />
              <video className="hidden" muted playsInline ref={videoRef} />
            </div>

            <div className="grid content-start gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
              <div className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold text-[var(--gold-soft)]">
                  <Video size={17} /> Live try-on
                </p>
                <p className="text-xs leading-5 text-[var(--muted)]">
                  Start your camera and stand far enough back for shoulders and
                  hips to stay in frame.
                </p>
                {cameraActive ? (
                  <button className="btn-secondary justify-center" type="button" onClick={stopCamera}>
                    <VideoOff size={17} /> Stop camera
                  </button>
                ) : (
                  <button className="btn-primary justify-center" type="button" onClick={startLiveCamera}>
                    <Camera size={17} /> Start live camera
                  </button>
                )}
              </div>

              <label className="grid cursor-pointer gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] p-4 text-sm">
                <span className="flex items-center gap-2 font-semibold text-[var(--gold-soft)]">
                  <Upload size={17} /> Upload fallback
                </span>
                <span className="text-xs leading-5 text-[var(--muted)]">
                  Still available for customers who do not want to use camera.
                </span>
                <input accept="image/*" className="hidden" type="file" onChange={uploadPhoto} />
              </label>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] p-4 md:col-span-2 xl:col-span-2 2xl:col-span-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-[var(--gold-soft)]">
                  <Camera size={17} /> Vision check
                </p>
                <div className="mt-3 grid gap-2 text-xs text-[var(--muted)]">
                  <p>Engine: MediaPipe Tasks Vision</p>
                  <p>Mode: {tryOnMode === "camera" ? "Live video" : tryOnMode === "photo" ? "Uploaded image" : "Studio model"}</p>
                  <p>Pose confidence: {visionReport.confidence || 0}%</p>
                  <p>Garment cutout: {visionReport.garmentMatte || "loading"}</p>
                  <p>Fit tracking: {visionReport.segmentation ? "body matte" : "stabilized pose anchors"}</p>
                  <p>Lens scale: {visionReport.fitScale ? `${visionReport.fitScale}%` : "waiting"}</p>
                  <p>Status: {visionReport.status}</p>
                </div>
                <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{visionReport.message}</p>
              </div>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-[var(--gold-soft)]">
                  <Ruler size={17} /> Suggested size
                </p>
                <p className="mt-3 text-3xl font-semibold">{suggestedSize}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                  Based on height, fit preference, body landmarks and available PAAG sizes.
                </p>
              </div>

              <div className="grid gap-3 md:col-span-2 xl:col-span-4 2xl:col-span-5 md:grid-cols-2">
                <button
                  className="btn-primary justify-center"
                  type="button"
                  onClick={() => addProduct(product, suggestedSize)}
                >
                  <ShoppingBag size={17} /> Add suggested size
                </button>
                <Link className="btn-secondary justify-center" href={`/product/${product.slug}`}>
                  View product details
                </Link>
              </div>
            </div>
          </div>
        </section>

        <aside className="h-fit rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 xl:col-span-2 2xl:col-span-1">
          <div className="flex items-center gap-2 text-[var(--gold-soft)]">
            <SlidersHorizontal size={18} />
            <h2 className="font-semibold">Fine tune live fit</h2>
          </div>
          <div className="mt-5 grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-1">
            <label className="grid gap-2">
              Height: {height} cm
              <input
                max="182"
                min="145"
                type="range"
                value={height}
                onChange={(event) => setHeight(Number(event.target.value))}
              />
            </label>
            <label className="grid gap-2">
              Fit preference
              <select className="field" value={fit} onChange={(event) => setFit(event.target.value)}>
                <option value="close">Close fit</option>
                <option value="regular">Regular fit</option>
                <option value="relaxed">Relaxed fit</option>
              </select>
            </label>
            <label className="grid gap-2">
              Garment scale: {scale}%
              <input
                max="92"
                min="38"
                type="range"
                value={scale}
                onChange={(event) => setScale(Number(event.target.value))}
              />
            </label>
            <label className="grid gap-2">
              Left / right: {horizontal}px
              <input
                max="120"
                min="-120"
                type="range"
                value={horizontal}
                onChange={(event) => setHorizontal(Number(event.target.value))}
              />
            </label>
            <label className="grid gap-2">
              Shoulder lift: {vertical}px
              <input
                max="120"
                min="-80"
                type="range"
                value={vertical}
                onChange={(event) => setVertical(Number(event.target.value))}
              />
            </label>
            <label className="grid gap-2">
              Garment opacity: {opacity}%
              <input
                max="100"
                min="50"
                type="range"
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] p-4 text-sm text-[var(--muted)]">
            <p className="flex items-center gap-2 font-semibold text-[var(--gold-soft)]">
              <ImageIcon size={17} /> How live try-on works
            </p>
            <p className="mt-2 leading-6">
              The product photo is first converted into a clothing boundary,
              then live shoulder and hip anchors size and warp that cutout over
              the camera frame.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
