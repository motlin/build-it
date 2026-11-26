import type {Rect} from "./types.ts";

// The course grid and the small math the game shares. The course is COLS by ROWS cells of T pixels, W by H in all.
export const T = 40;
export const COLS = 32;
export const ROWS = 18;
export const W = COLS * T;
export const H = ROWS * T;
export const GRAV = 2300;
/** The physics step, in seconds. */
export const STEP = 1 / 120;
/** Unit steps right, down, left and up, the directions cannons and fans face. */
export const DIRV: [number, number][] = [
	[1, 0],
	[0, 1],
	[-1, 0],
	[0, -1],
];

export const rand = (n: number): number => Math.floor(Math.random() * n);
export const hit = (a: Rect, b: Rect): boolean =>
	a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export function circHit(a: Rect, cx: number, cy: number, r: number): boolean
{
	const nx = Math.max(a.x, Math.min(cx, a.x + a.w));
	const ny = Math.max(a.y, Math.min(cy, a.y + a.h));
	return (nx - cx) ** 2 + (ny - cy) ** 2 < r * r;
}
export const approach = (v: number, t: number, d: number): number => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
