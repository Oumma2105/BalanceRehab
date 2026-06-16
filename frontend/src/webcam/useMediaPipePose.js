import { useEffect, useRef, useState } from "react";
import { FilesetResolver, HolisticLandmarker } from "@mediapipe/tasks-vision";

import { calculatePostureMetrics } from "./poseMetrics.js";
import { clearPoseOverlay, drawHolisticOverlay } from "./poseDrawing.js";
import { holisticTrackingConfig } from "./webcamConfig.js";

const emptyTracking = {
  bodyDetected: false,
  faceDetected: false,
  leftHandDetected: false,
  rightHandDetected: false,
  fps: 0,
  processing: false,
};

const emptyHolisticLandmarks = {
  pose: [],
  poseWorld: [],
  face: [],
  faceBlendshapes: [],
  leftHand: [],
  leftHandWorld: [],
  rightHand: [],
  rightHandWorld: [],
};

export function useMediaPipePose({ videoRef, canvasRef, active, onMetrics, onState, t }) {
  const [state, setState] = useState({
    status: "idle",
    error: "",
    landmarks: [],
    holistic: emptyHolisticLandmarks,
    metrics: null,
    tracking: emptyTracking,
  });
  const onMetricsRef = useRef(onMetrics);
  const onStateRef = useRef(onState);
  const lastLoggedCountsRef = useRef("");

  useEffect(() => {
    onMetricsRef.current = onMetrics;
  }, [onMetrics]);

  useEffect(() => {
    onStateRef.current = onState;
  }, [onState]);

  useEffect(() => {
    if (!active) {
      clearPoseOverlay(canvasRef.current);
      setState((current) => ({
        ...current,
        status: "idle",
        error: "",
        tracking: emptyTracking,
      }));
      return undefined;
    }

    let cancelled = false;
    let animationFrame = 0;
    let landmarker = null;
    let processing = false;
    let lastFrameTimestamp = -1;
    let lastFpsTimestamp = performance.now();
    let frameCount = 0;
    let displayedFps = 0;

    function updateFps(now) {
      frameCount += 1;
      const elapsed = now - lastFpsTimestamp;
      if (elapsed >= 500) {
        displayedFps = Math.round((frameCount * 1000) / elapsed);
        frameCount = 0;
        lastFpsTimestamp = now;
      }
      return displayedFps;
    }

    function normalizeResults(results, now) {
      const holistic = {
        pose: firstLandmarkSet(results?.poseLandmarks),
        poseWorld: firstLandmarkSet(results?.poseWorldLandmarks),
        face: firstLandmarkSet(results?.faceLandmarks),
        faceBlendshapes: results?.faceBlendshapes?.[0]?.categories ?? [],
        leftHand: firstLandmarkSet(results?.leftHandLandmarks),
        leftHandWorld: firstLandmarkSet(results?.leftHandWorldLandmarks),
        rightHand: firstLandmarkSet(results?.rightHandLandmarks),
        rightHandWorld: firstLandmarkSet(results?.rightHandWorldLandmarks),
      };
      const tracking = {
        bodyDetected: holistic.pose.length > 0,
        faceDetected: holistic.face.length > 0,
        leftHandDetected: holistic.leftHand.length > 0,
        rightHandDetected: holistic.rightHand.length > 0,
        fps: updateFps(now),
        processing: false,
      };

      return { holistic, tracking };
    }

    function logCounts(holistic) {
      const counts = {
        pose: holistic.pose.length,
        face: holistic.face.length,
        leftHand: holistic.leftHand.length,
        rightHand: holistic.rightHand.length,
      };
      const key = `${counts.pose}|${counts.face}|${counts.leftHand}|${counts.rightHand}`;
      if (lastLoggedCountsRef.current === key) return;
      lastLoggedCountsRef.current = key;
      console.info("[BalanceRehab] pose landmarks count", counts.pose);
      console.info("[BalanceRehab] face landmarks count", counts.face);
      console.info("[BalanceRehab] left hand landmarks count", counts.leftHand);
      console.info("[BalanceRehab] right hand landmarks count", counts.rightHand);
    }

    function buildReadiness(holistic, tracking, video) {
      const cameraActive = Boolean(active && video?.srcObject && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0);
      const modelActive = Boolean(landmarker);
      const personDetected = tracking.bodyDetected;
      const fullBody = evaluateFullBodyVisibility(holistic.pose);
      const handsDetected = tracking.leftHandDetected || tracking.rightHandDetected;
      const bodyBlockedByHands = handsDetected && !fullBody.visible;
      const ready = cameraActive && modelActive && fullBody.visible;
      const blockedMessage = t.handsBodyBlocked ?? "Hands detected, but body is blocked. Move your hands away and step back.";
      const moveBackMessage = t.moveBackwardUntilVisible ?? "Move back until your full body is visible.";
      const feedback = ready
        ? t.stablePosture ?? "Stable posture"
        : bodyBlockedByHands
          ? blockedMessage
          : moveBackMessage;
      return {
        ready,
        cameraActive,
        modelActive,
        personDetected,
        fullBodyVisible: fullBody.visible,
        bodyBlockedByHands,
        missingBodyLandmarks: fullBody.missing,
        level: ready ? "stable" : "warning",
        feedback,
        moveHint: ready ? "" : feedback,
      };
    }

    function publishState(nextState) {
      setState(nextState);
      onStateRef.current?.({
        ...nextState,
        fps: nextState.tracking?.fps ?? 0,
        processingStatus: nextState.tracking?.processing ? "processing" : nextState.status,
        engineMode: "holistic",
      });
    }

    function processFrame(now) {
      if (cancelled) return;

      const video = videoRef.current;
      const hasFrame = video?.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0;
      if (hasFrame && !processing && landmarker) {
        const timestamp = Math.max(Math.floor(now), lastFrameTimestamp + 1);
        lastFrameTimestamp = timestamp;
        processing = true;

        try {
          const results = landmarker.detectForVideo(video, timestamp);
          const { holistic, tracking } = normalizeResults(results, now);
          logCounts(holistic);
          const metrics = calculatePostureMetrics({ holistic, tracking }, t);
          const readiness = buildReadiness(holistic, tracking, video);

          drawHolisticOverlay({
            canvas: canvasRef.current,
            video,
            holistic,
            connections: {
              pose: HolisticLandmarker.POSE_CONNECTIONS,
              hand: HolisticLandmarker.HAND_CONNECTIONS,
              face: HolisticLandmarker.FACE_LANDMARKS_TESSELATION,
              faceContours: HolisticLandmarker.FACE_LANDMARKS_CONTOURS,
            },
          });

          if (metrics) onMetricsRef.current?.(metrics);
          publishState({
            status: tracking.bodyDetected ? "tracking" : "searching",
            error: "",
            landmarks: holistic.pose,
            holistic,
            metrics,
            tracking,
            readiness,
          });
        } catch (error) {
          if (!cancelled) {
            setState((current) => {
              const updated = {
                ...current,
                status: "error",
                error: error.message || t.mediaPipeError || "MediaPipe holistic processing failed.",
                tracking: { ...current.tracking, processing: false },
              };
              onStateRef.current?.({
                ...updated,
                fps: updated.tracking?.fps ?? 0,
                processingStatus: "error",
                engineMode: "holistic",
              });
              return updated;
            });
          }
        } finally {
          processing = false;
        }
      }

      animationFrame = window.requestAnimationFrame(processFrame);
    }

    async function initializeHolistic() {
      try {
        setState((current) => ({
          ...current,
          status: "loading",
          error: "",
          tracking: { ...emptyTracking, processing: true },
        }));

        const vision = await FilesetResolver.forVisionTasks(holisticTrackingConfig.wasmBaseUrl);
        landmarker = await HolisticLandmarker.createFromOptions(vision, holisticTrackingConfig.options);
        console.info("[BalanceRehab] holistic model loaded");

        if (!cancelled) {
          const readyState = {
            status: "searching",
            error: "",
            landmarks: [],
            holistic: emptyHolisticLandmarks,
            metrics: null,
            tracking: { ...emptyTracking, processing: false },
            readiness: {
              ready: false,
              cameraActive: false,
              modelActive: true,
              personDetected: false,
              fullBodyVisible: false,
              bodyBlockedByHands: false,
              missingBodyLandmarks: ["shoulders", "hips", "knees", "ankles"],
              level: "warning",
              feedback: t.moveBackwardUntilVisible ?? "Move back until your full body is visible.",
              moveHint: t.moveBackwardUntilVisible ?? "Move back until your full body is visible.",
            },
          };
          setState((current) => ({
            ...current,
            status: "searching",
            error: "",
            tracking: { ...emptyTracking, processing: false },
          }));
          onStateRef.current?.({
            ...readyState,
            fps: 0,
            processingStatus: "searching",
            engineMode: "holistic",
          });
          animationFrame = window.requestAnimationFrame(processFrame);
        }
      } catch (error) {
        if (!cancelled) {
          setState((current) => {
            const updated = {
              ...current,
              status: "error",
              error: error.message || t.mediaPipeError || "MediaPipe holistic initialization failed.",
              tracking: { ...emptyTracking, processing: false },
              readiness: {
                ready: false,
                cameraActive: Boolean(active),
                modelActive: false,
                personDetected: false,
                fullBodyVisible: false,
                bodyBlockedByHands: false,
                missingBodyLandmarks: ["model"],
                level: "warning",
                feedback: t.modelDetectionCouldNotStart ?? "Camera is active, but pose detection could not start. Restart the assessment.",
                moveHint: "",
              },
            };
            onStateRef.current?.({
              ...updated,
              fps: 0,
              processingStatus: "error",
              engineMode: "",
            });
            return updated;
          });
        }
      }
    }

    initializeHolistic();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      clearPoseOverlay(canvasRef.current);
      landmarker?.close?.();
    };
  }, [active, canvasRef, t, videoRef]);

  return state;
}

