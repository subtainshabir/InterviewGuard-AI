import * as ort from "onnxruntime-web";

/**
 * Ultralytics YOLO11 (Latest) Object Detector
 * Runs yolo11n.onnx in-browser via onnxruntime-web (WebAssembly + SIMD).
 */

export const COCO_CLASSES = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
  "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
  "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
  "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle",
  "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
  "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed",
  "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven",
  "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"
];

// Configure onnxruntime-web WASM binary location via CDN to avoid Vite /public import restrictions
if (typeof window !== "undefined" && ort?.env?.wasm) {
  ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/";
  ort.env.wasm.numThreads = 1;
}

let yoloSessionPromise = null;
let offscreenCanvas = null;
let offscreenCtx = null;

export async function loadYoloModel() {
  if (!yoloSessionPromise) {
    yoloSessionPromise = (async () => {
      const modelPath = "/models/yolo/yolo11n.onnx";
      try {
        const session = await ort.InferenceSession.create(modelPath, {
          executionProviders: ["wasm"],
          graphOptimizationLevel: "all",
        });
        return session;
      } catch (err) {
        console.error("[yoloDetector] Failed to load YOLO11 ONNX model:", err);
        throw err;
      }
    })().catch((err) => {
      yoloSessionPromise = null;
      throw err;
    });
  }
  return yoloSessionPromise;
}

/**
 * Executes real-time YOLO11 inference on HTMLVideoElement
 * Returns detections: Array<{ bbox: [x, y, width, height], class: string, score: number }>
 */
export async function detectYolo(session, video, minScore = 0.50, iouThreshold = 0.50) {
  if (!video || video.readyState < 2 || !session) return [];

  const videoWidth = video.videoWidth || 640;
  const videoHeight = video.videoHeight || 480;

  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = 640;
    offscreenCanvas.height = 640;
    offscreenCtx = offscreenCanvas.getContext("2d", { willReadFrequently: true });
  }

  // Draw scaled video frame onto 640x640 canvas
  offscreenCtx.drawImage(video, 0, 0, 640, 640);
  const imgData = offscreenCtx.getImageData(0, 0, 640, 640);
  const data = imgData.data;
  const numPixels = 640 * 640;
  const float32Data = new Float32Array(3 * numPixels);

  // Convert HWC uint8 [0..255] to CHW float32 [0.0..1.0]
  for (let i = 0; i < numPixels; i++) {
    float32Data[i] = data[i * 4] / 255.0;                   // Red channel
    float32Data[numPixels + i] = data[i * 4 + 1] / 255.0;   // Green channel
    float32Data[2 * numPixels + i] = data[i * 4 + 2] / 255.0; // Blue channel
  }

  const inputTensor = new ort.Tensor("float32", float32Data, [1, 3, 640, 640]);
  const results = await session.run({ images: inputTensor });
  const output = results.output0.data; // Float32Array of shape [1, 84, 8400]

  const rawCandidates = [];
  const scaleX = videoWidth / 640;
  const scaleY = videoHeight / 640;

  // Process 8400 candidate anchor predictions
  for (let c = 0; c < 8400; c++) {
    let bestScore = 0;
    let bestCls = -1;

    for (let cls = 0; cls < 80; cls++) {
      const score = output[(4 + cls) * 8400 + c];
      if (score > bestScore) {
        bestScore = score;
        bestCls = cls;
      }
    }

    if (bestScore >= minScore) {
      const cx = output[0 * 8400 + c];
      const cy = output[1 * 8400 + c];
      const w = output[2 * 8400 + c];
      const h = output[3 * 8400 + c];

      const x = (cx - w / 2) * scaleX;
      const y = (cy - h / 2) * scaleY;
      const width = w * scaleX;
      const height = h * scaleY;

      rawCandidates.push({
        x: Math.max(0, x),
        y: Math.max(0, y),
        width: Math.min(videoWidth, width),
        height: Math.min(videoHeight, height),
        score: bestScore,
        classIndex: bestCls,
        className: COCO_CLASSES[bestCls],
      });
    }
  }

  // Non-Maximum Suppression (NMS)
  const nmsBoxes = applyNms(rawCandidates, iouThreshold);

  return nmsBoxes.map((b) => ({
    bbox: [b.x, b.y, b.width, b.height],
    class: b.className,
    score: b.score,
  }));
}

function applyNms(boxes, iouThreshold = 0.45) {
  boxes.sort((a, b) => b.score - a.score);
  const selected = [];

  for (const box of boxes) {
    let keep = true;
    for (const prev of selected) {
      if (prev.classIndex !== box.classIndex) continue;

      const x1 = Math.max(box.x, prev.x);
      const y1 = Math.max(box.y, prev.y);
      const x2 = Math.min(box.x + box.width, prev.x + prev.width);
      const y2 = Math.min(box.y + box.height, prev.y + prev.height);

      const interW = Math.max(0, x2 - x1);
      const interH = Math.max(0, y2 - y1);
      const inter = interW * interH;
      const union = box.width * box.height + prev.width * prev.height - inter;

      if (union > 0 && inter / union > iouThreshold) {
        keep = false;
        break;
      }
    }

    if (keep) {
      selected.push(box);
      if (selected.length >= 25) break;
    }
  }

  return selected;
}
