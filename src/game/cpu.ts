import {placeAmong, valid} from "./course.ts";
import {COLS, DIRV, rand, ROWS, STEP, T} from "./geometry.ts";
import {DEFS, pieceCells, SOLIDT} from "./pieces.ts";
import {die, stepRun} from "./physics.ts";
import {explore, solvable} from "./solver.ts";
import {course, game, sim} from "./state.ts";
import type {Action, CpuRun, Pick, Piece, PieceType, PlanNode, Planner, Runner} from "./types.ts";

// The computer players: which piece to take, where to put it, and how to run. A run is planned with the real physics
// on a frozen world, then followed with a person's slips and late reactions, and re-planned on the move when the
// runner is knocked off course.

/**
 * Per skill: how often it slips to a random move, the search size, think time (ms) at the start and when re-planning,
 * the seconds before it gives up, whether it plans around moving hazards, and how often it places a piece at random.
 */
const SK = [
	{
		slip: 0.12,
		nodes: 7000,
		think: 4500,
		rethink: 600,
		quit: 50,
		danger: true,
		rand: 0.4,
	},
	{
		slip: 0.04,
		nodes: 7000,
		think: 4500,
		rethink: 600,
		quit: 50,
		danger: true,
		rand: 0,
	},
	{
		slip: 0,
		nodes: 7000,
		think: 4500,
		rethink: 600,
		quit: 50,
		danger: true,
		rand: 0,
	},
] as const;
const skill = (): (typeof SK)[number] => SK[game.skill]!;
/**
 * A person's feel for every CPU: up to `lag` steps late to react, hesitating before some jumps, letting go early for a
 * short hop, and holding a direction a bit too long.
 */
const HUM =
{
	lag: 3,
	hesitate: 0.08,
	hop: 0.08,
	over: 0.1,
};

/**
 * The box card a CPU takes: now and then the Mystery card, otherwise blocks when the course cannot be finished and
 * hazards when it can.
 */
export function cpuChoosePick(): Pick
{
	if (!game.mystTaken && Math.random() < 0.1) return "m";
	const ok = solvable(game.pieces) || game.lastFin >= 0.5;
	const v = game.box.map((t) =>
	{
		const d = DEFS[t];
		let x = Math.random();
		if (ok)
		{
			if (d.kind === "hazard") x += 1 + game.skill * 0.4;
			if (t === "bomb") x -= 0.6;
		}
		else
		{
			if (SOLIDT.has(t)) x += 2;
			else if (t === "bomb") x += 1.5;
			else if (d.kind === "help") x += 0.4;
		}
		return x;
	});
	return v.indexOf(Math.max(...v));
}

/** Where a CPU puts its piece, or null when no spot fits. Higher skill tries more spots. */
export function cpuPlacement(type: PieceType): Piece | null
{
	const d = DEFS[type];
	const who = game.order[game.turn]!;
	const cands: Piece[] = [];
	for (let k = 0; k < [150, 350, 600][game.skill]!; k++)
	{
		const q =
		{
			type,
			c: rand(COLS),
			r: rand(ROWS),
			rot: rand(d.rots),
			owner: who,
		};
		if (valid(q, placeAmong(type))) cands.push(q);
	}
	if (!cands.length) return null;
	if (Math.random() < skill().rand) return cands[0]!;
	const now = explore(game.pieces);
	const lim = [40, 120, 220][game.skill]!;
	if (type === "bomb")
	{
		let best = null;
		let bv = -1e9;
		for (const q of cands.slice(0, lim))
		{
			const area = new Set(pieceCells(q).map((a) => a.join()));
			const rest = game.pieces.filter((p) => !pieceCells(p).some((a) => area.has(a.join())));
			const e = explore(rest);
			const hz = game.pieces.length - rest.length;
			const v = now.won ? (e.won ? hz * 0.2 : -50) : (e.won ? 100 : now.minD - e.minD) + hz * 0.1;
			if (v > bv)
			{
				bv = v;
				best = q;
			}
		}
		return best;
	}
	if (!now.won && !(game.lastFin >= 0.5))
	{
		let best = null;
		let bv = -1e9;
		for (const q of cands.slice(0, lim))
		{
			const e = explore([...game.pieces, q]);
			const v = e.won ? 1000 : -e.minD + Math.random() * 0.5;
			if (v > bv)
			{
				bv = v;
				best = q;
			}
		}
		return best;
	}
	const route = now.reached;
	let best = null;
	let bv = -1e9;
	for (const q of cands.slice(0, lim))
	{
		const e = explore([...game.pieces, q]);
		if (now.won ? !e.won : e.minD > now.minD) continue;
		let dm = 99;
		for (const [c, r] of pieceCells(q))
			for (const [a, b] of route)
			{
				const dd = Math.abs(a - c) + Math.abs(b - r);
				if (dd < dm) dm = dd;
			}
		const v = (d.kind === "hazard" ? -dm : -Math.abs(dm - 2)) + Math.random() * 1.5;
		if (v > bv)
		{
			bv = v;
			best = q;
		}
	}
	return best ?? cands[0]!;
}

