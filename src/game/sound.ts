import {sim} from "./state.ts";

// Every sound is one oscillator sweeping from one pitch to another: [start Hz, end Hz, seconds, wave, volume].
const SND =
{
	jump: [520, 780, 0.12, "square", 0.04],
	boing: [260, 900, 0.25, "triangle", 0.08],
	die: [420, 70, 0.45, "sawtooth", 0.06],
	win: [523, 1046, 0.4, "triangle", 0.09],
	place: [220, 360, 0.12, "triangle", 0.09],
	bad: [160, 110, 0.16, "square", 0.05],
	boom: [140, 35, 0.55, "sawtooth", 0.1],
	pick: [660, 990, 0.09, "triangle", 0.07],
	gate: [300, 1200, 0.5, "triangle", 0.09],
	shot: [220, 90, 0.1, "square", 0.025],
} satisfies Record<string, [number, number, number, OscillatorType, number]>;
export type Sound = keyof typeof SND;

export const sound:
{
	muted: boolean;
	ac: AudioContext | null;
} =
{
	muted: false,
	ac: null,
};

export function sfx(n: Sound): void
{
	if (sound.muted || sim.quiet) return;
	try
	{
		sound.ac ??= new AudioContext();
		const ac = sound.ac;
		const [f1, f2, d, ty, v] = SND[n];
		const t = ac.currentTime;
		const o = ac.createOscillator();
		const g = ac.createGain();
		o.type = ty;
		o.frequency.setValueAtTime(f1, t);
		o.frequency.exponentialRampToValueAtTime(f2, t + d);
		g.gain.setValueAtTime(v, t);
		g.gain.exponentialRampToValueAtTime(0.0001, t + d);
		o.connect(g).connect(ac.destination);
		o.start(t);
		o.stop(t + d);
	}
	catch
	{
		// No Web Audio, as in tests or a locked-down browser: the game plays on silently.
	}
}
