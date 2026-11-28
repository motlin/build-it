import {burst} from "./effects.ts";
import {DIRV, GRAV, H, T, W} from "./geometry.ts";
import {pieceCells} from "./pieces.ts";
import {sfx} from "./sound.ts";
import {course, emptyWorld, game, sim} from "./state.ts";
import type {Crumble, Gate, Mover, Rect, Solid} from "./types.ts";

// Builds the world from the level and the placed pieces, and moves everything in it over time. Every moving piece
// keys off the shared clock less the time it was placed, so a piece keeps its rhythm when the world is rebuilt.

export const isCrumble = (s: Solid): s is Crumble => s.k === "crumble";

export function buildWorld(): void
{
	const w = emptyWorld();
	const LV = course.level;
	for (const [c, r, cw, ch] of LV.ground)
		w.solids.push(
			{
				x: c * T,
				y: r * T,
				w: cw * T,
				h: ch * T,
				k: LV.ice ? "ice" : "ground",
				t0: 0,
			},
		);
	if (LV.gate)
	{
		const [c, r, cw, ch] = LV.gate;
		const gate: Gate =
		{
			x: c * T,
			y: r * T,
			w: cw * T,
			h: ch * T,
			k: "ground",
			t0: 0,
			open: 0,
		};
		w.gate = gate;
		w.solids.push(gate);
	}
	w.swOn = false;
	for (const [c, r, cw, ch] of LV.lava ?? [])
		w.hazards.push(
			{
				t: "rect",
				x: c * T,
				y: r * T + 14,
				w: cw * T,
				h: ch * T,
				owner: -1,
				cause: "burned",
			},
		);
	for (const p of game.pieces)
	{
		const X = p.c * T;
		const Y = p.r * T;
		const t0 = p.t0 ?? 0;
		const parts: NonNullable<typeof p.parts> = {};
		p.parts = parts;
		switch (p.type)
		{
			case "block":
			case "plank":
			case "tee":
			case "zig":
			case "stairs":
			case "pillar":
			case "arch":
			case "big":
			case "ell":
			case "bridge":
				for (const [c, r] of pieceCells(p))
					w.solids.push(
						{
							x: c * T,
							y: r * T,
							w: T,
							h: T,
							k: "block",
							t0,
						},
					);
				break;
			case "beam":
				w.solids.push(
					p.rot
						?
							{
								x: X + T - 22,
								y: Y,
								w: 22,
								h: 3 * T,
								k: "block",
								t0,
							}
						:
							{
								x: X,
								y: Y,
								w: 3 * T,
								h: 22,
								k: "block",
								t0,
							},
				);
				break;
			case "ice":
				w.solids.push(
					{
						x: X,
						y: Y,
						w: (p.rot ? 1 : 3) * T,
						h: (p.rot ? 3 : 1) * T,
						k: "ice",
						t0,
					},
				);
				break;
			case "belt":
				w.solids.push(
					p.rot > 1
						?
							{
								x: X + 4,
								y: Y,
								w: T - 8,
								h: 3 * T,
								k: "belt",
								dir: 0,
								vdir: p.rot === 2 ? -1 : 1,
								t0,
							}
						:
							{
								x: X,
								y: Y + 4,
								w: 3 * T,
								h: T - 4,
								k: "belt",
								dir: p.rot ? -1 : 1,
								t0,
							},
				);
				break;
			case "spring":
			{
				const o: Solid =
				{
					x: X,
					y: Y + 8,
					w: T,
					h: T - 8,
					k: "spring",
					anim: 0,
					t0,
				};
				parts.spring = o;
				w.solids.push(o);
				break;
			}
			case "crumble":
			{
				const o: Crumble =
				{
					x: X,
					y: Y,
					w: 2 * T,
					h: T,
					k: "crumble",
					st: 0,
					t: 0,
					oy: 0,
					vy: 0,
					t0,
				};
				parts.crumble = o;
				w.solids.push(o);
				w.crumbles.push(o);
				break;
			}
			case "mover":
			{
				const o: Mover =
				{
					x: X,
					y: Y,
					w: 2 * T,
					h: T / 2,
					k: "mover",
					owner: p.owner,
					x0: X,
					y0: Y,
					ax: p.rot,
					range: p.rot ? 3.5 * T : 3 * T,
					dx: 0,
					dy: 0,
					t0,
				};
				parts.mover = o;
				w.solids.push(o);
				w.movers.push(o);
				break;
			}
			case "spikes":
			{
				const wd = (p.rot % 2 ? 1 : 2) * T;
				const ht = (p.rot % 2 ? 2 : 1) * T;
				const R: Rect = [
					{
						x: X + 5,
						y: Y + 12,
						w: wd - 10,
						h: ht - 12,
					},
					{
						x: X,
						y: Y + 5,
						w: wd - 12,
						h: ht - 10,
					},
					{
						x: X + 5,
						y: Y,
						w: wd - 10,
						h: ht - 12,
					},
					{
						x: X + 12,
						y: Y + 5,
						w: wd - 12,
						h: ht - 10,
					},
				][p.rot]!;
				w.hazards.push(
					{
						t: "rect",
						...R,
						owner: p.owner,
						cause: "spiked",
					},
				);
				break;
			}
			case "saw":
				w.hazards.push(
					{
						t: "circ",
						x: X + T / 2,
						y: Y + T / 2,
						r: 16,
						owner: p.owner,
						cause: "sawed",
					},
				);
				break;
			case "firebar":
			{
				const o =
				{
					cx: X + T / 2,
					cy: Y + T / 2,
					a: 0,
					dir: p.rot ? -1 : 1,
					owner: p.owner,
					t0,
				};
				parts.firebar = o;
				w.firebars.push(o);
				break;
			}
			case "firetrack":
			{
				const o =
				{
					x0: X + T / 2,
					y0: Y + T / 2,
					ax: p.rot,
					x: X + T / 2,
					y: Y + T / 2,
					a: 0,
					owner: p.owner,
					t0,
				};
				parts.track = o;
				w.firetracks.push(o);
				break;
			}
			case "sawtrack":
			{
				const o =
				{
					x0: X + T / 2,
					y0: Y + T / 2,
					ax: p.rot,
					x: X + T / 2,
					y: Y + T / 2,
					a: 0,
					owner: p.owner,
					t0,
				};
				parts.track = o;
				w.sawtracks.push(o);
				break;
			}
			case "laser":
			{
				const o =
				{
					on: true,
					owner: p.owner,
					r: p.rot
						?
							{
								x: X + 8,
								y: Y + T / 2 - 5,
								w: 3 * T - 16,
								h: 10,
							}
						:
							{
								x: X + T / 2 - 5,
								y: Y + 8,
								w: 10,
								h: 3 * T - 16,
							},
					t0,
				};
				parts.laser = o;
				w.lasers.push(o);
				break;
			}
			case "fan":
			{
				const fd = [3, 0, 1, 2][p.rot]!;
				const Z: Rect = [
					{
						x: X + T,
						y: Y + 4,
						w: 4 * T,
						h: T - 8,
					},
					{
						x: X + 4,
						y: Y + T,
						w: T - 8,
						h: 4 * T,
					},
					{
						x: X - 4 * T,
						y: Y + 4,
						w: 4 * T,
						h: T - 8,
					},
					{
						x: X + 4,
						y: Y - 4 * T,
						w: T - 8,
						h: 4 * T,
					},
				][fd]!;
				w.solids.push(
					{
						x: X,
						y: Y,
						w: T,
						h: T,
						k: "block",
						t0,
					},
				);
				const o =
				{
					dir: fd,
					zone: Z,
					t0,
				};
				parts.fan = o;
				w.fans.push(o);
				break;
			}
			case "booster":
				w.solids.push(
					{
						x: X,
						y: Y + T / 2,
						w: T,
						h: T / 2,
						k: "boost",
						dir: p.rot ? -1 : 1,
						t0,
					},
				);
				break;
			case "cloud":
				// Stood up, it is a ladder of three one-tile clouds.
				for (let k = 0; k < (p.rot ? 3 : 1); k++)
					w.solids.push(
						{
							x: X,
							y: Y + k * T,
							w: (p.rot ? 1 : 3) * T,
							h: T * 0.6,
							k: "cloud",
							oneway: true,
							t0,
						},
					);
				break;
			case "vine":
				w.vines.push(
					{
						x: X + 6,
						y: Y,
						w: T - 12,
						h: 4 * T,
					},
				);
				break;
			case "jelly":
			{
				const o: Solid =
				{
					x: X,
					y: Y + 4,
					w: 2 * T,
					h: T - 4,
					k: "jelly",
					anim: 0,
					t0,
				};
				parts.jelly = o;
				w.solids.push(o);
				break;
			}
			case "popspikes":
			{
				const o =
				{
					up: 0,
					owner: p.owner,
					r:
					{
						x: X + 5,
						y: Y + 14,
						w: 2 * T - 10,
						h: T - 14,
					},
					t0,
				};
				parts.pop = o;
				w.pops.push(o);
				break;
			}
			case "axe":
			{
				const o =
				{
					px: X + T / 2,
					py: Y + T / 2,
					a: 0,
					owner: p.owner,
					t0,
				};
				parts.axe = o;
				w.axes.push(o);
				break;
			}
			case "crusher":
			{
				const o =
				{
					x: X,
					y0: Y,
					y: Y,
					owner: p.owner,
					t0,
				};
				parts.crusher = o;
				w.crushers.push(o);
				break;
			}
			case "blink":
			{
				const o: Solid =
				{
					x: X,
					y: Y,
					w: (p.rot ? 1 : 4) * T,
					h: (p.rot ? 4 : 1) * T,
					k: "blink",
					t0,
				};
				parts.blink = o;
				w.solids.push(o);
				break;
			}
			case "cannon":
			{
				const s: Solid =
				{
					x: X + 2,
					y: Y + 2,
					w: T - 4,
					h: T - 4,
					k: "cannon",
					t0,
				};
				w.solids.push(s);
				const o =
				{
					x: X + T / 2,
					y: Y + T / 2,
					dir: p.rot,
					t0,
					n: 0,
					flash: 0,
					owner: p.owner,
					solid: s,
				};
				parts.cannon = o;
				w.cannons.push(o);
				break;
			}
			case "bomb":
				break;
		}
	}
	sim.world = w;
	for (const c of w.cannons) c.n = Math.floor((sim.clock - c.t0 - 0.5) / 1.2);
	updateWorld(0, false);
	for (const m of w.movers)
	{
		m.dx = 0;
		m.dy = 0;
	}
}