/** Each planned move is held for MACRO physics steps. */
const MACRO = 10;
const ACTS: Action[] = [
	[1, 0],
	[1, 1],
	[-1, 0],
	[-1, 1],
	[0, 0],
	[0, 1],
	[1, 0, 1],
	[-1, 0, 1],
	[0, 0, 1],
];

function solidGrid(sw: number): Uint8Array
{
	const world = sim.world;
	const g = new Uint8Array(COLS * ROWS);
	for (const s of world.solids)
	{
		if (s.off || s.oneway || (s === world.gate && sw)) continue;
		const c0 = Math.max(0, Math.floor(s.x / T));
		const c1 = Math.min(COLS - 1, Math.ceil((s.x + s.w) / T) - 1);
		const r0 = Math.max(0, Math.floor(s.y / T));
		const r1 = Math.min(ROWS - 1, Math.ceil((s.y + s.h) / T) - 1);
		for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r * COLS + c] = 1;
	}
	return g;
}

/** Steps from every open cell to the nearest target cell, around solids. */
function distMap(tg: [number, number][], sw: number): Float32Array
{
	const LV = course.level;
	const sg = solidGrid(sw);
	const d = new Float32Array(COLS * ROWS).fill(1e9);
	const q: number[] = [];
	for (const [c, r] of tg)
	{
		const i = r * COLS + c;
		d[i] = 0;
		q.push(i);
	}
	for (let h = 0; h < q.length; h++)
	{
		const i = q[h]!;
		const c = i % COLS;
		const r = (i / COLS) | 0;
		for (const [dc, dr] of [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
		] as const)
		{
			let nc = c + dc;
			let nr = r + dr;
			if (LV.wrapX) nc = (nc + COLS) % COLS;
			if (LV.wrapY) nr = (nr + ROWS) % ROWS;
			if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
			const j = nr * COLS + nc;
			if (sg[j] || d[j]! <= d[i]! + 1) continue;
			d[j] = d[i]! + 1;
			q.push(j);
		}
	}
	return d;
}

/** The cells a careful runner keeps out of: around swinging and moving hazards and in front of cannons. */
function dangerGrid(): Uint8Array
{
	const g = new Uint8Array(COLS * ROWS);
	const set = (c: number, r: number): void =>
	{
		if (c >= 0 && c < COLS && r >= 0 && r < ROWS) g[r * COLS + c] = 1;
	};
	const sg = solidGrid(1);
	for (const p of game.pieces)
	{
		const t = p.type;
		if (t === "firetrack")
		{
			for (let y = 0; y < ROWS; y++)
				for (let x = 0; x < COLS; x++)
					if (pieceCells(p).some(([c, r]) => Math.hypot(x - c, y - r) <= 2.6)) set(x, y);
		}
		else if (t === "axe" || t === "firebar")
		{
			for (let y = 0; y < ROWS; y++)
				for (let x = 0; x < COLS; x++) if (Math.hypot(x - p.c, y - p.r) <= 3.2) set(x, y);
		}
		else if (t === "sawtrack" || t === "crusher" || t === "laser" || t === "popspikes")
		{
			for (const [c, r] of pieceCells(p))
			{
				set(c, r);
				if (t === "popspikes") set(c, r - 1);
			}
		}
		else if (t === "cannon")
		{
			const [dx, dy] = DIRV[p.rot]!;
			let x = p.c + dx;
			let y = p.r + dy;
			while (x >= 0 && x < COLS && y >= 0 && y < ROWS && !sg[y * COLS + x])
			{
				set(x, y);
				x += dx;
				y += dy;
			}
		}
	}
	return g;
}

