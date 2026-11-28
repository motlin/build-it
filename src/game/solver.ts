import {valid} from "./course.ts";
import {COLS, DIRV, rand, ROWS} from "./geometry.ts";
import {DEFS, pieceCells, SOLIDT, TYPES} from "./pieces.ts";
import {course} from "./state.ts";
import type {Piece, Quad} from "./types.ts";

// A cautious grid model of the course, for Surprise me and the CPU players: one cell per player, short jumps only,
// and every non-solid piece (with its swing or line of fire) counts as deadly. explore() walks it from the start.

/** A cell the walk stood on, as [column, row, switch pressed]. */
export type Spot = [number, number, number];
export interface Exploration
{
	won: boolean;
	/** How close the walk got to the flag (or, before the switch is pressed, to the switch, plus 60). */
	minD: number;
	reached: Spot[];
}

const id = (c: number, r: number): number => r * COLS + c;
const inb = (c: number, r: number): boolean => c >= 0 && c < COLS && r >= 0 && r < ROWS;
/** Marks the cells of a block of the grid in a. */
function fillR(a: Uint8Array, [c, r, w, h]: Quad): void
{
	for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (inb(x, y)) a[id(x, y)] = 1;
}

export const solvable = (pcs: Piece[]): boolean => explore(pcs).won;

