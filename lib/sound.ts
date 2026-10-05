"use client";

// 8-bit blips with WebAudio square waves. Muted by default (see useUi.sound).
let ac: AudioContext | null = null;

function ctx() {
  if (typeof window === "undefined") return null;
  if (!ac) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
  }
  if (ac.state === "suspended") void ac.resume();
  return ac;
}

function tone(freqs: number[], step = 0.07, type: OscillatorType = "square", vol = 0.05) {
  const a = ctx();
  if (!a) return;
  const t0 = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  freqs.forEach((f, i) => o.frequency.setValueAtTime(f, t0 + i * step));
  g.gain.setValueAtTime(vol, t0);
  g.gain.setValueAtTime(0, t0 + freqs.length * step);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + freqs.length * step + 0.02);
}

export const sfx = {
  hire: () => tone([660, 990], 0.05),
  coin: () => tone([988, 1319], 0.06),
  launch: () => tone([392, 523, 659, 784, 1047], 0.06),
  death: () => tone([392, 330, 262, 196, 131], 0.11, "triangle", 0.08),
  bell: () => {
    tone([1568, 1568, 1175], 0.18, "triangle", 0.08);
    setTimeout(() => tone([1568, 1175], 0.22, "triangle", 0.06), 700);
  },
  click: () => tone([1200], 0.03),
};