/** Runs one move from runner p on the frozen world, with no sound or particles, then puts the world back. */
function simStep(
	p: Runner,
	a: Action,
	sw: number,
	dg: Uint8Array | null,
):
{
	res: "ok" | "win" | "dead";
	sw: number;
}
{
	const R0 = sim.run;
	const K0 = sim.keys;
	const W = sim.world;
	const sw0 = W.swOn;
	const go0 = W.gate?.off ?? false;
	const cr = W.crumbles.map((c) => [c.st, c.t] as const);
	W.swOn = !!sw;
	if (W.gate) W.gate.off = !!sw;
	sim.quiet = true;
	sim.run =
	{
		pi: R0!.pi,
		p,
		state: "go",
		t: 0,
		idle: 0,
		doneT: 0,
	};
	sim.keys =
	{
		l: a[0] < 0 ? 1 : 0,
		r: a[0] > 0 ? 1 : 0,
		j: a[1],
		d: a[2] ?? 0,
	};
	let res: "ok" | "win" | "dead" = "ok";
	try
	{
		for (let i = 0; i < MACRO; i++)
		{
			stepRun(STEP);
			const run = sim.run;
			if (run.state !== "go")
			{
				res = run.res!.finished ? "win" : "dead";
				break;
			}
			if (dg)
			{
				const c0 = Math.floor((p.x + 3) / T);
				const c1 = Math.floor((p.x + p.w - 3) / T);
				const r0 = Math.floor((p.y + 3) / T);
				const r1 = Math.floor((p.y + p.h - 3) / T);
				let bad = false;
				for (let r = r0; r <= r1 && !bad; r++)
					for (let c = c0; c <= c1; c++)
						if (c >= 0 && c < COLS && r >= 0 && r < ROWS && dg[r * COLS + c])
						{
							bad = true;
							break;
						}
				if (bad)
				{
					res = "dead";
					break;
				}
			}
		}
	}
	finally
	{
		const nsw = W.swOn ? 1 : 0;
		sim.quiet = false;
		sim.run = R0;
		sim.keys = K0;
		W.swOn = sw0;
		if (W.gate) W.gate.off = go0;
		W.crumbles.forEach((c, i) =>
		{
			c.st = cr[i]![0];
			c.t = cr[i]![1];
		});
		sw = nsw;
	}
	return {
		res,
		sw,
	};
}

function heapPush(h: PlanNode[], n: PlanNode): void
{
	h.push(n);
	let i = h.length - 1;
	while (i > 0)
	{
		const j = (i - 1) >> 1;
		if (h[j]!.f <= h[i]!.f) break;
		[h[i], h[j]] = [h[j]!, h[i]!];
		i = j;
	}
}

function heapPop(h: PlanNode[]): PlanNode
{
	const top = h[0]!;
	const last = h.pop()!;
	if (h.length)
	{
		h[0] = last;
		let i = 0;
		for (;;)
		{
			const l = 2 * i + 1;
			const r = l + 1;
			let m = i;
			if (l < h.length && h[l]!.f < h[m]!.f) m = l;
			if (r < h.length && h[r]!.f < h[m]!.f) m = r;
			if (m === i) break;
			[h[i], h[m]] = [h[m]!, h[i]!];
			i = m;
		}
	}
	return top;
}

function makePlanner(p0: Runner, sw0: number, useDanger: boolean, now: number): Planner
{
	const C = sim.run!.cpu!;
	const root: PlanNode =
	{
		p:
		{
			...p0,
		},
		sw: sw0,
		parent: null,
		a: null,
		g: 0,
		f: 0,
	};
	const P: Planner =
	{
		heap: [],
		seen: new Set(),
		root,
		best: root,
		bestH: 0,
		done: false,
		win: null,
		useDanger,
		dg: useDanger ? C.dg : null,
		t0: now,
		n: 0,
	};
	P.bestH = cpuH(root);
	root.f = P.bestH;
	heapPush(P.heap, root);
	return P;
}

