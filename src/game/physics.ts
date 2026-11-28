import {goalRect} from "./course.ts";
import {burst} from "./effects.ts";
import {approach, circHit, GRAV, H, hit, T, W} from "./geometry.ts";
import {sfx} from "./sound.ts";
import {course, game, sim} from "./state.ts";
import type {Runner, Solid} from "./types.ts";
import {isCrumble} from "./world.ts";

// The runner: a 30 pixel square that runs, jumps, crouches, rides lifts and bounces, and is knocked out by any hazard it
// touches.
// stepRun moves the run in sim.run one physics step, reading sim.keys.

export const newRunner = (): Runner => (
{
	x: course.level.start[0] * T + T / 2 - 15,
	y: course.level.start[1] * T - 30,
	w: 30,
	h: 30,
	vx: 0,
	vy: 0,
	onG: false,
	gr: null,
	coy: 0,
	buf: 0,
	face: 1,
	sq: 0,
	jumping: false,
	boost: 0,
	crouch: false,
	dropT: 0,
	plock: null,
});

function moveX(p: Runner, d: number): void
{
	p.x += d;
	for (const s of sim.world.solids)
	{
		if (s.off || s.oneway || !hit(p, s)) continue;
		if (d > 0) p.x = s.x - p.w;
		else if (d < 0) p.x = s.x + s.w;
		else
		{
			const l = p.x + p.w - s.x;
			const r = s.x + s.w - p.x;
			p.x += l < r ? -l : r;
		}
		p.vx = 0;
		p.boost = 0;
	}
	if (course.level.wrapX)
	{
		if (p.x + p.w / 2 < 0) p.x += W;
		else if (p.x + p.w / 2 > W) p.x -= W;
	}
	else
	{
		if (p.x < 0)
		{
			p.x = 0;
			p.vx = 0;
		}
		if (p.x > W - p.w)
		{
			p.x = W - p.w;
			p.vx = 0;
		}
	}
}

function land(p: Runner, s: Solid): void
{
	if (s.k === "jelly" && p.vy > 200)
	{
		p.vy = -Math.min(820, Math.max(480, p.vy * 0.9));
		p.jumping = false;
		s.anim = 1;
		sfx("boing");
		return;
	}
	if (s.k === "boost")
	{
		p.boost = s.dir! * 650;
		p.vy = -420;
		p.jumping = false;
		sfx("boing");
		return;
	}
	if (s.k === "spring")
	{
		p.vy = -950;
		p.jumping = false;
		s.anim = 1;
		sfx("boing");
		return;
	}
	if (p.vy > 550) p.sq = 1;
	p.vy = 0;
	p.onG = true;
	p.gr = s;
	if (isCrumble(s) && s.st === 0)
	{
		s.st = 1;
		s.t = 0.45;
	}
}

function moveY(p: Runner, d: number): void
{
	p.y += d;
	for (const s of sim.world.solids)
	{
		if (s.off || !hit(p, s)) continue;
		if (s.oneway && (d <= 0 || p.dropT > 0 || p.y + p.h - d > s.y + 0.5)) continue;
		if (d > 0 && p.y + p.h - d > s.y + 6)
		{
			if (s.k !== "mover")
			{
				p.y = s.y + s.h;
				if (p.vy < 0) p.vy = 0;
			}
			continue;
		}
		if (d > 0)
		{
			p.y = s.y - p.h;
			land(p, s);
		}
		else
		{
			p.y = s.y + s.h;
			if (p.vy < 0) p.vy = 0;
		}
	}
}

function squishedBy(p: Runner, ex: Solid): boolean
{
	for (const s of sim.world.solids)
	{
		if (s === ex || s.off || s.oneway) continue;
		if (hit(p, s)) return true;
	}
	return false;
}

