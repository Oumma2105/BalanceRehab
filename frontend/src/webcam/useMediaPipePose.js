import { useEffect, useRef, useState } from "react";
import { Pose, POSE_CONNECTIONS } from "@mediapipe/pose";

import packedAssetsUrl from "@mediapipe/pose/pose_solution_packed_assets.data?url";
import packedAssetsLoaderUrl from "@mediapipe/pose/pose_solution_packed_assets_loader.js?url";
import simdDataUrl from "@mediapipe/pose/pose_solution_simd_wasm_bin.data?url";
import simdJsUrl from "@mediapipe/pose/pose_solution_simd_wasm_bin.js?url";
import simdWasmUrl from "@mediapipe/pose/pose_solution_simd_wasm_bin.wasm?url";
import wasmJsUrl from "@mediapipe/pose/pose_solution_wasm_bin.js?url";
import wasmUrl from "@mediapipe/pose/pose_solution_wasm_bin.wasm?url";
import poseBinaryUrl from "@mediapipe/pose/pose_web.binarypb?url";
import poseLiteModelUrl from "@mediapipe/pose/pose_landmark_lite.tflite?url";
import poseFullModelUrl from "@mediapipe/pose/pose_landmark_full.tflite?url";
import poseHeavyModelUrl from "@mediapipe/pose/pose_landmark_heavy.tflite?url";

import { calculatePostureMetrics } from "./poseMetrics.js";
import { clearPoseOverlay, drawPoseOverlay } from "./poseDrawing.js";
import { mediaPipePoseOptions } from "./webcamConfig.js";

const poseAssets = {
  "pose_solution_packed_assets.data": packedAssetsUrl,
  "pose_solution_packed_assets_loader.js": packedAssetsLoaderUrl,
  "pose_solution_simd_wasm_bin.data": simdDataUrl,
  "pose_solution_simd_wasm_bin.js": simdJsUrl,
  "pose_solution_simd_wasm_bin.wasm": simdWasmUrl,
  "pose_solution_wasm_bin.js": wasmJsUrl,
  "pose_solution_wasm_bin.wasm": wasmUrl,
  "pose_web.binarypb": poseBinaryUrl,
  "pose_landmark_lite.tflite": poseLiteModelUrl,
  "pose_landmark_full.tflite": poseFullModelUrl,
  "pose_landmark_heavy.tflite": poseHeavyModelUrl,
};

export function useMediaPipePose({ videoRef, canvasRef, active, onMetrics, t }) {
  const [state, setState] = useState({
    status: "idle",
    error: "",
    landmarks: [],
    metrics: null,
  });
  const onMetricsRef = useRef(onMetrics);

  useEffect(() => {
    onMetricsRef.current = onMetrics;
  }, [onMetrics]);

  useEffect(() => {
    if (!active) {
      clearPoseOverlay(canvasRef.current);
      setState((current) => ({ ...current, status: "idle", error: "" }));
      return undefined;
    }

    let cancelled = false;
    let animationFrame = 0;
    let processing = false;
    const pose = new Pose({
      locateFile: (file) => poseAssets[file] ?? file,
    });

    async function processFrame() {
      if (cancelled) return;

      const video = videoRef.current;
      if (video?.readyState >= 2 && !processing) {
        processing = true;
        try {
          await pose.send({ image: video });
        } catch (error) {
          if (!cancelled) {
            setState((current) => ({
              ...current,
              status: "error",
              error: error.message || t.mediaPipeError || "MediaPipe pose processing failed.",
            }));
          }
        } finally {
          processing = false;
        }
      }

      animationFrame = window.requestAnimationFrame(processFrame);
    }

    async function initializePose() {
      try {
        setState((current) => ({ ...current, status: "loading", error: "" }));
        pose.setOptions(mediaPipePoseOptions);
        pose.onResults((results) => {
          if (cancelled) return;
          const detectedLandmarks = results.poseLandmarks ?? [];
          const metrics = calculatePostureMetrics(detectedLandmarks, t);
          drawPoseOverlay({
            canvas: canvasRef.current,
            video: videoRef.current,
            landmarks: detectedLandmarks,
            connections: POSE_CONNECTIONS,
          });
          if (metrics) onMetricsRef.current?.(metrics);
          setState({
            status: detectedLandmarks.length ? "tracking" : "searching",
            error: "",
            landmarks: detectedLandmarks,
            metrics,
          });
        });
        await pose.initialize?.();
        if (!cancelled) {
          setState((current) => ({ ...current, status: "searching", error: "" }));
          animationFrame = window.requestAnimationFrame(processFrame);
        }
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            status: "error",
            error: error.message || t.mediaPipeError || "MediaPipe pose initialization failed.",
          }));
        }
      }
    }

    initializePose();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      clearPoseOverlay(canvasRef.current);
      pose.close?.();
    };
  }, [active, canvasRef, t, videoRef]);

  return state;
}