/** How far a plan node is from the goal: the switch first if there is one, then the flag. */
function cpuH(n: PlanNode): number
{
	const C = sim.run!.cpu!;
	const LV = course.level;
	const p = n.p;
	let c = Math.floor((p.x + p.w / 2) / T);
	let r = Math.floor((p.y + p.h / 2) / T);
	c = Math.max(0, Math.min(COLS - 1, c));
	r = Math.max(0, Math.min(ROWS - 1, r));
	const m = LV.sw && !n.sw ? C.dSw! : C.dGoal;
	const d = m[r * COLS + c]!;
	return (d >= 1e9 ? 200 : d) * 40 + (LV.sw && !n.sw ? 3000 : 0);
}

/** Searches for up to ms milliseconds. */
function planStep(P: Planner, ms: number): void
{
	const t0 = performance.now();
	while (!P.done && performance.now() - t0 < ms)
	{
		if (!P.heap.length || P.n > skill().nodes)
		{
			P.done = true;
			break;
		}
		const n = heapPop(P.heap);
		P.n++;
		for (const a of ACTS)
		{
			const np =
			{
				...n.p,
			};
			if (a[1] && !n.a?.[1]) np.buf = 0.12;
			const r = simStep(np, a, n.sw, P.dg);
			if (r.res === "dead") continue;
			const ch: PlanNode =
			{
				p: np,
				sw: r.sw,
				parent: n,
				a,
				// Changing moves costs a little, so plans keep to steady presses.
				g: n.g + 1 + (n.a && (n.a[0] !== a[0] || n.a[1] !== a[1]) ? 0.6 : 0),
				f: 0,
			};
			if (r.res === "win")
			{
				P.win = ch;
				P.done = true;
				break;
			}
			const k = [
				(np.x / 8) | 0,
				(np.y / 8) | 0,
				np.onG ? 1 : 0,
				np.crouch ? 1 : 0,
				Math.round(np.vx / 100),
				Math.round(np.vy / 200),
				r.sw,
			].join();
			if (P.seen.has(k)) continue;
			P.seen.add(k);
			const h = cpuH(ch);
			if (h < P.bestH)
			{
				P.bestH = h;
				P.best = ch;
			}
			ch.f = h + ch.g * 5;
			heapPush(P.heap, ch);
		}
	}
}

export function cpuInitRun(): void
{
	const LV = course.level;
	const run = sim.run!;
	const [fc, fr] = LV.flag;
	const gt: [number, number][] = [];
	for (let c = fc - 1; c <= fc; c++) for (let r = fr - 3; r <= fr - 1; r++) gt.push([c, r]);
	const cpu: CpuRun =
	{
		plan: [],
		i: 0,
		sc: 0,
		prevJ: 0,
		P: null,
		ready: false,
		empty: 0,
		dGoal: distMap(gt, 1),
		dSw: LV.sw ? distMap([LV.sw], 0) : null,
		dg: dangerGrid(),
		t0: 0,
	};
	run.cpu = cpu;
	cpu.P = makePlanner(run.p, LV.sw ? 0 : 1, skill().danger, performance.now());
}

/**
 * Plans for a slice of each frame; once done (or out of time), turns the best path into the plan to follow, or, when
 * re-planning during a run, adds it after the stretch the runner is still following.
 */
export function cpuPlanFrame(now: number): void
{
	const run = sim.run!;
	const C = run.cpu!;
	const P = C.P;
	if (!P) return;
	planStep(P, 12);
	if (!P.done && now - P.t0 < (run.state === "ready" ? skill().think : skill().rethink)) return;
	if (!P.win && P.useDanger && run.state === "ready")
	{
		C.P = makePlanner(P.root.p, P.root.sw, false, now);
		C.P.carry = P;
		return;
	}
	let n: PlanNode = P.win ?? P.best;
	if (!P.win && P.carry && P.carry.bestH < P.bestH) n = P.carry.best;
	const plan: CpuRun["plan"] = [];
	while (n.parent)
	{
		plan.push(
			{
				a: n.a!,
				x: n.p.x,
				y: n.p.y,
			},
		);
		n = n.parent;
	}
	plan.reverse();
	C.P = null;
	C.empty = plan.length ? 0 : C.empty + 1;
	if (run.state === "ready")
	{
		C.plan = plan;
		C.i = 0;
		C.sc = 0;
		C.prevJ = 0;
		C.ready = true;
		C.t0 = now;
	}
	else C.plan = C.plan.concat(plan);
}

