let ctx = null;
let last = 0;
let enabled = true;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export const sound = {
  get enabled() {
    return enabled;
  },
  set enabled(v) {
    enabled = !!v;
  },
  /** Short mechanical flap click. Safe to call very often; internally throttled. */
  click(vol = 1) {
    if (!enabled) return;
    const now = performance.now();
    if (now - last < 26) return;
    last = now;
    try {
      const a = ac();
      const t = a.currentTime;

      const dur = 0.045;
      const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
      const src = a.createBufferSource();
      src.buffer = buf;
      const bp = a.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1600 + Math.random() * 1100;
      bp.Q.value = 0.9;
      const g = a.createGain();
      g.gain.value = 0.4 * vol * (0.7 + Math.random() * 0.5);
      src.connect(bp).connect(g).connect(a.destination);
      src.start(t);

      const o = a.createOscillator();
      const og = a.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.05);
      og.gain.setValueAtTime(0.09 * vol, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.065);
      o.connect(og).connect(a.destination);
      o.start(t);
      o.stop(t + 0.08);
    } catch (e) {
      /* audio unavailable */
    }
  },
};