function firstLandmarkSet(collection) {
  if (!Array.isArray(collection)) return [];
  if (Array.isArray(collection[0])) return collection[0];
  if (collection[0] && typeof collection[0] === "object" && "x" in collection[0] && "y" in collection[0]) return collection;
  return [];
}

function evaluateFullBodyVisibility(poseLandmarks) {
  const groups = [
    ["shoulders", [11, 12]],
    ["hips", [23, 24]],
    ["knees", [25, 26]],
    ["ankles", [27, 28]],
  ];
  const missing = [];
  if (!Array.isArray(poseLandmarks) || poseLandmarks.length < 29) {
    return { visible: false, missing: groups.map(([name]) => name) };
  }

  groups.forEach(([name, indexes]) => {
    if (!indexes.every((index) => isGoodBodyLandmark(poseLandmarks[index]))) {
      missing.push(name);
    }
  });

  const footIndexes = [29, 30, 31, 32].filter((index) => poseLandmarks[index]);
  if (footIndexes.length > 0 && !footIndexes.some((index) => isUsableBodyLandmark(poseLandmarks[index]))) {
    missing.push("feet");
  }

  return {
    visible: missing.length === 0,
    missing,
  };
}

function isGoodBodyLandmark(point) {
  return isUsableBodyLandmark(point, 0.5);
}

function isUsableBodyLandmark(point, minVisibility = 0.35) {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y) && (point.visibility == null || point.visibility >= minVisibility));
}