/**
 * Re-plans without stopping: keeps moving along a short bridge (the rest of the old plan, or easing off) and plans
 * from where that bridge will end.
 */
function startReplan(): void
{
	const run = sim.run!;
	const C = run.cpu!;
	const p = run.p;
	const k = 6;
	const tryBridge = (
		acts: Action[],
	):
	{
		out: CpuRun["plan"];
		sp: Runner;
		sw: number;
	} | null =>
	{
		const sp =
		{
			...p,
		};
		let sw = sim.world.swOn ? 1 : 0;
		const out: CpuRun["plan"] = [];
		for (const a of acts)
		{
			const r = simStep(sp, a, sw, null);
			sw = r.sw;
			if (r.res === "dead") return null;
			out.push(
				{
					a,
					x: sp.x,
					y: sp.y,
				},
			);
			if (r.res === "win") break;
		}
		return {
			out,
			sp,
			sw,
		};
	};
	const acts = C.plan.slice(C.i, C.i + k).map((e) => e.a);
	while (acts.length < k) acts.push([0, 0]);
	const still = Array.from(
		{
			length: k,
		},
		(): Action => [0, 0],
	);
	const b = tryBridge(acts) ??
		tryBridge(still) ??
		{
			out: acts.map((a) => (
			{
				a,
				x: p.x,
				y: p.y,
			})),
			sp:
			{
				...p,
			},
			sw: sim.world.swOn ? 1 : 0,
		};
	C.plan = b.out;
	C.i = 0;
	C.sc = 0;
	C.P = makePlanner(b.sp, b.sw, skill().danger, performance.now());
}

/** Presses the planned keys each physics step, the way a person would, re-planning when the runner strays from the plan. */
export function cpuControl(): void
{
	const run = sim.run!;
	const C = run.cpu!;
	const p = run.p;
	if (run.t > skill().quit || C.empty > 5)
	{
		die(-1, "gaveup");
		return;
	}
	if ((C.hold ?? 0) > 0)
	{
		C.hold = C.hold! - 1;
		sim.keys =
		{
			l: 0,
			r: 0,
			j: 0,
			d: 0,
		};
		C.prevJ = 0;
		return;
	}
	if (C.sc % MACRO === 0)
	{
		const e = C.i > 0 ? C.plan[C.i - 1] : null;
		if (!C.P && ((e && Math.hypot(e.x - p.x, e.y - p.y) > 18) || C.i >= C.plan.length)) startReplan();
		let a: Action = C.i < C.plan.length ? C.plan[C.i]!.a : [0, 0];
		if (a[1] && !C.prevJ && p.onG && Math.random() < HUM.hesitate)
		{
			C.hold = 10 + rand(30);
			sim.keys =
			{
				l: 0,
				r: 0,
				j: 0,
				d: 0,
			};
			return;
		}
		if (a[0] === 0 && C.lastH && C.cur?.[0] && Math.random() < HUM.over) C.overT = 2 + rand(3);
		else if (Math.random() < skill().slip) a = ACTS[rand(ACTS.length)]!;
		if (!C.cur || a[0] !== C.cur[0] || a[1] !== C.cur[1]) C.lag = rand(HUM.lag);
		C.want = a;
		if (C.i < C.plan.length) C.i++;
	}
	if ((C.lag ?? 0) > 0) C.lag = C.lag! - 1;
	else C.cur = C.want ?? [0, 0];
	let a: Action = C.cur ?? [0, 0];
	if ((C.overT ?? 0) > 0)
	{
		C.overT = C.overT! - 1;
		if (!a[0]) a = [C.lastH!, a[1]];
	}
	const press = a[1] && !C.prevJ;
	if (press)
	{
		p.buf = 0.12;
		C.cut = Math.random() < HUM.hop ? 3 + rand(5) : -1;
	}
	let j = a[1];
	if (j && (C.cut ?? -1) >= 0)
	{
		if (C.cut === 0) j = 0;
		else C.cut = C.cut! - 1;
	}
	sim.keys =
	{
		l: a[0] < 0 ? 1 : 0,
		r: a[0] > 0 ? 1 : 0,
		j,
		d: a[2] ?? 0,
	};
	C.prevJ = a[1];
	if (a[0]) C.lastH = a[0];
	C.sc++;
}
