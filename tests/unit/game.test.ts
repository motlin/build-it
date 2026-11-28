import {afterEach, expect, it, vi} from "vite-plus/test";
import {setLevel, valid} from "../../src/game/course.ts";
import {STEP} from "../../src/game/geometry.ts";
import {LEVELS} from "../../src/game/levels.ts";
import {newRunner, stepRun} from "../../src/game/physics.ts";
import {DEFS, pieceCells, TYPES} from "../../src/game/pieces.ts";
import {explore, genCourse} from "../../src/game/solver.ts";
import {course, game, sim} from "../../src/game/state.ts";
import type {Piece, Run} from "../../src/game/types.ts";
import {buildWorld, updateWorld} from "../../src/game/world.ts";

afterEach(() => vi.restoreAllMocks());

// Puts a run on the first level, The Gap, with the given pieces, from the start or from (x, y), and returns it.
function startRun(
	pieces: Piece[],
	at?:
	{
		x: number;
		y: number;
	},
): Run
{
	setLevel(LEVELS[0]!);
	game.players = [
		{
			name: "Red",
			color: "#ef476f",
			score: 0,
			cpu: false,
		},
		{
			name: "Sunny",
			color: "#ffd166",
			score: 0,
			cpu: false,
		},
	];
	game.noFF = false;
	game.pieces = pieces;
	sim.clock = 0;
	sim.keys =
	{
		l: 0,
		r: 0,
		j: 0,
	};
	buildWorld();
	const run: Run =
	{
		pi: 0,
		p:
		{
			...newRunner(),
			...at,
		},
		state: "go",
		t: 0,
		idle: 0,
		doneT: 0,
	};
	sim.run = run;
	return run;
}

// Steps the run until it lands on something, it ends, or a second passes, and returns the steps taken.
function stepUntil(run: Run, done: () => boolean): number
{
	for (let i = 1; i <= 120; i++)
	{
		stepRun(STEP);
		if (done() || run.state !== "go") return i;
	}
	return 120;
}

// A piece's cells drawn as rows of # and ., so a rotation reads as its shape.
function picture(cells: [number, number][]): string
{
	const w = Math.max(...cells.map(([x]) => x)) + 1;
	const h = Math.max(...cells.map(([, y]) => y)) + 1;
	return Array.from(
		{
			length: h,
		},
		(_row, y) =>
			Array.from(
				{
					length: w,
				},
				(_, x) => (cells.some(([cx, cy]) => cx === x && cy === y) ? "#" : "."),
			).join(""),
	).join("/");
}

it("lists every piece once, with the cells each rotation covers", () =>
{
	expect(TYPES).toStrictEqual(Object.keys(DEFS));
	expect(
		Object.fromEntries(
			TYPES.map((t) => [
				t,
				Array.from(
					{
						length: DEFS[t].rots,
					},
					(_, rot) => picture(DEFS[t].cells(rot)),
				),
			]),
		),
	).toStrictEqual(
		{
			block: ["#"],
			plank: ["###", "#/#/#"],
			big: ["##/##"],
			ell: ["#./##", "##/#.", "##/.#", ".#/##"],
			spring: ["#"],
			mover: ["#####", "##/##/##/##"],
			ice: ["###"],
			belt: ["###", "###"],
			crumble: ["##"],
			spikes: ["##", "#/#", "##", "#/#"],
			saw: ["#"],
			cannon: ["#", "#", "#", "#"],
			firebar: ["#", "#"],
			firetrack: ["####", "#/#/#/#"],
			sawtrack: ["####", "#/#/#/#"],
			laser: ["#/#/#", "###"],
			bridge: ["#####", "#/#/#/#/#"],
			cloud: ["###"],
			vine: ["#/#/#/#"],
			jelly: ["##"],
			popspikes: ["##"],
			axe: ["#"],
			crusher: ["#/#/#/#"],
			fan: ["#", "#", "#", "#"],
			booster: ["#", "#"],
			blink: ["####", "#/#/#/#"],
			bomb: ["###/###/###"],
		},
	);
	expect(
		pieceCells(
			{
				type: "ell",
				c: 5,
				r: 7,
				rot: 3,
				owner: 0,
			},
		),
	).toStrictEqual([
		[6, 7],
		[5, 8],
		[6, 8],
	]);
});

// A plank owned by player 0.
const plank = (c: number, r: number, rot = 0): Piece => (
{
	type: "plank",
	c,
	r,
	rot,
	owner: 0,
});

it("places a piece only on open cells inside the course, away from the start and flag", () =>
{
	setLevel(LEVELS[0]!);
	const blocked = [plank(5, 10)];
	expect(
		{
			open: valid(plank(10, 10), blocked),
			overlapping: valid(plank(6, 10), blocked),
			offTheRightEdge: valid(plank(30, 5), []),
			inTheGround: valid(plank(0, 15), []),
			besideTheStart: valid(plank(1, 11, 1), []),
			besideTheFlag: valid(plank(28, 10), []),
			sawOnSaw: valid(
				{
					type: "saw",
					c: 6,
					r: 10,
					rot: 0,
					owner: 0,
				},
				[
					{
						type: "saw",
						c: 6,
						r: 10,
						rot: 0,
						owner: 1,
					},
				],
			),
			sawOnSpikes: valid(
				{
					type: "saw",
					c: 6,
					r: 10,
					rot: 0,
					owner: 0,
				},
				[
					{
						type: "spikes",
						c: 6,
						r: 10,
						rot: 0,
						owner: 1,
					},
				],
			),
		},
	).toStrictEqual(
		{
			open: true,
			overlapping: false,
			offTheRightEdge: false,
			inTheGround: false,
			besideTheStart: false,
			besideTheFlag: false,
			sawOnSaw: false,
			sawOnSpikes: true,
		},
	);
});

