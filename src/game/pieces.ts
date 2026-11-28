import {rand} from "./geometry.ts";
import type {Cell, Kind, Piece, PieceDef, PieceType} from "./types.ts";

// The pieces players place on the course: their names, tips, kinds and the cells each rotation covers.

const row = (n: number): Cell[] =>
	Array.from(
		{
			length: n,
		},
		(_, i): Cell => [i, 0],
	);
const col = (n: number): Cell[] =>
	Array.from(
		{
			length: n,
		},
		(_, i): Cell => [0, i],
	);
function sqr(n: number): Cell[]
{
	const a: Cell[] = [];
	for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) a.push([x, y]);
	return a;
}
const ELL: Cell[][] = [
	[
		[0, 0],
		[0, 1],
		[1, 1],
	],
	[
		[0, 0],
		[1, 0],
		[0, 1],
	],
	[
		[0, 0],
		[1, 0],
		[1, 1],
	],
	[
		[1, 0],
		[0, 1],
		[1, 1],
	],
];

export const isBomb = (t: PieceType): boolean => t === "bomb";

export const DEFS: Record<PieceType, PieceDef> =
{
	block:
	{
		name: "Block",
		tip: "One solid block",
		kind: "build",
		rots: 1,
		cells: () => [[0, 0]],
	},
	plank:
	{
		name: "Plank",
		tip: "Three blocks in a line",
		kind: "build",
		rots: 2,
		cells: (r) => (r ? col(3) : row(3)),
	},
	big:
	{
		name: "Big block",
		tip: "A chunky 2×2 wall",
		kind: "build",
		rots: 1,
		cells: () => [
			[0, 0],
			[1, 0],
			[0, 1],
			[1, 1],
		],
	},
	ell:
	{
		name: "L block",
		tip: "A corner piece",
		kind: "build",
		rots: 4,
		cells: (r) => ELL[r]!,
	},
	spring:
	{
		name: "Spring",
		tip: "Launches you sky high",
		kind: "help",
		rots: 1,
		cells: () => [[0, 0]],
	},
	mover:
	{
		name: "Lift",
		tip: "Platform that slides back and forth",
		kind: "help",
		rots: 2,
		cells: (r) =>
			r
				? [
						[0, 0],
						[1, 0],
						[0, 1],
						[1, 1],
						[0, 2],
						[1, 2],
						[0, 3],
						[1, 3],
					]
				: row(5),
	},
	ice:
	{
		name: "Ice",
		tip: "Slippery, hard to stop on",
		kind: "trick",
		rots: 2,
		cells: (r) => (r ? col(3) : row(3)),
	},
	belt:
	{
		name: "Conveyor",
		tip: "Carries you along. Stand it up to make a wall that carries you up or down",
		kind: "trick",
		rots: 4,
		cells: (r) => (r > 1 ? col(3) : row(3)),
	},
	crumble:
	{
		name: "Crumble",
		tip: "Falls soon after you land",
		kind: "trick",
		rots: 1,
		cells: () => row(2),
	},
	spikes:
	{
		name: "Spikes",
		tip: "Touch them and you are out",
		kind: "hazard",
		rots: 4,
		cells: (r) => (r % 2 ? col(2) : row(2)),
	},
	saw:
	{
		name: "Saw",
		tip: "A spinning blade",
		kind: "hazard",
		rots: 1,
		cells: () => [[0, 0]],
	},
	cannon:
	{
		name: "Cannon",
		tip: "Fires a fast ball every 1.2 seconds",
		kind: "hazard",
		rots: 4,
		cells: () => [[0, 0]],
	},
	firebar:
	{
		name: "Fire bar",
		tip: "A spinning bar of fireballs",
		kind: "hazard",
		rots: 2,
		cells: () => [[0, 0]],
	},
	firetrack:
	{
		name: "Fire track",
		tip: "Rare! A spinning fire bar that rides a track",
		kind: "hazard",
		rare: true,
		rots: 2,
		cells: (r) => (r ? col(4) : row(4)),
	},
	sawtrack:
	{
		name: "Saw track",
		tip: "A saw that slides back and forth",
		kind: "hazard",
		rots: 2,
		cells: (r) => (r ? col(4) : row(4)),
	},
	laser:
	{
		name: "Laser",
		tip: "A beam that blinks on and off",
		kind: "hazard",
		rots: 2,
		cells: (r) => (r ? row(3) : col(3)),
	},
	bridge:
	{
		name: "Bridge",
		tip: "A long 5-block wooden plank",
		kind: "build",
		rots: 2,
		cells: (r) => (r ? col(5) : row(5)),
	},
	cloud:
	{
		name: "Cloud",
		tip: "Jump up through it, land on top. Stand it up for a cloud ladder",
		kind: "help",
		rots: 2,
		cells: (r) => (r ? col(3) : row(3)),
	},
	vine:
	{
		name: "Vine",
		tip: "Hold jump to climb it",
		kind: "help",
		rots: 1,
		cells: () => col(4),
	},
	jelly:
	{
		name: "Jelly",
		tip: "Bouncy: you keep bouncing on it",
		kind: "trick",
		rots: 1,
		cells: () => row(2),
	},
	popspikes:
	{
		name: "Pop-up spikes",
		tip: "Spikes that shoot up every few seconds",
		kind: "hazard",
		rots: 1,
		cells: () => row(2),
	},
	axe:
	{
		name: "Swing axe",
		tip: "A blade that swings like a pendulum",
		kind: "hazard",
		rots: 1,
		cells: () => [[0, 0]],
	},
	crusher:
	{
		name: "Crusher",
		tip: "A spiked block that slams down 3 tiles",
		kind: "hazard",
		rots: 1,
		cells: () => col(4),
	},
	fan:
	{
		name: "Fan",
		tip: "Blows you along for 4 tiles",
		kind: "help",
		rots: 4,
		cells: () => [[0, 0]],
	},
	booster:
	{
		name: "Booster",
		tip: "Flings you sideways",
		kind: "help",
		rots: 2,
		cells: () => [[0, 0]],
	},
	blink:
	{
		name: "Blink blocks",
		tip: "A row of 4 that vanishes and comes back",
		kind: "trick",
		rots: 2,
		cells: (r) => (r ? col(4) : row(4)),
	},
	bomb:
	{
		name: "Bomb",
		tip: "Blows up everything in a 3×3 area",
		kind: "clear",
		rots: 1,
		cells: () => sqr(3),
	},
};
export const KIND: Record<Kind, string> =
{
	build: "Build",
	help: "Helper",
	trick: "Tricky",
	hazard: "Hazard",
	clear: "Clear",
};
/** Every piece, in the order the practice palette shows them. */
export const TYPES: PieceType[] = [
	"block",
	"plank",
	"big",
	"ell",
	"spring",
	"mover",
	"ice",
	"belt",
	"crumble",
	"spikes",
	"saw",
	"cannon",
	"firebar",
	"firetrack",
	"sawtrack",
	"laser",
	"bridge",
	"cloud",
	"vine",
	"jelly",
	"popspikes",
	"axe",
	"crusher",
	"fan",
	"booster",
	"blink",
	"bomb",
];
const POOL = TYPES.filter((t) => t !== "bomb");
/** A random piece for the box. Rare pieces get a second roll that usually replaces them. */
export function rollPiece(): PieceType
{
	let t = POOL[rand(POOL.length)]!;
	if (DEFS[t].rare && Math.random() < 0.7) t = POOL[rand(POOL.length)]!;
	return t;
}
export const pieceCells = (p: Piece): Cell[] => DEFS[p.type].cells(p.rot).map(([x, y]): Cell => [p.c + x, p.r + y]);
/** Pieces that can share a cell with each other, though not with a copy of themselves in the same spot. */
export const STACK = new Set<PieceType>([
	"spikes",
	"saw",
	"sawtrack",
	"laser",
	"firebar",
	"firetrack",
	"axe",
	"popspikes",
	"crusher",
	"vine",
	"mover",
]);
/** The plain solid pieces, which the route checker stands on. */
export const SOLIDT = new Set<PieceType>(["block", "plank", "big", "ell", "bridge"]);