export function stepRun(dt: number): void
{
	const run = sim.run!;
	const world = sim.world;
	const keys = sim.keys;
	const LV = course.level;
	const p = run.p;
	for (const m of world.movers)
	{
		if (p.gr === m)
		{
			p.y += m.dy;
			if (m.dy < 0 && squishedBy(p, m))
			{
				die(m.owner, "squished");
				return;
			}
			moveX(p, m.dx);
		}
		else if (hit(p, m))
		{
			if (Math.abs(m.dy) > Math.abs(m.dx))
			{
				if (m.dy < 0)
				{
					p.y = m.y - p.h;
					p.vy = Math.min(p.vy, 0);
					p.onG = true;
					p.gr = m;
				}
				else
				{
					p.y = m.y + m.h;
					p.vy = Math.max(p.vy, 0);
				}
			}
			else
			{
				p.x = m.dx > 0 ? m.x + m.w : m.x - p.w;
				p.vx = 0;
				p.boost = 0;
			}
			if (squishedBy(p, m))
			{
				die(m.owner, "squished");
				return;
			}
		}
	}
	if (p.gr?.off)
	{
		p.onG = false;
		p.gr = null;
	}
	const dir = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
	if (dir) p.face = dir;
	const ice = p.onG && p.gr?.k === "ice";
	const rate = dir ? (p.onG ? (ice ? 550 : 2800) : 1800) : p.onG ? (ice ? 220 : 3200) : 500;
	if (keys.d && !p.crouch)
	{
		p.crouch = true;
		p.y += 14;
		p.h = 16;
	}
	else if (!keys.d && p.crouch)
	{
		const up =
		{
			x: p.x,
			y: p.y - 14,
			w: p.w,
			h: 30,
		};
		if (!world.solids.some((s) => !s.off && !s.oneway && hit(up, s)))
		{
			p.crouch = false;
			p.y -= 14;
			p.h = 30;
		}
	}
	if (p.crouch && p.onG && p.gr?.oneway)
	{
		p.dropT = 0.25;
		p.onG = false;
		p.gr = null;
	}
	if (p.dropT > 0) p.dropT -= dt;
	p.vx = approach(p.vx, dir * (p.crouch && p.onG ? 140 : 300), rate * dt);
	const push = p.onG && p.gr?.k === "belt" ? p.gr.dir! * 160 : 0;
	p.buf -= dt;
	p.coy -= dt;
	if (p.onG) p.coy = 0.1;
	if (p.buf > 0 && p.coy > 0)
	{
		p.vy = -780;
		p.buf = 0;
		p.coy = 0;
		p.jumping = true;
		p.onG = false;
		p.gr = null;
		sfx("jump");
	}
	if (p.jumping && !keys.j && p.vy < -260) p.vy = -260;
	if (p.vy >= 0) p.jumping = false;
	for (const s of world.solids)
		if (
			s.vdir &&
			!s.off &&
			hit(
				p,
				{
					x: s.x - 2,
					y: s.y,
					w: s.w + 4,
					h: s.h,
				},
			) &&
			p.y + p.h > s.y + 2
		)
		{
			if (s.vdir < 0) p.vy = Math.min(p.vy, -230);
			else p.vy = Math.max(p.vy, 240);
		}
	let wind = 0;
	for (const f of world.fans)
		if (hit(p, f.zone))
		{
			if (f.dir === 3) p.vy = p.crouch ? Math.min(p.vy, 160) : Math.max(-480, p.vy - 3800 * dt);
			else if (f.dir === 1) p.vy = Math.min(1000, p.vy + 1600 * dt);
			else wind += (f.dir === 0 ? 1 : -1) * 250;
		}
	moveX(p, (p.vx + push + wind + p.boost) * dt);
	p.boost = approach(p.boost, 0, 800 * dt);
	const vine = world.vines.some((v) => hit(p, v));
	if (vine) p.vy = keys.j ? -240 : keys.d ? 340 : Math.min(p.vy + GRAV * dt, 140);
	else p.vy = Math.min(p.vy + GRAV * (LV.grav ?? 1) * dt, 1000);
	p.onG = false;
	p.gr = null;
	moveY(p, p.vy * dt);
	p.sq = Math.max(0, p.sq - dt * 5);
	const hb =
	{
		x: p.x + 4,
		y: p.y + 4,
		w: p.w - 8,
		h: p.h - 5,
	};
	for (const h of world.hazards)
		if (h.t === "rect" ? hit(hb, h) : circHit(hb, h.x, h.y, h.r))
		{
			die(h.owner, h.cause);
			return;
		}
	for (const b of world.balls)
		if (circHit(hb, b.x, b.y, 9))
		{
			die(b.owner, "blasted");
			return;
		}
	for (const f of world.firebars)
		for (let k = 1; k <= 4; k++)
			if (circHit(hb, f.cx + Math.cos(f.a) * k * 24, f.cy + Math.sin(f.a) * k * 24, 9))
			{
				die(f.owner, "scorched");
				return;
			}
	for (const q of world.sawtracks)
		if (circHit(hb, q.x, q.y, 16))
		{
			die(q.owner, "sawed");
			return;
		}
	for (const q of world.firetracks)
		for (let k = 1; k <= 3; k++)
			if (circHit(hb, q.x + Math.cos(q.a) * k * 24, q.y + Math.sin(q.a) * k * 24, 9))
			{
				die(q.owner, "scorched");
				return;
			}
	for (const l of world.lasers)
		if (l.on && hit(hb, l.r))
		{
			die(l.owner, "zapped");
			return;
		}
	for (const q of world.pops)
		if (q.up > 0.5 && hit(hb, q.r))
		{
			die(q.owner, "spiked");
			return;
		}
	for (const q of world.axes)
		if (circHit(hb, q.px + Math.sin(q.a) * 96, q.py + Math.cos(q.a) * 96, 18))
		{
			die(q.owner, "chopped");
			return;
		}
	for (const q of world.crushers)
		if (
			hit(
				hb,
				{
					x: q.x + 4,
					y: q.y + 4,
					w: T - 8,
					h: T - 6,
				},
			)
		)
		{
			die(q.owner, "crushed");
			return;
		}
	if (LV.wrapY)
	{
		if (p.y + p.h / 2 > H) p.y -= H;
		else if (p.y + p.h / 2 < 0) p.y += H;
	}
	else if (p.y > H + 40)
	{
		die(-1, "fell");
		return;
	}
	if (run.t > 60)
	{
		const moving = keys.l || keys.r || keys.j || Math.abs(p.vx) > 20;
		run.idle = moving ? 0 : run.idle + dt;
		if (run.idle >= 5)
		{
			die(-1, "time");
			return;
		}
	}
	let inPortal = false;
	for (const q of world.portals)
		for (const [from, to] of [
			[q.a, q.b],
			[q.b, q.a],
		] as const)
		{
			if (
				!hit(
					p,
					{
						x: from.x + 10,
						y: from.y + 6,
						w: T - 20,
						h: 2 * T - 12,
					},
				)
			)
				continue;
			inPortal = true;
			if (p.plock !== q)
			{
				p.x = to.x + T / 2 - p.w / 2;
				p.y = to.y + 2 * T - p.h - 1;
				p.plock = q;
				sfx("gate");
				burst(to.x + T / 2, to.y + T, "#c77dff", 14);
			}
		}
	if (!inPortal) p.plock = null;
	if (
		LV.sw &&
		!world.swOn &&
		hit(
			hb,
			{
				x: LV.sw[0] * T + 4,
				y: LV.sw[1] * T + 18,
				w: T - 8,
				h: T - 18,
			},
		)
	)
	{
		world.swOn = true;
		world.gate!.off = true;
		sfx("gate");
		burst(LV.sw[0] * T + T / 2, LV.sw[1] * T + 28, "#06d6a0", 16);
	}
	if (hit(hb, goalRect())) finish();
}

/** Ends the run as knocked out by a player's trap (owner), or by the course (-1). Own traps are harmless with no friendly fire. */
export function die(owner: number, cause: string): void
{
	const run = sim.run!;
	if (game.noFF && owner >= 0 && owner === run.pi) return;
	const p = run.p;
	const res =
	{
		finished: false as const,
		owner,
		cause,
		x: p.x + p.w / 2,
		y: Math.min(p.y + p.h / 2, H - 24),
	};
	run.res = res;
	run.state = "done";
	run.doneT = 1;
	sfx("die");
	burst(res.x, res.y, game.players[run.pi]!.color, 22);
}

function finish(): void
{
	const run = sim.run!;
	const p = run.p;
	run.res =
	{
		finished: true,
		time: run.t,
	};
	run.state = "done";
	run.doneT = 1;
	sfx("win");
	burst(p.x + p.w / 2, p.y, "#ffd166", 26);
}