it("puts every level's start and flag on its ground, inside the course", () =>
{
	const problems = LEVELS.flatMap((l) =>
	{
		setLevel(l);
		return (
			[
				["start", l.start],
				["flag", l.flag],
			] as const
		)
			.filter(([, [c, r]]) => !(c >= 0 && c < 32 && r > 0 && r < 18 && course.base.has(c + "," + r)))
			.map(([what]) => `${l.name}: ${what}`);
	});
	expect(problems).toStrictEqual([]);
});

it("builds a Surprise me course that the route checker can finish on every level", () =>
{
	let seed = 1;
	vi.spyOn(Math, "random").mockImplementation(() => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646);
	expect(
		LEVELS.map((l) =>
		{
			setLevel(l);
			const pieces = genCourse();
			return {
				level: l.name,
				won: pieces !== null && explore(pieces).won,
			};
		}),
	).toStrictEqual(
		LEVELS.map((l) => (
		{
			level: l.name,
			won: true,
		})),
	);
});

it("falls under gravity onto a block and stands on it", () =>
{
	const block: Piece =
	{
		type: "block",
		c: 5,
		r: 12,
		rot: 0,
		owner: -1,
	};
	const run = startRun(
		[block],
		{
			x: 205,
			y: 300,
		},
	);
	const steps = stepUntil(run, () => run.p.onG);
	// Squashed a little by the landing, which it shakes off over the next steps.
	expect(
		{
			steps,
			runner: run.p,
			state: run.state,
		},
	).toStrictEqual(
		{
			steps: 43,
			runner:
			{
				x: 205,
				y: 450,
				w: 30,
				h: 30,
				vx: 0,
				vy: 0,
				onG: true,
				gr:
				{
					x: 200,
					y: 480,
					w: 40,
					h: 40,
					k: "block",
					t0: 0,
				},
				coy: -0.3583333333333336,
				buf: -0.3583333333333336,
				face: 1,
				sq: 0.9583333333333334,
				jumping: false,
				boost: 0,
			},
			state: "go",
		},
	);
});

it("jumps from the start ledge and lands back on it", () =>
{
	const run = startRun([]);
	stepRun(STEP);
	sim.keys.j = 1;
	run.p.buf = 0.12;
	let peak = run.p.y;
	const steps = stepUntil(run, () =>
	{
		peak = Math.min(peak, run.p.y);
		return run.p.onG;
	});
	// About three tiles up, and back down on the ledge two-thirds of a second later.
	expect(
		{
			steps,
			peak,
			y: run.p.y,
			onG: run.p.onG,
		},
	).toStrictEqual(
		{
			steps: 81,
			peak: 360.97222222222223,
			y: 490,
			onG: true,
		},
	);
});

it("launches off a spring, sky high", () =>
{
	const spring: Piece =
	{
		type: "spring",
		c: 5,
		r: 12,
		rot: 0,
		owner: -1,
	};
	const run = startRun(
		[spring],
		{
			x: 205,
			y: 400,
		},
	);
	stepUntil(run, () => run.p.vy < 0);
	expect(
		{
			vy: run.p.vy,
			anim: spring.parts?.spring?.anim,
		},
	).toStrictEqual(
		{
			vy: -950,
			anim: 1,
		},
	);
});

it("is knocked out by another player's spikes, but not by its own with no friendly fire", () =>
{
	const spikes: Piece =
	{
		type: "spikes",
		c: 5,
		r: 12,
		rot: 0,
		owner: 1,
	};
	const run = startRun(
		[spikes],
		{
			x: 205,
			y: 400,
		},
	);
	stepUntil(run, () => false);
	expect(run.res).toStrictEqual(
		{
			finished: false,
			owner: 1,
			cause: "spiked",
			x: 220,
			y: 479.84722222222223,
		},
	);

	const own = startRun(
		[
			{
				...spikes,
				owner: 0,
			},
		],
		{
			x: 205,
			y: 400,
		},
	);
	game.noFF = true;
	// Spikes are not solid, so it drops through its own and off the bottom of the course.
	stepUntil(own, () => false);
	expect(own.res).toStrictEqual(
		{
			finished: false,
			owner: -1,
			cause: "fell",
			x: 220,
			y: 696,
		},
	);
});

// A block nobody owns.
const blockAt = (c: number, r: number): Piece => (
{
	type: "block",
	c,
	r,
	rot: 0,
	owner: -1,
});

it("fires a cannon ball out through the block its muzzle is in, and stops it at the next solid", () =>
{
	const cannon: Piece =
	{
		type: "cannon",
		c: 5,
		r: 10,
		rot: 0,
		owner: 1,
	};
	startRun([cannon, blockAt(6, 10), blockAt(9, 10)]);
	const seen: number[] = [];
	for (let i = 0; i < 120; i++)
	{
		updateWorld(STEP, false);
		seen.push(sim.world.balls.length);
	}
	// It fires at half a second, clears the block at column 6, and bursts on the one at column 9.
	expect(
		{
			firstShot: seen.indexOf(1),
			lastFlying: seen.lastIndexOf(1),
			flyingNow: sim.world.balls.length,
		},
	).toStrictEqual(
		{
			firstShot: 59,
			lastFlying: 90,
			flyingNow: 0,
		},
	);
});
