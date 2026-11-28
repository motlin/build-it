import {afterEach, expect, it, vi} from "vite-plus/test";
import {placeAmong, setLevel, valid} from "../../src/game/course.ts";
import {STEP} from "../../src/game/geometry.ts";
import {LEVELS} from "../../src/game/levels.ts";
import {newRunner, stepRun} from "../../src/game/physics.ts";
import {DEFS, pieceCells, TYPES} from "../../src/game/pieces.ts";
import {explore, genCourse} from "../../src/game/solver.ts";
import {course, game, sim} from "../../src/game/state.ts";
import type {Piece, PieceType, Run, Runner} from "../../src/game/types.ts";
import {buildWorld, updateWorld} from "../../src/game/world.ts";

afterEach(() => vi.restoreAllMocks());

// Puts a run on the first level, The Gap, with the given pieces, from the start or changed by `at`, and returns it.
function startRun(pieces: Piece[], at?: Partial<Runner>): Run
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
		d: 0,
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
			tee: ["###/.#.", ".#/##/.#", ".#./###", "#./##/#."],
			zig: ["##./.##", ".#/##/#."],
			stairs: ["..#/.##/###", "#../##./###"],
			pillar: ["#/#/#/#", "####"],
			arch: ["###/#.#", "#.#/###"],
			beam: ["###", "#/#/#"],
			spikeblock: ["#"],
			fake: ["#"],
			big: ["##/##"],
			ell: ["#./##", "##/#.", "##/.#", ".#/##"],
			spring: ["#"],
			mover: ["#####", "##/##/##/##"],
			ice: ["###", "#/#/#"],
			belt: ["###", "###", "#/#/#", "#/#/#"],
			crumble: ["##"],
			spikes: ["##", "#/#", "##", "#/#"],
			saw: ["#"],
			cannon: ["#", "#", "#", "#"],
			firebar: ["#", "#"],
			portal: ["#/#"],
			firetrack: ["####", "#/#/#/#"],
			sawtrack: ["####", "#/#/#/#"],
			laser: ["#/#/#", "###"],
			bridge: ["#####", "#/#/#/#/#"],
			cloud: ["###", "#/#/#"],
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
	// A placed portal covers its entrance and its exit.
	expect(
		pieceCells(
			{
				type: "portal",
				c: 5,
				r: 7,
				rot: 0,
				owner: 0,
				b:
				{
					c: 20,
					r: 3,
				},
			},
		),
	).toStrictEqual([
		[5, 7],
		[5, 8],
		[20, 3],
		[20, 4],
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

// A piece of the given type at column 6, row 10, owned by player 0.
const at610 = (type: PieceType, rot = 0): Piece => (
{
	type,
	c: 6,
	r: 10,
	rot,
	owner: 0,
});

it("places a piece only on open cells inside the course, away from the start and flag", () =>
{
	setLevel(LEVELS[0]!);
	game.pieces = [];
	game.portalA =
	{
		c: 6,
		r: 11,
	};
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

			spikesOverPlank: valid(at610("spikes"), [plank(6, 10)]),
			plankUnderSpikes: valid(plank(6, 10), [at610("spikes")]),
			spikeBlockOnPlank: valid(at610("spikeblock"), [plank(6, 10)]),
			cannonOnSaw: valid(at610("cannon"), [at610("saw")]),
			cannonOnSpikeBlock: valid(at610("cannon"), [at610("spikeblock")]),
			plankOnPlank: valid(plank(6, 10), [plank(6, 10)]),
			portalExitOnItsEntrance: valid(at610("portal"), placeAmong("portal")),
			plankOnAPendingEntrance: valid(plank(6, 11), placeAmong("plank")),
		},
	).toStrictEqual(
		{
			open: true,
			overlapping: false,
			offTheRightEdge: false,
			inTheGround: false,
			besideTheStart: false,
			besideTheFlag: false,
			sawOnSaw: true,
			sawOnSpikes: true,
			spikesOverPlank: true,
			plankUnderSpikes: true,
			spikeBlockOnPlank: true,
			cannonOnSaw: true,
			cannonOnSpikeBlock: false,
			plankOnPlank: false,
			portalExitOnItsEntrance: false,
			plankOnAPendingEntrance: true,
		},
	);
	game.portalA = null;
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
				crouch: false,
				dropT: 0,
				plock: null,
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

// Where a runner pressed against the right side of a conveyor at column 5 is, and how fast, after some steps.
function beside(
	rot: number,
	vy: number,
	steps: number,
):
{
	y: number;
	vy: number;
}
{
	const run = startRun(
		[
			{
				type: "belt",
				c: 5,
				r: 8,
				rot,
				owner: -1,
			},
		],
		{
			x: 236,
			y: 380,
			vy,
		},
	);
	sim.keys.l = 1;
	for (let i = 0; i < steps; i++) stepRun(STEP);
	return {
		y: run.p.y,
		vy: run.p.vy,
	};
}

it("rides a conveyor stood on end up its side, and is pulled down beside one turned the other way", () =>
{
	expect(
		{
			up: beside(2, 0, 20),
			down: beside(3, -780, 1),
		},
	).toStrictEqual(
		{
			up:
			{
				y: 344.86111111111086,
				vy: -210.83333333333334,
			},
			down:
			{
				y: 382.15972222222223,
				vy: 259.1666666666667,
			},
		},
	);
});

// Where a runner walking right from the start ledge toward a low beam ends up, crouched or not, and whether it then
// stands back up with the crouch let go.
function underBeam(crouch: number): Pick<Runner, "x" | "y" | "h" | "crouch">
{
	const run = startRun(
		[
			{
				type: "beam",
				c: 3,
				r: 12,
				rot: 0,
				owner: -1,
			},
		],
		{
			x: 85,
			y: 490,
		},
	);
	sim.keys.r = 1;
	sim.keys.d = crouch;
	for (let i = 0; i < 60; i++) stepRun(STEP);
	sim.keys.r = 0;
	sim.keys.d = 0;
	stepRun(STEP);
	return {
		x: run.p.x,
		y: run.p.y,
		h: run.p.h,
		crouch: run.p.crouch,
	};
}

it("crouches under a low beam it cannot walk through, and stays crouched until there is room to stand", () =>
{
	expect(
		{
			standing: underBeam(0),
			crouching: underBeam(1),
		},
	).toStrictEqual(
		{
			standing:
			{
				x: 90,
				y: 490,
				h: 30,
				crouch: false,
			},
			crouching:
			{
				x: 152.6111111111111,
				y: 504,
				h: 16,
				crouch: true,
			},
		},
	);
});

// How a run dropped from above a piece at column 5, row 12, owned by player 1, ends.
function fall(type: PieceType): Run["res"]
{
	const run = startRun(
		[
			{
				type,
				c: 5,
				r: 12,
				rot: 0,
				owner: 1,
			},
		],
		{
			x: 205,
			y: 400,
		},
	);
	stepUntil(run, () => false);
	return run.res;
}

it("drops straight through a fake block, and is spiked landing on a spike block", () =>
{
	expect(
		{
			fake: fall("fake"),
			spikeblock: fall("spikeblock"),
		},
	).toStrictEqual(
		{
			fake:
			{
				finished: false,
				owner: -1,
				cause: "fell",
				x: 220,
				y: 696,
			},
			spikeblock:
			{
				finished: false,
				owner: 1,
				cause: "spiked",
				x: 220,
				y: 471.0625,
			},
		},
	);
});

it("steps into a portal's entrance and pops out of its exit", () =>
{
	const portal: Piece =
	{
		type: "portal",
		c: 3,
		r: 11,
		rot: 0,
		owner: 0,
		b:
		{
			c: 20,
			r: 5,
		},
	};
	const run = startRun(
		[portal],
		{
			x: 85,
			y: 490,
		},
	);
	sim.keys.r = 1;
	stepUntil(run, () => run.p.plock !== null);
	expect(
		{
			x: run.p.x,
			y: run.p.y,
			plock: run.p.plock,
		},
	).toStrictEqual(
		{
			x: 805,
			y: 249,
			plock: sim.world.portals[0],
		},
	);
});
