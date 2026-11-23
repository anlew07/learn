const CYCLE = 120;

const ease = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

function roundTrip(frame, cycle, approachFrames, holdFrames, distance) {
  const tick = frame % cycle;
  if (tick < approachFrames) {
    return { offset: Math.round(distance * ease(tick / approachFrames)), phase: "approach", interacting: false };
  }
  if (tick < approachFrames + holdFrames) {
    return { offset: distance, phase: "interact", interacting: true };
  }
  if (tick < approachFrames * 2 + holdFrames) {
    const progress = (tick - approachFrames - holdFrames) / approachFrames;
    return { offset: Math.round(distance * (1 - ease(progress))), phase: "return", interacting: false };
  }
  return { offset: 0, phase: "rest", interacting: false };
}

/**
 * Deterministic reenactment of the latest settled autonomous action.
 * This is a visual loop only: it never advances a day or simulates combat.
 */
export function getWorldActionMotion(activity, frame = 0, paused = false, hasEncounter = false) {
  const action = ["training", "gathering", "exploring", "defending", "rescuing"].includes(activity)
    ? activity : "observing";
  const tick = (Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0) % CYCLE;
  const flipX = action === "gathering";

  if (paused) {
    return {
      offsetX: 0, offsetY: 0, bob: 0, flipX,
      phase: "paused", interacting: false, pulse: false, strike: false, paused: true,
    };
  }

  if (action === "defending") {
    const phase = tick % 30;
    let offsetX = 0;
    let motionPhase = "rest";
    if (phase < 9) {
      offsetX = Math.round(22 * ease(phase / 9));
      motionPhase = "approach";
    } else if (phase < 20) {
      offsetX = 22;
      motionPhase = "strike";
    } else if (phase < 26) {
      offsetX = Math.round(22 * (1 - ease((phase - 20) / 6)));
      motionPhase = "recover";
    }
    return {
      offsetX,
      offsetY: hasEncounter && phase >= 13 && phase <= 19 ? -1 : 0,
      bob: 0,
      flipX: false,
      phase: motionPhase,
      interacting: motionPhase === "strike",
      pulse: false,
      strike: Boolean(hasEncounter && phase >= 13 && phase <= 19),
      paused: false,
    };
  }

  if (action === "gathering") {
    const motion = roundTrip(tick, 96, 18, 22, -12);
    return {
      offsetX: motion.offset, offsetY: motion.interacting ? 2 : 0,
      bob: 0, flipX, phase: motion.phase, interacting: motion.interacting,
      pulse: motion.interacting, strike: false, paused: false,
    };
  }

  if (action === "exploring") {
    const motion = roundTrip(tick, 112, 24, 20, 22);
    return {
      offsetX: motion.offset, offsetY: motion.interacting ? -1 : 0,
      bob: 0, flipX, phase: motion.phase, interacting: motion.interacting,
      pulse: motion.interacting, strike: false, paused: false,
    };
  }

  if (action === "rescuing") {
    const motion = roundTrip(tick, 112, 24, 28, 12);
    return {
      offsetX: motion.offset, offsetY: motion.interacting ? -2 : 0,
      bob: 0, flipX, phase: motion.phase, interacting: motion.interacting,
      pulse: motion.interacting, strike: false, paused: false,
    };
  }

  if (action === "training") {
    const pulse = tick % 48 < 22;
    return {
      offsetX: 0, offsetY: pulse ? -2 : 0, bob: pulse ? 1 : 0,
      flipX: false, phase: pulse ? "channel" : "rest", interacting: pulse,
      pulse, strike: false, paused: false,
    };
  }

  return {
    offsetX: 0, offsetY: 0, bob: tick % 24 < 12 ? 0 : 1,
    flipX: false, phase: "observing", interacting: false,
    pulse: false, strike: false, paused: false,
  };
}