/** How long a piece has been placed, by the shared clock. */
const A = (o: {t0: number}): number => sim.clock - o.t0;

/** Moves the world on by dt seconds. Cannons fire on their beat, and only make a sound while a run is live. */
export function updateWorld(dt: number, live: boolean): void
{
	const w = sim.world;
	sim.clock += dt;
	w.time += dt;
	const om = (2 * Math.PI) / 3.4;
	for (const m of w.movers)
	{
		const k = 0.5 - 0.5 * Math.cos(A(m) * om);
		const nx = m.ax ? m.x0 : m.x0 + m.range * k;
		const ny = m.ax ? m.y0 + m.range * k : m.y0;
		m.dx = nx - m.x;
		m.dy = ny - m.y;
		m.x = nx;
		m.y = ny;
	}
	for (const c of w.crumbles)
	{
		if (c.st === 1)
		{
			c.t -= dt;
			if (c.t <= 0)
			{
				c.st = 2;
				c.off = true;
			}
		}
		else if (c.st === 2)
		{
			c.vy += GRAV * dt * 0.6;
			c.oy += c.vy * dt;
		}
	}
	if (w.gate?.off) w.gate.open = Math.min(1, w.gate.open + dt * 2);
	for (const f of w.firebars) f.a = f.dir * 2.4 * A(f);
	for (const q of w.firetracks)
	{
		const k = 0.5 - 0.5 * Math.cos((A(q) * 2 * Math.PI) / 3.4);
		if (q.ax) q.y = q.y0 + 3 * T * k;
		else q.x = q.x0 + 3 * T * k;
		q.a = A(q) * 2.6;
	}
	for (const q of w.sawtracks)
	{
		const k = 0.5 - 0.5 * Math.cos((A(q) * 2 * Math.PI) / 2.6);
		if (q.ax) q.y = q.y0 + 3 * T * k;
		else q.x = q.x0 + 3 * T * k;
	}
	for (const l of w.lasers) l.on = A(l) % 2.4 < 1.3;
	for (const q of w.pops)
	{
		const ph = A(q) % 2.6;
		q.up = ph < 0.15 ? ph / 0.15 : ph < 1.1 ? 1 : ph < 1.3 ? 1 - (ph - 1.1) / 0.2 : ph > 2.2 ? 0.15 : 0;
	}
	for (const q of w.axes) q.a = Math.sin(A(q) * 2.4) * 1.15;
	for (const q of w.crushers)
	{
		const ph = A(q) % 2.8;
		q.y =
			q.y0 +
			3 * T * (ph < 1.2 ? 0 : ph < 1.45 ? (ph - 1.2) / 0.25 : ph < 2 ? 1 : ph < 2.8 ? 1 - (ph - 2) / 0.8 : 0);
	}
	for (const s of w.solids)
		if (s.k === "blink")
		{
			const ph = A(s) % 4;
			s.off = ph >= 2.6;
			s.warn = ph > 2.1 && ph < 2.6;
		}
	for (const s of w.solids) if (s.anim) s.anim = Math.max(0, s.anim - dt * 4);
	for (const c of w.cannons)
	{
		c.flash = Math.max(0, c.flash - dt * 5);
		const n = Math.floor((A(c) - 0.5) / 1.2);
		if (n > c.n)
		{
			c.n = n;
			c.flash = 1;
			const [dx, dy] = DIRV[c.dir]!;
			const bx = c.x + dx * 24;
			const by = c.y + dy * 24;
			w.balls.push(
				{
					x: bx,
					y: by,
					vx: dx * 430,
					vy: dy * 430,
					owner: c.owner,
					src: c.solid,
					ign: w.solids.filter(
						(s) => s !== c.solid && bx >= s.x && bx <= s.x + s.w && by >= s.y && by <= s.y + s.h,
					),
				},
			);
			if (live) sfx("shot");
		}
	}
	w.balls = w.balls.filter((b) =>
	{
		b.x += b.vx * dt;
		b.y += b.vy * dt;
		if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) return false;
		for (const s of w.solids)
		{
			if (s === b.src || s.off || s.oneway || b.ign.includes(s)) continue;
			if (b.x > s.x && b.x < s.x + s.w && b.y > s.y && b.y < s.y + s.h)
			{
				burst(b.x, b.y, "#4a4e69", 6);
				return false;
			}
		}
		return true;
	});
}
