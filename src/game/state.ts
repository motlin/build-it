import {LEVELS} from "./levels.ts";
import type {Game, Keys, Level, Particle, Run, Settings, World} from "./types.ts";

// The mutable state every part of the game shares: the course being played, the player setup, the game in progress,
// the simulated world with the run in it, and the piece being placed.

export const COLORS = ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#ff8c00", "#9b5de5", "#00bbf9", "#8ac926"];

/** The level in play, the cells its ground and lava fill, and the cells around its start, flag and switch that stay clear. */
export const course:
{
	level: Level;
	base: Set<string>;
	safe: Set<string>;
} =
{
	level: LEVELS[0]!,
	base: new Set(),
	safe: new Set(),
};

const defaultSettings = (): Settings => (
{
	count: 4,
	names: ["Red", "Sunny", "Mint", "Ocean", "Orange", "Grape", "Sky", "Lime"],
	target: 15,
	cpu: [],
	skill: 1,
	noFF: false,
	colors: COLORS.slice(),
});
export const settings: Settings = defaultSettings();

export const game: Game =
{
	drought: 0,
	solo: false,
	best: {},
	hist: [],
	players: [],
	target: 15,
	round: 0,
	pieces: [],
	phase: "setup",
	order: [],
	turn: 0,
	box: [],
	picks: {},
	rot: 0,
	results: [],
	sel: null,
	votes: [],
	chosen: 0,
	lastMsg: "",
	lastFin: 0,
	skill: 1,
	noFF: false,
	portalA: null,
	mystTaken: false,
	revealing: false,
};

export const emptyWorld = (): World => (
{
	time: 0,
	solids: [],
	hazards: [],
	movers: [],
	crumbles: [],
	cannons: [],
	balls: [],
	firebars: [],
	firetracks: [],
	portals: [],
	sawtracks: [],
	lasers: [],
	fans: [],
	vines: [],
	pops: [],
	axes: [],
	crushers: [],
	gate: null,
	swOn: false,
	sawT: 0,
});

/**
 * The world and the run in it. `clock` is the time every moving piece keys off. `quiet` is set while a CPU player
 * plans with the real physics, so its trial runs make no sound and no particles.
 */
export const sim:
{
	world: World;
	run: Run | null;
	keys: Keys;
	clock: number;
	quiet: boolean;
	fx: Particle[];
} =
{
	world: emptyWorld(),
	run: null,
	keys:
	{
		l: 0,
		r: 0,
		j: 0,
		d: 0,
	},
	clock: 0,
	quiet: false,
	fx: [],
};

/** Where the held piece would go (`ghost`), the spot waiting for a confirm (`pend`), and whether discard is armed. */
export const placing:
{
	ghost:
	{
		c: number;
		r: number;
		ok: boolean;
	} | null;
	pend:
	{
		c: number;
		r: number;
	} | null;
	discardArm: boolean;
} =
{
	ghost: null,
	pend: null,
	discardArm: false,
};