export function explore(pcs: Piece[]): Exploration
{
	const LV = course.level;
	const N = COLS * ROWS;
	const solid = new Uint8Array(N);
	const danger = new Uint8Array(N);
	const gate = new Uint8Array(N);
	for (const g of LV.ground) fillR(solid, g);
	for (const g of LV.lava ?? []) fillR(danger, g);
	if (LV.gate) fillR(gate, LV.gate);
	for (const p of pcs) if (SOLIDT.has(p.type)) for (const [c, r] of pieceCells(p)) if (inb(c, r)) solid[id(c, r)] = 1;
	for (const p of pcs)
	{
		if (SOLIDT.has(p.type)) continue;
		for (const [c, r] of pieceCells(p)) if (inb(c, r)) danger[id(c, r)] = 1;
		if (p.type === "firetrack")
			for (let y = 0; y < ROWS; y++)
				for (let x = 0; x < COLS; x++)
					if (pieceCells(p).some(([c, r]) => Math.hypot(x - c, y - r) <= 2.7)) danger[id(x, y)] = 1;
		if (p.type === "axe" || p.type === "firebar")
			for (let y = 0; y < ROWS; y++)
				for (let x = 0; x < COLS; x++) if (Math.hypot(x - p.c, y - p.r) <= 3.4) danger[id(x, y)] = 1;
		if (p.type === "popspikes") for (const [c, r] of pieceCells(p)) if (inb(c, r - 1)) danger[id(c, r - 1)] = 1;
		if (p.type === "fan")
		{
			const [dx, dy] = DIRV[[3, 0, 1, 2][p.rot]!]!;
			for (let k = 1; k <= 4; k++)
				if (inb(p.c + dx * k, p.r + dy * k)) danger[id(p.c + dx * k, p.r + dy * k)] = 1;
		}
		if (p.type === "cannon")
		{
			const [dx, dy] = DIRV[p.rot]!;
			let x = p.c + dx;
			let y = p.r + dy;
			while (inb(x, y) && !solid[id(x, y)])
			{
				danger[id(x, y)] = 1;
				x += dx;
				y += dy;
			}
		}
	}
	const [fc, fr] = LV.flag;
	const wc = (c: number): number => (LV.wrapX ? (c + COLS) % COLS : c);
	// The walk's result so far, which the helpers below update as they go.
	const walk =
	{
		won: false,
		minD: 1e9,
	};
	// Read through a function, since the helpers set it partway through a step of the walk.
	const won = (): boolean => walk.won;
	const reached: Spot[] = [];
	const md = (c: number, r: number, tc: number, tr: number): number =>
	{
		let dx = Math.abs(c - tc);
		let dy = Math.abs(r - tr);
		if (LV.wrapX) dx = Math.min(dx, COLS - dx);
		if (LV.wrapY) dy = Math.min(dy, ROWS - dy);
		return dx + dy;
	};
	const free = (c: number, r: number, sw: number): boolean =>
		inb(c, r) && !solid[id(c, r)] && !danger[id(c, r)] && !(gate[id(c, r)] && !sw);
	const sol = (c: number, r: number, sw: number): boolean =>
		inb(c, r) && (solid[id(c, r)] === 1 || (gate[id(c, r)] === 1 && !sw));
	const touch = (
		c: number,
		r: number,
		st:
		{
			sw: number;
		},
	): void =>
	{
		const dd = LV.sw && !st.sw ? 60 + md(c, r, LV.sw[0], LV.sw[1]) : md(c, r, fc, fr - 1);
		if (dd < walk.minD) walk.minD = dd;
		if (c >= fc - 1 && c <= fc && r >= fr - 3 && r <= fr - 1) walk.won = true;
		if (c === LV.sw?.[0] && r === LV.sw[1]) st.sw = 1;
	};
	const fall = (
		c: number,
		r: number,
		st:
		{
			sw: number;
		},
	): Spot | null =>
	{
		for (let k = 0; k < ROWS * 2 + 2; k++)
		{
			touch(c, r, st);
			if (won()) return null;
			let nr = r + 1;
			if (nr >= ROWS)
			{
				if (!LV.wrapY) return null;
				nr = 0;
			}
			if (sol(c, nr, st.sw)) return [c, r, st.sw];
			if (!free(c, nr, st.sw)) return null;
			r = nr;
		}
		return null;
	};
	const seen = new Set<string>();
	const q: Spot[] = [];
	const push = (x: Spot | null): void =>
	{
		if (!x) return;
		const k = x.join();
		if (!seen.has(k))
		{
			seen.add(k);
			q.push(x);
			reached.push(x);
		}
	};
	push(
		fall(
			LV.start[0],
			LV.start[1] - 1,
			{
				sw: LV.sw ? 0 : 1,
			},
		),
	);
	while (q.length && !won())
	{
		const [c, r, sw] = q.shift()!;
		for (const d of [-1, 1])
		{
			const nc = wc(c + d);
			const st =
			{
				sw,
			};
			if (free(nc, r, sw))
			{
				touch(nc, r, st);
				push(fall(nc, r, st));
			}
			for (const [h, mx] of [
				[1, 4],
				[2, 3],
			] as const)
			{
				const sj =
				{
					sw,
				};
				let ok = true;
				for (let j = 1; j <= h; j++)
				{
					if (!free(c, r - j, sj.sw))
					{
						ok = false;
						break;
					}
					touch(c, r - j, sj);
				}
				if (!ok) continue;
				let x = c;
				for (let i = 1; i <= mx; i++)
				{
					x = wc(x + d);
					for (let j = i === 1 ? 0 : h; j <= h; j++)
					{
						if (!free(x, r - j, sj.sw))
						{
							ok = false;
							break;
						}
						touch(x, r - j, sj);
					}
					if (!ok || won()) break;
					push(
						fall(
							x,
							r - h,
							{
								sw: sj.sw,
							},
						),
					);
				}
			}
		}
	}
	return {
		won: walk.won,
		minD: walk.won ? 0 : walk.minD,
		reached,
	};
}

/** A stretch of ground or placed blocks the route stands on: columns a to b on row r. */
interface Ledge
{
	a: number;
	b: number;
	r: number;
}

function rectAt(c: number, r: number): Ledge
{
	for (const [x, y, w] of course.level.ground)
		if (r === y && c >= x && c < x + w)
			return {
				a: x,
				b: x + w - 1,
				r: y,
			};
	return {
		a: c,
		b: c,
		r,
	};
}

