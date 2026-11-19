import { mkdirSync, writeFileSync } from "node:fs";

const RATE = 22050;
const SECONDS = 12;

function env(samples, rate, t, dur, freq, gain, wave) {
  const start = Math.floor(t * rate);
  const end = Math.min(samples.length, Math.floor((t + dur) * rate));
  for (let i = start; i < end; i++) {
    const p = (i - start) / rate;
    const attack = Math.min(1, p / 0.02);
    const release = Math.exp(-3.2 * (p / dur));
    const phase = (2 * Math.PI * freq * i) / rate;
    let s = Math.sin(phase);
    if (wave === "tri") s = (2 / Math.PI) * Math.asin(Math.sin(phase));
    samples[i] += s * gain * attack * release;
  }
}

function nightBus() {
  const samples = new Float32Array(RATE * SECONDS);
  const root = 110;
  const steps = [0, 3, 5, 7, 10];
  for (let i = 0; i < 24; i++) {
    const freq = root * 2 ** (steps[i % steps.length] / 12);
    env(samples, RATE, i * 0.5, 0.42, freq, 0.22, "tri");
    if (i % 2 === 0) env(samples, RATE, i * 0.5, 0.85, root / 2, 0.28, "sine");
  }
  return samples;
}

function copperWire() {
  const samples = new Float32Array(RATE * SECONDS);
  const root = 164.81;
  const steps = [0, 4, 7, 11, 12, 11, 7, 4];
  for (let i = 0; i < 48; i++) {
    const freq = root * 2 ** (steps[i % steps.length] / 12);
    env(samples, RATE, i * 0.25, 0.22, freq, i % 8 === 0 ? 0.16 : 0.2, "tri");
  }
  return samples;
}

function glassHour() {
  const samples = new Float32Array(RATE * SECONDS);
  const chord = [146.83, 220, 293.66, 369.99];
  for (let bar = 0; bar < 3; bar++) {
    const t = bar * 4;
    for (const freq of chord) env(samples, RATE, t, 3.5, freq, 0.1, "sine");
    env(samples, RATE, t + 2, 1.6, chord[2] * 2, 0.06, "tri");
  }
  return samples;
}

function encode(samples) {
  const frames = samples.length;
  const dataSize = frames * 2;
  const ab = Buffer.alloc(44 + dataSize);
  ab.write("RIFF", 0);
  ab.writeUInt32LE(36 + dataSize, 4);
  ab.write("WAVE", 8);
  ab.write("fmt ", 12);
  ab.writeUInt32LE(16, 16);
  ab.writeUInt16LE(1, 20);
  ab.writeUInt16LE(1, 22);
  ab.writeUInt32LE(RATE, 24);
  ab.writeUInt32LE(RATE * 2, 28);
  ab.writeUInt16LE(2, 32);
  ab.writeUInt16LE(16, 34);
  ab.write("data", 36);
  ab.writeUInt32LE(dataSize, 40);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    ab.writeInt16LE(sample < 0 ? sample * 0x8000 : sample * 0x7fff, offset);
    offset += 2;
  }
  return ab;
}

mkdirSync("public/demos", { recursive: true });
writeFileSync("public/demos/night-bus.wav", encode(nightBus()));
writeFileSync("public/demos/copper-wire.wav", encode(copperWire()));
writeFileSync("public/demos/glass-hour.wav", encode(glassHour()));
console.log("wrote demos");
