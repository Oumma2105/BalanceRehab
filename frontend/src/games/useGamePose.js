import { useEffect, useRef, useState } from "react";
import { Pose } from "@mediapipe/pose";

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

/**
 * MediaPipe Pose hook for rehab games.
 * Returns mirrored, game-ready body/hand coordinates.
 * onFrame fires every detected frame with game data.
 */
export function useGamePose({ stream, onFrame }) {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const videoRef = useRef(null);
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (!stream) {
      setStatus("idle");
      setError("");
      return undefined;
    }

    let cancelled = false;
    let animFrame = 0;
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
        } catch (err) {
          if (!cancelled) {
            setStatus("error");
            setError(err.message || "MediaPipe frame error");
          }
        } finally {
          processing = false;
        }
      }
      animFrame = requestAnimationFrame(processFrame);
    }

    async function init() {
      try {
        setStatus("loading");
        setError("");
        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        pose.onResults((results) => {
          if (cancelled) return;
          const lm = results.poseLandmarks ?? [];
          const gameData = extractGameData(lm);
          setStatus(lm.length > 0 ? "tracking" : "searching");
          if (gameData) onFrameRef.current?.(gameData);
        });
        await pose.initialize?.();
        if (!cancelled) {
          setStatus("searching");
          animFrame = requestAnimationFrame(processFrame);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setError(err.message || "MediaPipe init failed");
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrame);
      pose.close?.();
    };
  }, [stream]);

  return { videoRef, status, error };
}

/**
 * Extract mirrored game-relevant coordinates from raw MediaPipe pose landmarks.
 * X coordinates are flipped (1-x) to match the mirrored video feed.
 */
export function extractGameData(poseLandmarks) {
  if (!poseLandmarks || poseLandmarks.length < 25) return null;

  const ls = poseLandmarks[11]; // left shoulder
  const rs = poseLandmarks[12]; // right shoulder
  const lh = poseLandmarks[23]; // left hip
  const rh = poseLandmarks[24]; // right hip
  const lw = poseLandmarks[15]; // left wrist
  const rw = poseLandmarks[16]; // right wrist

  if ([ls, rs, lh, rh].some((p) => !p || (p.visibility ?? 0) < 0.3)) return null;

  const hipCX = (lh.x + rh.x) / 2;
  const hipCY = (lh.y + rh.y) / 2;
  const shoulderCX = (ls.x + rs.x) / 2;
  const shoulderCY = (ls.y + rs.y) / 2;

  // Body center weighted toward hips (more stable for balance games)
  const bodyCX = hipCX * 0.6 + shoulderCX * 0.4;
  const bodyCY = hipCY * 0.6 + shoulderCY * 0.4;

  const lwVisible = (lw?.visibility ?? 0) > 0.4;
  const rwVisible = (rw?.visibility ?? 0) > 0.4;

  return {
    // Mirrored: patient moves right → cursor moves right on screen
    bodyCenterX: 1 - bodyCX,
    bodyCenterY: bodyCY,
    hipCenterX: 1 - hipCX,
    hipCenterY: hipCY,
    shoulderCenterX: 1 - shoulderCX,
    shoulderCenterY: shoulderCY,
    leftWristX: lwVisible ? 1 - lw.x : null,
    leftWristY: lwVisible ? lw.y : null,
    rightWristX: rwVisible ? 1 - rw.x : null,
    rightWristY: rwVisible ? rw.y : null,
    timestamp: Date.now(),
  };
}
