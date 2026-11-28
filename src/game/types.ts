// The shapes the game's modules share: pieces, levels, the simulated world, a run, and the game and its settings.

export type PieceType =
	| "block"
	| "plank"
	| "tee"
	| "zig"
	| "stairs"
	| "pillar"
	| "arch"
	| "beam"
	| "spikeblock"
	| "fake"
	| "big"
	| "ell"
	| "spring"
	| "mover"
	| "ice"
	| "belt"
	| "crumble"
	| "spikes"
	| "saw"
	| "cannon"
	| "firebar"
	| "portal"
	| "firetrack"
	| "sawtrack"
	| "laser"
	| "bridge"
	| "cloud"
	| "vine"
	| "jelly"
	| "popspikes"
	| "axe"
	| "crusher"
	| "fan"
	| "booster"
	| "blink"
	| "bomb";
export type Kind = "build" | "help" | "trick" | "hazard" | "clear";
/** A grid cell as [column, row]. */
export type Cell = [number, number];
/** A block of grid cells as [column, row, width, height]. */
export type Quad = [number, number, number, number];

export interface Rect
{
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface PieceDef
{
	name: string;
	tip: string;
	kind: Kind;
	rots: number;
	rare?: boolean;
	cells: (rot: number) => Cell[];
}

/** A spot on the grid, as column and row. */
export interface GridPos
{
	c: number;
	r: number;
}

/**
 * A piece on the course, or one being held. `parts` are its moving bits in the current world, for drawing. A portal's
 * entrance is at (c, r) and its exit at `b`.
 */
export interface Piece
{
	type: PieceType;
	c: number;
	r: number;
	rot: number;
	owner: number;
	t0?: number;
	parts?: Parts;
	b?: GridPos;
}

/** Ground and lava rects are [col,row,width,height]; start and flag are [col, row of the surface]. */
export interface Level
{
	name: string;
	desc: string;
	ground: Quad[];
	lava?: Quad[];
	start: Cell;
	flag: Cell;
	wrapX?: boolean;
	wrapY?: boolean;
	gate?: Quad;
	sw?: Cell;
	forced?:
	{
		type: PieceType;
		c: number;
		r: number;
	}[];
	/** Ledges the Surprise me route has to reach first, as [first column, last column, row]. */
	aims?: [number, number, number][];
	noFlagAim?: boolean;
	grav?: number;
	ice?: boolean;
}

export type SolidKind =
	| "ground"
	| "ice"
	| "block"
	| "belt"
	| "spring"
	| "crumble"
	| "mover"
	| "boost"
	| "cloud"
	| "jelly"
	| "blink"
	| "cannon";

export interface Solid extends Rect
{
	k: SolidKind;
	t0: number;
	off?: boolean;
	oneway?: boolean;
	/** Which way a belt or booster pushes. */
	dir?: number;
	/** Which way a conveyor stood on end carries a runner beside it: up (-1) or down (1). */
	vdir?: number;
	anim?: number;
	warn?: boolean;
}
export interface Crumble extends Solid
{
	st: number;
	t: number;
	oy: number;
	vy: number;
}
export interface Mover extends Solid
{
	owner: number;
	x0: number;
	y0: number;
	ax: number;
	range: number;
	dx: number;
	dy: number;
}
export interface Gate extends Solid
{
	open: number;
}

export interface RectHazard extends Rect
{
	t: "rect";
	owner: number;
	cause: string;
}
export interface CircleHazard
{
	t: "circ";
	x: number;
	y: number;
	r: number;
	owner: number;
	cause: string;
}
export type Hazard = RectHazard | CircleHazard;

export interface Cannon
{
	x: number;
	y: number;
	dir: number;
	t0: number;
	n: number;
	flash: number;
	owner: number;
	solid: Solid;
}
export interface Ball
{
	x: number;
	y: number;
	vx: number;
	vy: number;
	owner: number;
	src: Solid;
	/** Solids the ball was fired from inside, which it flies out through. */
	ign: Solid[];
}
export interface FireBar
{
	cx: number;
	cy: number;
	a: number;
	dir: number;
	owner: number;
	t0: number;
}
/** A fire bar or saw riding a track. */
export interface Track
{
	x0: number;
	y0: number;
	ax: number;
	x: number;
	y: number;
	a: number;
	owner: number;
	t0: number;
}
export interface Laser
{
	on: boolean;
	owner: number;
	r: Rect;
	t0: number;
}
export interface Fan
{
	dir: number;
	zone: Rect;
	t0: number;
}
export interface PopSpikes
{
	up: number;
	owner: number;
	r: Rect;
	t0: number;
}
export interface Axe
{
	px: number;
	py: number;
	a: number;
	owner: number;
	t0: number;
}
/** A portal's entrance (a) and exit (b), by their top left corners. */
export interface Portal
{
	a:
	{
		x: number;
		y: number;
	};
	b:
	{
		x: number;
		y: number;
	};
}
export interface Crusher
{
	x: number;
	y0: number;
	y: number;
	owner: number;
	t0: number;
}

export interface Parts
{
	spring?: Solid;
	crumble?: Crumble;
	mover?: Mover;
	jelly?: Solid;
	blink?: Solid;
	firebar?: FireBar;
	track?: Track;
	laser?: Laser;
	pop?: PopSpikes;
	axe?: Axe;
	crusher?: Crusher;
	cannon?: Cannon;
	fan?: Fan;
}

export interface World
{
	time: number;
	solids: Solid[];
	hazards: Hazard[];
	movers: Mover[];
	crumbles: Crumble[];
	cannons: Cannon[];
	balls: Ball[];
	firebars: FireBar[];
	firetracks: Track[];
	portals: Portal[];
	sawtracks: Track[];
	lasers: Laser[];
	fans: Fan[];
	vines: Rect[];
	pops: PopSpikes[];
	axes: Axe[];
	crushers: Crusher[];
	gate: Gate | null;
	swOn: boolean;
}

export interface Runner extends Rect
{
	vx: number;
	vy: number;
	onG: boolean;
	gr: Solid | null;
	coy: number;
	buf: number;
	face: number;
	sq: number;
	jumping: boolean;
	boost: number;
	/** Crouched to 16 pixels high, under a low beam or to drop through a cloud. */
	crouch: boolean;
	/** Seconds left falling through clouds after crouching on one. */
	dropT: number;
	/** The portal it just came out of, which cannot take it back until it steps out. */
	plock: Portal | null;
}

export type Result =
	|
	  {
			finished: true;
			time: number;
	  }
	|
	  {
			finished: false;
			owner: number;
			cause: string;
			x: number;
			y: number;
	  };

export type RunState = "ready" | "go" | "done";

export interface Run
{
	pi: number;
	p: Runner;
	state: RunState;
	t: number;
	idle: number;
	doneT: number;
	res?: Result;
	cpu?: CpuRun;
}

export interface Keys
{
	l: number;
	r: number;
	j: number;
	d: number;
}

/** A CPU run's move: [direction, jump] or [direction, jump, crouch]. */
export type Action = [number, number] | [number, number, number];

export interface PlanNode
{
	p: Runner;
	sw: number;
	parent: PlanNode | null;
	a: Action | null;
	g: number;
	f: number;
}

export interface Planner
{
	heap: PlanNode[];
	seen: Set<string>;
	root: PlanNode;
	best: PlanNode;
	bestH: number;
	done: boolean;
	win: PlanNode | null;
	useDanger: boolean;
	dg: Uint8Array | null;
	t0: number;
	n: number;
	carry?: Planner;
}

export interface CpuRun
{
	plan:
	{
		a: Action;
		x: number;
		y: number;
	}[];
	i: number;
	sc: number;
	prevJ: number;
	P: Planner | null;
	ready: boolean;
	empty: number;
	dGoal: Float32Array;
	dSw: Float32Array | null;
	dg: Uint8Array;
	t0: number;
}

export interface Particle
{
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number;
	color: string;
	r: number;
}

export interface Player
{
	name: string;
	color: string;
	score: number;
	cpu: boolean;
}

/** A card in the box: a piece's index, or "m" for the Mystery card. */
export type Pick = number | "m";

export type Phase = "setup" | "vote" | "voted" | "pick" | "place" | "run" | "score" | "win";

export interface Game
{
	drought: number;
	solo: boolean;
	best: Record<string, number>;
	hist: Piece[][];
	players: Player[];
	target: number;
	round: number;
	pieces: Piece[];
	phase: Phase;
	order: number[];
	turn: number;
	box: PieceType[];
	picks: Partial<Record<number, PieceType>>;
	rot: number;
	results: Result[];
	/** The box card picked and waiting for a confirm: its index, or "m" for the Mystery card. */
	sel: Pick | null;
	votes: number[];
	chosen: number;
	lastMsg: string;
	lastFin: number;
	skill: number;
	noFF: boolean;
	/** A portal's entrance, placed and waiting for its exit. */
	portalA: GridPos | null;
	/** Whether someone has taken this round's Mystery card. */
	mystTaken: boolean;
	/** Whether a Mystery piece is being shown off, which holds up the picking. */
	revealing: boolean;
}

/** The player setup, saved in localStorage under `pieceparty`. */
export interface Settings
{
	count: number;
	names: string[];
	target: number;
	cpu: boolean[];
	skill: number;
	noFF: boolean;
	colors: string[];
}
