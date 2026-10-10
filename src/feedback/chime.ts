/**
 * 多巴胺音效（PRD §4 模块4 / §6.1）。
 * 纯 Web Audio 实时合成，零网络请求、秒开。
 * 设计：钟声式双分音（基频 + 2.01 倍泛音）+ 高频瞬态，按连击数在五声音阶上递进。
 */

const PENTATONIC = [1046.5, 1318.51, 1567.98, 1760.0, 2093.0];

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!context) context = new Ctor();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

/** 必须在一次用户手势里调用一次，iOS Safari 才允许后续播放。 */
export function unlockAudio(): void {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // 忽略：音频不可用时应用其余功能必须照常工作。
  }
}

function tone(ctx: AudioContext, destination: AudioNode, frequency: number, start: number, duration: number, gain: number): void {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, start);

  // 钟声包络：极快起音 + 指数衰减
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(amp).connect(destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function transient(ctx: AudioContext, destination: AudioNode, start: number, amount: number): void {
  const length = Math.floor(ctx.sampleRate * 0.012);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 3200;

  const amp = ctx.createGain();
  amp.gain.value = amount;
  source.connect(filter).connect(amp).connect(destination);
  source.start(start);
}

function masterGain(ctx: AudioContext, volume: number): GainNode {
  const master = ctx.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume));
  master.connect(ctx.destination);
  return master;
}

/** 任务完成：明亮上扬的水晶 Ding。连击越高，音高越亮。 */
export function playChime(volume = 0.6, combo = 1): void {
  const ctx = getContext();
  if (!ctx) return;
  const master = masterGain(ctx, volume);
  const now = ctx.currentTime + 0.01;
  const step = Math.min(Math.max(combo, 1) - 1, PENTATONIC.length - 1);
  const base = PENTATONIC[step];

  tone(ctx, master, base, now, 0.55, 0.34);
  tone(ctx, master, base * 2.01, now, 0.34, 0.1);
  tone(ctx, master, base * 1.5, now + 0.055, 0.4, 0.14);
  transient(ctx, master, now, 0.06);

  window.setTimeout(() => master.disconnect(), 1200);
}

/** 微步骤完成：更轻、更短的一声，避免抢戏。 */
export function playTick(volume = 0.6): void {
  const ctx = getContext();
  if (!ctx) return;
  const master = masterGain(ctx, volume * 0.7);
  const now = ctx.currentTime + 0.01;
  tone(ctx, master, 1567.98, now, 0.16, 0.16);
  transient(ctx, master, now, 0.035);
  window.setTimeout(() => master.disconnect(), 600);
}

/** 连击中断 / 撤销：一声朝下的软提示。 */
export function playSoftReset(volume = 0.6): void {
  const ctx = getContext();
  if (!ctx) return;
  const master = masterGain(ctx, volume * 0.55);
  const now = ctx.currentTime + 0.01;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(620, now);
  osc.frequency.exponentialRampToValueAtTime(330, now + 0.22);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(0.22, now + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
  osc.connect(amp).connect(master);
  osc.start(now);
  osc.stop(now + 0.3);
  window.setTimeout(() => master.disconnect(), 700);
}

/** 番茄钟结束：三声上行提示。 */
export function playTimerEnd(volume = 0.6): void {
  const ctx = getContext();
  if (!ctx) return;
  const master = masterGain(ctx, volume);
  const now = ctx.currentTime + 0.01;
  [880, 1108.73, 1318.51].forEach((frequency, index) => {
    tone(ctx, master, frequency, now + index * 0.16, 0.5, 0.26);
  });
  window.setTimeout(() => master.disconnect(), 1600);
}
