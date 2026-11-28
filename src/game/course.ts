import {COLS, ROWS, T} from "./geometry.ts";
import {canShare, isBomb, pieceCells} from "./pieces.ts";
import {course} from "./state.ts";
import type {Level, Piece, Rect} from "./types.ts";

// The level in play and where pieces may go on it.

export function setLevel(l: Level): void
{
	course.level = l;
	const base = new Set<string>();
	const safe = new Set<string>();
	course.base = base;
	course.safe = safe;
	for (const [c, r, w, h] of [...l.ground, ...(l.lava ?? [])])
		for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) base.add(x + "," + y);
	const add = (c0: number, c1: number, r0: number, r1: number): void =>
	{
		for (let y = Math.max(0, r0); y <= Math.min(ROWS - 1, r1); y++)
			for (let x = Math.max(0, c0); x <= Math.min(COLS - 1, c1); x++)
				if (!base.has(x + "," + y)) safe.add(x + "," + y);
	};
	if (l.gate)
	{
		const [c, r, w, h] = l.gate;
		for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) base.add(x + "," + y);
	}
	if (l.sw)
	{
		base.add(l.sw[0] + "," + l.sw[1]);
		add(l.sw[0] - 1, l.sw[0] + 1, l.sw[1] - 2, l.sw[1]);
	}
	add(l.start[0] - 1, l.start[0] + 1, l.start[1] - 4, l.start[1] - 1);
	add(l.flag[0] - 2, l.flag[0] + 1, l.flag[1] - 5, l.flag[1] - 1);
}

/** The area around the flag that counts as reaching it. */
export const goalRect = (): Rect => (
{
	x: (course.level.flag[0] - 1) * T,
	y: (course.level.flag[1] - 3.5) * T,
	w: 2 * T,
	h: 3.5 * T,
});

/** The pieces covering each cell, by "column,row". */
function occupied(list: Piece[]): Map<string, Piece[]>
{
	const o = new Map<string, Piece[]>();
	for (const p of list)
		for (const [c, r] of pieceCells(p))
		{
			const k = c + "," + r;
			if (!o.has(k)) o.set(k, []);
			o.get(k)!.push(p);
		}
	return o;
}

/** Whether a piece fits among the others: on the course, off the ground and the clear cells, and not overlapping. */
export function valid(p: Piece, list: Piece[]): boolean
{
	const cs = pieceCells(p);
	for (const [c, r] of cs) if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
	if (isBomb(p.type)) return true;
	const o = occupied(list);
	for (const [c, r] of cs)
	{
		const k = c + "," + r;
		if (course.base.has(k) || course.safe.has(k)) return false;
		if (o.get(k)?.some((q) => !canShare(p.type, q.type))) return false;
	}
	return true;
}

setLevel(course.level);