function canHop(cur: Ledge, tg: Ledge): boolean
{
	const gap = tg.a > cur.b ? tg.a - cur.b - 1 : cur.a > tg.b ? cur.a - tg.b - 1 : -1;
	return gap >= 0 && gap <= (tg.r <= cur.r - 2 ? 2 : 3) && tg.r >= cur.r - 2;
}

/**
 * Surprise me: builds a stepping-stone route, proves it can be finished, then adds traps that keep it finishable.
 * Null when 120 tries all fail.
 */
export function genCourse(): Piece[] | null
{
	const LV = course.level;
	for (let att = 0; att < 120; att++)
	{
		const pcs: Piece[] = (LV.forced ?? []).map((f) => (
		{
			type: f.type,
			c: f.c,
			r: f.r,
			rot: 0,
			owner: -1,
		}));
		const targets: Ledge[] = [
			...(LV.aims ?? []).map(([a, b, r]) => (
			{
				a,
				b,
				r,
			})),
			...(LV.noFlagAim ? [] : [rectAt(LV.flag[0], LV.flag[1])]),
		];
		let cur = rectAt(LV.start[0], LV.start[1]);
		let ok = true;
		for (const tg of targets)
		{
			let guard = 0;
			while (!canHop(cur, tg) && guard++ < 25)
			{
				let placed = false;
				for (let k = 0; k < 40 && !placed; k++)
				{
					const type = (["block", "block", "big", "plank", "plank", "bridge"] as const)[rand(6)]!;
					const len =
					{
						plank: 3,
						bridge: 5,
						block: 1,
						big: 2,
					}[type];
					const dir = Math.sign((tg.a + tg.b) / 2 - (cur.a + cur.b) / 2) || 1;
					let nr = cur.r + (tg.r < cur.r ? -(1 + rand(2)) : tg.r > cur.r ? rand(3) : rand(3) - 1);
					if (tg.r < cur.r) nr = Math.max(nr, tg.r);
					else if (tg.r > cur.r) nr = Math.min(nr, tg.r);
					nr = Math.max(2, Math.min(nr, ROWS - (type === "big" ? 3 : 2)));
					const gap = nr < cur.r ? (Math.random() < 0.7 ? 2 : 1) : Math.random() < 0.65 ? 3 : 2;
					const c0 = dir > 0 ? cur.b + gap + 1 : cur.a - gap - len;
					const q: Piece =
					{
						type,
						c: c0,
						r: nr,
						rot: 0,
						owner: -1,
					};
					if (valid(q, pcs))
					{
						pcs.push(q);
						cur =
						{
							a: c0,
							b: c0 + len - 1,
							r: nr,
						};
						placed = true;
					}
				}
				if (!placed) break;
			}
			if (!canHop(cur, tg))
			{
				ok = false;
				break;
			}
			cur = tg;
		}
		if (!ok || !solvable(pcs)) continue;
		const pool = TYPES.filter((t) => t !== "bomb" && t !== "portal" && !SOLIDT.has(t));
		const hz = pool.filter((t) => DEFS[t].kind === "hazard");
		const route = pcs.filter((q) => SOLIDT.has(q.type));
		let added = 0;
		const want = 9 + rand(5);
		for (let k = 0; k < 500 && added < want; k++)
		{
			const type = Math.random() < 0.65 ? hz[rand(hz.length)]! : pool[rand(pool.length)]!;
			const near = route.length && Math.random() < 0.75 ? route[rand(route.length)]! : null;
			const q: Piece =
			{
				type,
				c: near ? near.c + rand(7) - 3 : rand(COLS),
				r: near ? near.r + (Math.random() < 0.7 ? -2 - rand(4) : 1 + rand(3)) : rand(ROWS - 1),
				rot: rand(DEFS[type].rots),
				owner: -1,
			};
			if (!valid(q, pcs)) continue;
			pcs.push(q);
			if (solvable(pcs)) added++;
			else pcs.pop();
		}
		return pcs;
	}
	return null;
}
