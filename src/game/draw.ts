import {placeAmong, valid} from "./course.ts";
import {COLS, DIRV, H, ROWS, T, W} from "./geometry.ts";
import {DEFS, isBomb, onTop, pieceCells} from "./pieces.ts";
import {course, game, placing, sim} from "./state.ts";
import type {Level, Piece, PieceType} from "./types.ts";

// Draws the course on the canvas: the sky, the level, every piece with its moving parts, the runner in a hard hat,
// the placing ghost, banners and particles. Also the piece and level thumbnails on the cards and in the tray.

let ctx: CanvasRenderingContext2D;
const DPR = Math.min(2, window.devicePixelRatio || 1);

/** Sizes the course canvas for the screen's pixel density. */
export function initCanvas(): void
{
	const cv = document.getElementById("cv");
	if (!(cv instanceof HTMLCanvasElement)) throw new Error("#cv is missing or not a canvas");
	ctx = cv.getContext("2d")!;
	cv.width = W * DPR;
	cv.height = H * DPR;
}

type Radii = Parameters<CanvasRenderingContext2D["roundRect"]>[4];
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: Radii): void
{
	g.beginPath();
	g.roundRect(x, y, w, h, r);
}

/** The color lightened (a above 0) or darkened (a below 0) by fraction a. */
function shade(hex: string, a: number): string
{
	const n = parseInt(hex.slice(1), 16);
	const f = (c: number): number => Math.round(Math.max(0, Math.min(255, c + (a < 0 ? c * a : (255 - c) * a))));
	return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawBomb(g: CanvasRenderingContext2D, cx: number, cy: number, k: number, t: number): void
{
	g.save();
	g.translate(cx, cy);
	g.scale(k, k);
	g.fillStyle = k > 1 ? "#3a0ca3" : "#22223b";
	g.beginPath();
	g.arc(0, 0, 22, 0, 7);
	g.fill();
	g.fillStyle = "rgba(255,255,255,.3)";
	g.beginPath();
	g.arc(-8, -8, 6, 0, 7);
	g.fill();
	g.fillStyle = k > 1 ? "#3a0ca3" : "#22223b";
	g.fillRect(-6, -29, 12, 9);
	g.strokeStyle = "#c49a3a";
	g.lineWidth = 3;
	g.beginPath();
	g.moveTo(0, -29);
	g.quadraticCurveTo(6, -40, 14, -38);
	g.stroke();
	g.fillStyle = "#ffd166";
	g.beginPath();
	g.arc(15, -38, 4 + Math.sin(t * 20) * 1.5, 0, 7);
	g.fill();
	g.restore();
}

/** A swirling portal two tiles high with its top left at (x, y), labeled while placing. */
function drawPortal(g: CanvasRenderingContext2D, x: number, y: number, t: number, lab: string): void
{
	const cx = x + T / 2;
	const cy = y + T;
	g.save();
	g.fillStyle = "rgba(123,44,191,.35)";
	g.beginPath();
	g.ellipse(cx, cy, T * 0.48, T * 0.98, 0, 0, 7);
	g.fill();
	g.strokeStyle = "#c77dff";
	g.lineWidth = 5;
	g.beginPath();
	g.ellipse(cx, cy, T * 0.42, T * 0.9, 0, 0, 7);
	g.stroke();
	g.strokeStyle = "rgba(255,255,255,.75)";
	g.lineWidth = 2;
	for (let k = 0; k < 3; k++)
	{
		const ph = (t * 1.2 + k / 3) % 1;
		g.globalAlpha = 1 - ph;
		g.beginPath();
		g.ellipse(cx, cy, T * 0.4 * (1 - ph), T * 0.86 * (1 - ph), 0, 0, 7);
		g.stroke();
	}
	g.globalAlpha = 1;
	if (lab)
	{
		g.fillStyle = "#fff";
		g.font = "700 13px Fredoka,system-ui";
		g.textAlign = "center";
		g.fillText(lab, cx, y - 4);
	}
	g.restore();
}

function drawSaw(g: CanvasRenderingContext2D, cx: number, cy: number, t: number): void
{
	g.save();
	g.translate(cx, cy);
	g.rotate(t * 7);
	g.fillStyle = "#dfe4ec";
	g.beginPath();
	for (let i = 0; i < 24; i++)
	{
		const a = (i * Math.PI) / 12;
		const d = i % 2 ? 13 : 20;
		g.lineTo(Math.cos(a) * d, Math.sin(a) * d);
	}
	g.fill();
	g.fillStyle = "#a7afbd";
	g.beginPath();
	g.arc(0, 0, 9, 0, 7);
	g.fill();
	g.fillStyle = "#e63946";
	g.beginPath();
	g.arc(0, 0, 4, 0, 7);
	g.fill();
	g.restore();
}

function cell(g: CanvasRenderingContext2D, x: number, y: number, c: string, hi: string, lo: string): void
{
	g.fillStyle = lo;
	rr(g, x + 1, y + 1, T - 2, T - 2, 7);
	g.fill();
	g.fillStyle = c;
	rr(g, x + 1, y + 1, T - 2, T - 6, 7);
	g.fill();
	g.fillStyle = hi;
	rr(g, x + 6, y + 5, T - 12, 4, 2);
	g.fill();
}

/** The shaped build pieces' colors: [face, highlight, shadow]. */
const SHAPE_COL: Partial<Record<PieceType, [string, string, string]>> =
{
	tee: ["#f3722c", "#f8a26f", "#b4501a"],
	zig: ["#43aa8b", "#7fd1b5", "#2c7a62"],
	stairs: ["#8d99ae", "#c0c8d6", "#5f6b80"],
	pillar: ["#cdb4db", "#ead9f3", "#9b7fae"],
	arch: ["#bc4749", "#e07a7c", "#8a2f31"],
};

/** Draws a piece at time t, with its moving parts where the world has them, or at rest for a ghost or thumbnail. */
function drawPiece(g: CanvasRenderingContext2D, p: Piece, t: number): void
{
	// Stood-up ice, low beams and conveyors are the lying-down ones turned a quarter turn.
	if (((p.type === "ice" || p.type === "beam") && p.rot === 1) || (p.type === "belt" && p.rot > 1))
	{
		g.save();
		g.translate(p.c * T + T, p.r * T);
		g.rotate(Math.PI / 2);
		drawPiece(
			g,
			{
				...p,
				c: 0,
				r: 0,
				rot: p.type === "belt" && p.rot === 2 ? 1 : 0,
			},
			t,
		);
		g.restore();
		return;
	}
	if (p.type === "cloud" && p.rot === 1)
	{
		for (let k = 0; k < 3; k++)
		{
			const X = p.c * T;
			const Y = p.r * T + k * T;
			g.fillStyle = "rgba(200,225,240,.9)";
			g.beginPath();
			g.ellipse(X + T / 2, Y + 16, T * 0.55, 9, 0, 0, 7);
			g.fill();
			g.fillStyle = "#fff";
			g.beginPath();
			g.ellipse(X + 12, Y + 11, 11, 9, 0, 0, 7);
			g.ellipse(X + T / 2 + 2, Y + 7, 13, 11, 0, 0, 7);
			g.ellipse(X + T - 11, Y + 11, 10, 8, 0, 0, 7);
			g.fill();
		}
		return;
	}
	const o = p.parts ?? {};
	const X = p.c * T;
	const Y = p.r * T;
	let dot: [number, number] = [X, Y];
	switch (p.type)
	{
		case "tee":
		case "zig":
		case "stairs":
		case "pillar":
		case "arch":
		{
			const [face, hi, lo] = SHAPE_COL[p.type]!;
			for (const [c, r] of pieceCells(p)) cell(g, c * T, r * T, face, hi, lo);
			dot = [pieceCells(p)[0]![0] * T, pieceCells(p)[0]![1] * T];
			if (p.type === "pillar")
			{
				g.strokeStyle = "rgba(255,255,255,.35)";
				g.lineWidth = 2;
				for (const [c, r] of pieceCells(p))
				{
					g.beginPath();
					g.moveTo(c * T + 12, r * T + 6);
					g.lineTo(c * T + 12, r * T + T - 8);
					g.moveTo(c * T + T - 12, r * T + 6);
					g.lineTo(c * T + T - 12, r * T + T - 8);
					g.stroke();
				}
			}
			break;
		}
		case "beam":
		{
			g.fillStyle = "#5c677d";
			rr(g, X + 1, Y, 3 * T - 2, 22, 4);
			g.fill();
			g.fillStyle = "#7d8597";
			g.fillRect(X + 3, Y + 2, 3 * T - 6, 4);
			// Yellow and black hazard stripes along its underside.
			g.save();
			g.beginPath();
			g.rect(X + 1, Y + 16, 3 * T - 2, 6);
			g.clip();
			for (let k = -1; k < 16; k++)
			{
				g.fillStyle = k % 2 ? "#1b1b2f" : "#ffd166";
				g.beginPath();
				g.moveTo(X + k * 10, Y + 22);
				g.lineTo(X + k * 10 + 10, Y + 16);
				g.lineTo(X + k * 10 + 20, Y + 16);
				g.lineTo(X + k * 10 + 10, Y + 22);
				g.fill();
			}
			g.restore();
			g.fillStyle = "#adb5bd";
			for (let k = 0; k < 6; k++)
			{
				g.beginPath();
				g.arc(X + 10 + k * 20, Y + 11, 2, 0, 7);
				g.fill();
			}
			break;
		}
		case "spikeblock":
		{
			g.fillStyle = "#3d405b";
			rr(g, X + 1, Y + 15, T - 2, T - 16, 6);
			g.fill();
			g.fillStyle = "#55597a";
			rr(g, X + 5, Y + 20, T - 10, 4, 2);
			g.fill();
			const w = (T - 2) / 3;
			for (let i = 0; i < 3; i++)
			{
				const x0 = X + 1 + i * w;
				g.fillStyle = "#e4e8ef";
				g.beginPath();
				g.moveTo(x0, Y + 16);
				g.lineTo(x0 + w / 2, Y + 2);
				g.lineTo(x0 + w, Y + 16);
				g.fill();
				g.fillStyle = "#a7afbd";
				g.beginPath();
				g.moveTo(x0 + w / 2, Y + 2);
				g.lineTo(x0 + w, Y + 16);
				g.lineTo(x0 + w / 2, Y + 16);
				g.fill();
			}
			dot = [X, Y + 14];
			break;
		}
		case "fake":
		{
			// A plain block that shimmers now and then, the only hint it is not there.
			const sh = Math.sin(t * 1.3 + X);
			g.save();
			g.globalAlpha = 0.86 + 0.12 * sh;
			cell(g, X, Y, "#5a67d8", "#8b96ff", "#3b43a3");
			g.restore();
			if (sh > 0.97)
			{
				g.strokeStyle = "rgba(255,255,255,.7)";
				g.lineWidth = 2;
				g.strokeRect(X + 3, Y + 3, T - 6, T - 6);
			}
			break;
		}
		case "block":
		case "plank":
		case "big":
		case "ell":
			for (const [c, r] of pieceCells(p)) cell(g, c * T, r * T, "#5a67d8", "#8b96ff", "#3b43a3");
			dot = [pieceCells(p)[0]![0] * T, pieceCells(p)[0]![1] * T];
			break;
		case "ice":
			g.fillStyle = "#5fb8d9";
			rr(g, X + 1, Y + 1, 3 * T - 2, T - 2, 8);
			g.fill();
			g.fillStyle = "#c9f3ff";
			rr(g, X + 1, Y + 1, 3 * T - 2, T - 7, 8);
			g.fill();
			g.strokeStyle = "#fff";
			g.lineWidth = 3;
			g.lineCap = "round";
			g.beginPath();
			for (const s of [22, 58, 94])
			{
				g.moveTo(X + s, Y + 26);
				g.lineTo(X + s + 12, Y + 12);
			}
			g.stroke();
			break;
		case "belt":
		{
			const d = p.rot ? -1 : 1;
			g.fillStyle = "#2b2d42";
			rr(g, X + 1, Y + 4, 3 * T - 2, T - 8, 16);
			g.fill();
			g.fillStyle = "#8d99ae";
			for (const cx of [X + 17, X + 3 * T - 17])
			{
				g.beginPath();
				g.arc(cx, Y + T / 2, 7, 0, 7);
				g.fill();
			}
			g.save();
			rr(g, X + 28, Y + 8, 3 * T - 56, T - 16, 4);
			g.clip();
			g.strokeStyle = "#ffd166";
			g.lineWidth = 4;
			g.lineJoin = "round";
			const off = (((t * 50 * d) % 16) + 16) % 16;
			g.beginPath();
			for (let x = X + off; x < X + 3 * T + 16; x += 16)
			{
				g.moveTo(x - 4 * d, Y + 12);
				g.lineTo(x + 4 * d, Y + T / 2);
				g.lineTo(x - 4 * d, Y + T - 12);
			}
			g.stroke();
			g.restore();
			break;
		}
		case "spring":
		{
			const a = o.spring?.anim ?? 0;
			const pad = Y + 8 + a * 14;
			const top = pad + 6;
			const bot = Y + T - 9;
			g.fillStyle = "#3d405b";
			rr(g, X + 4, bot, T - 8, 9, 3);
			g.fill();
			g.strokeStyle = "#b5bacb";
			g.lineWidth = 3;
			g.beginPath();
			for (let i = 0; i <= 4; i++) g.lineTo(X + (i % 2 ? T - 12 : 12), top + ((bot - top) * i) / 4);
			g.stroke();
			g.fillStyle = "#ef476f";
			rr(g, X + 3, pad, T - 6, 9, 4);
			g.fill();
			dot = [X, pad - 4];
			break;
		}
		case "crumble":
		{
			const st = o.crumble?.st ?? 0;
			const oy = o.crumble?.oy ?? 0;
			const sh = st === 1 ? (Math.random() - 0.5) * 4 : 0;
			g.save();
			if (st === 2) g.globalAlpha = Math.max(0, 1 - oy / 220);
			for (let i = 0; i < 2; i++) cell(g, X + i * T + sh, Y + oy, "#e9c46a", "#f6dc96", "#b98b2e");
			g.strokeStyle = "#8a6420";
			g.lineWidth = 2;
			g.beginPath();
			g.moveTo(X + 14 + sh, Y + oy + 9);
			g.lineTo(X + 22 + sh, Y + oy + 20);
			g.lineTo(X + 15 + sh, Y + oy + 30);
			g.moveTo(X + 58 + sh, Y + oy + 8);
			g.lineTo(X + 51 + sh, Y + oy + 19);
			g.lineTo(X + 61 + sh, Y + oy + 29);
			g.stroke();
			g.restore();
			dot = [X, Y + oy];
			break;
		}
		case "mover":
		{
			const v = p.rot === 1;
			g.strokeStyle = "rgba(255,255,255,.6)";
			g.lineWidth = 3;
			g.setLineDash([6, 8]);
			g.beginPath();
			if (v)
			{
				g.moveTo(X + T, Y + 6);
				g.lineTo(X + T, Y + 4 * T - 6);
			}
			else
			{
				g.moveTo(X + 6, Y + T / 4);
				g.lineTo(X + 5 * T - 6, Y + T / 4);
			}
			g.stroke();
			g.setLineDash([]);
			const px = o.mover?.x ?? X;
			const py = o.mover?.y ?? Y;
			g.fillStyle = "#1d7067";
			rr(g, px + 1, py, 2 * T - 2, T / 2, 7);
			g.fill();
			g.fillStyle = "#2ec4b6";
			rr(g, px + 1, py, 2 * T - 2, T / 2 - 5, 7);
			g.fill();
			g.fillStyle = "#a5f3ea";
			rr(g, px + 12, py + 4, 2 * T - 24, 3, 2);
			g.fill();
			dot = [px, py - 2];
			break;
		}
		case "spikes":
			for (const [c, r] of pieceCells(p))
			{
				g.save();
				g.translate(c * T + T / 2, r * T + T / 2);
				g.rotate((p.rot * Math.PI) / 2);
				g.translate(-T / 2, -T / 2);
				g.fillStyle = "#e63946";
				rr(g, 1, T - 9, T - 2, 9, 3);
				g.fill();
				const w = (T - 2) / 3;
				for (let i = 0; i < 3; i++)
				{
					const x0 = 1 + i * w;
					g.fillStyle = "#e4e8ef";
					g.beginPath();
					g.moveTo(x0, T - 9);
					g.lineTo(x0 + w / 2, 5);
					g.lineTo(x0 + w, T - 9);
					g.fill();
					g.fillStyle = "#a7afbd";
					g.beginPath();
					g.moveTo(x0 + w / 2, 5);
					g.lineTo(x0 + w, T - 9);
					g.lineTo(x0 + w / 2, T - 9);
					g.fill();
				}
				g.restore();
			}
			break;
		case "portal":
		{
			const placingNow = game.phase === "place";
			drawPortal(g, X, Y, t, p.b && placingNow ? "in" : "");
			if (p.b)
			{
				drawPortal(g, p.b.c * T, p.b.r * T, t, placingNow ? "out" : "");
				if (placingNow)
				{
					g.save();
					g.strokeStyle = "rgba(199,125,255,.5)";
					g.setLineDash([6, 8]);
					g.lineWidth = 2;
					g.beginPath();
					g.moveTo(X + T / 2, Y + T);
					g.lineTo(p.b.c * T + T / 2, p.b.r * T + T);
					g.stroke();
					g.restore();
				}
			}
			break;
		}
		case "saw":
			drawSaw(g, X + T / 2, Y + T / 2, t);
			break;
		case "sawtrack":
			g.strokeStyle = "#3d405b";
			g.lineWidth = 6;
			g.lineCap = "round";
			g.beginPath();
			g.moveTo(X + T / 2, Y + T / 2);
			if (p.rot) g.lineTo(X + T / 2, Y + 3.5 * T);
			else g.lineTo(X + 3.5 * T, Y + T / 2);
			g.stroke();
			drawSaw(g, o.track?.x ?? X + T / 2, o.track?.y ?? Y + T / 2, t);
			break;
		case "firetrack":
		{
			const fx0 = o.track?.x ?? X + T / 2;
			const fy0 = o.track?.y ?? Y + T / 2;
			const a = o.track?.a ?? t * 2.6;
			g.strokeStyle = "#7a3b00";
			g.lineWidth = 6;
			g.lineCap = "round";
			g.beginPath();
			g.moveTo(X + T / 2, Y + T / 2);
			if (p.rot) g.lineTo(X + T / 2, Y + 3.5 * T);
			else g.lineTo(X + 3.5 * T, Y + T / 2);
			g.stroke();
			g.fillStyle = "#4a4e69";
			g.beginPath();
			g.arc(fx0, fy0, 10, 0, 7);
			g.fill();
			for (let k = 1; k <= 3; k++)
			{
				const bx = fx0 + Math.cos(a) * k * 24;
				const by = fy0 + Math.sin(a) * k * 24;
				g.fillStyle = "#ff6b35";
				g.beginPath();
				g.arc(bx, by, 10, 0, 7);
				g.fill();
				g.fillStyle = "#ffd166";
				g.beginPath();
				g.arc(bx, by, 5, 0, 7);
				g.fill();
			}
			g.fillStyle = "#22223b";
			g.beginPath();
			g.arc(fx0, fy0, 5, 0, 7);
			g.fill();
			dot = [fx0 - 8, fy0 - 8];
			break;
		}
		case "firebar":
		{
			const a = o.firebar?.a ?? t * 2.4 * (p.rot ? -1 : 1);
			const cx = X + T / 2;
			const cy = Y + T / 2;
			g.fillStyle = "#4a4e69";
			g.beginPath();
			g.arc(cx, cy, 11, 0, 7);
			g.fill();
			for (let k = 1; k <= 4; k++)
			{
				const fx = cx + Math.cos(a) * k * 24;
				const fy = cy + Math.sin(a) * k * 24;
				g.fillStyle = "#ff6b35";
				g.beginPath();
				g.arc(fx, fy, 10, 0, 7);
				g.fill();
				g.fillStyle = "#ffd166";
				g.beginPath();
				g.arc(fx, fy, 5, 0, 7);
				g.fill();
			}
			g.fillStyle = "#22223b";
			g.beginPath();
			g.arc(cx, cy, 5, 0, 7);
			g.fill();
			break;
		}
		case "laser":
		{
			const v = p.rot === 0;
			const on = o.laser?.on ?? true;
			const r =
				o.laser?.r ??
				(v
					?
						{
							x: X + T / 2 - 5,
							y: Y + 8,
							w: 10,
							h: 3 * T - 16,
						}
					:
						{
							x: X + 8,
							y: Y + T / 2 - 5,
							w: 3 * T - 16,
							h: 10,
						});
			if (on)
			{
				g.fillStyle = "rgba(255,59,92,.3)";
				g.fillRect(r.x - 5, r.y - 5, r.w + 10, r.h + 10);
				g.fillStyle = "#ff3b5c";
				g.fillRect(r.x, r.y, r.w, r.h);
				g.fillStyle = "#fff";
				if (v) g.fillRect(r.x + 4, r.y, 2, r.h);
				else g.fillRect(r.x, r.y + 4, r.w, 2);
			}
			else
			{
				g.save();
				g.strokeStyle = "rgba(255,59,92,.5)";
				g.lineWidth = 2;
				g.setLineDash([4, 6]);
				g.beginPath();
				if (v)
				{
					g.moveTo(X + T / 2, Y + 8);
					g.lineTo(X + T / 2, Y + 3 * T - 8);
				}
				else
				{
					g.moveTo(X + 8, Y + T / 2);
					g.lineTo(X + 3 * T - 8, Y + T / 2);
				}
				g.stroke();
				g.restore();
			}
			g.fillStyle = "#22223b";
			if (v)
			{
				rr(g, X + 8, Y, T - 16, 12, 4);
				g.fill();
				rr(g, X + 8, Y + 3 * T - 12, T - 16, 12, 4);
				g.fill();
			}
			else
			{
				rr(g, X, Y + 8, 12, T - 16, 4);
				g.fill();
				rr(g, X + 3 * T - 12, Y + 8, 12, T - 16, 4);
				g.fill();
			}
			break;
		}
		case "fan":
		{
			const fd = [3, 0, 1, 2][p.rot]!;
			const [dx, dy] = DIRV[fd]!;
			g.fillStyle = "#3d5a80";
			rr(g, X + 2, Y + 2, T - 4, T - 4, 8);
			g.fill();
			g.save();
			g.translate(X + T / 2, Y + T / 2);
			g.rotate(t * 15);
			g.fillStyle = "#e0fbfc";
			for (let k = 0; k < 3; k++)
			{
				g.rotate((Math.PI * 2) / 3);
				g.beginPath();
				g.ellipse(0, -8, 4, 8, 0, 0, 7);
				g.fill();
			}
			g.restore();
			g.strokeStyle = "rgba(255,255,255,.6)";
			g.lineWidth = 2;
			g.lineCap = "round";
			g.beginPath();
			for (let k = 0; k < 3; k++)
			{
				const ph = (t * 1.5 + k / 3) % 1;
				const d = T * 0.6 + ph * 3.6 * T;
				const off = (k - 1) * 9;
				const sx = X + T / 2 + dx * d - dy * off;
				const sy = Y + T / 2 + dy * d + dx * off;
				g.moveTo(sx, sy);
				g.lineTo(sx + dx * 14, sy + dy * 14);
			}
			g.stroke();
			break;
		}
		case "booster":
		{
			const d = p.rot ? -1 : 1;
			g.fillStyle = "#22223b";
			rr(g, X + 1, Y + T / 2, T - 2, T / 2, 6);
			g.fill();
			g.fillStyle = "#06d6a0";
			for (let k = 0; k < 2; k++)
			{
				const cx = X + T / 2 + (k - 0.5) * 12 * d;
				g.beginPath();
				g.moveTo(cx - 5 * d, Y + T / 2 + 4);
				g.lineTo(cx + 5 * d, Y + T * 0.75);
				g.lineTo(cx - 5 * d, Y + T - 4);
				g.fill();
			}
			dot = [X, Y + T / 2 - 6];
			break;
		}
		case "bridge":
			for (const [c, r] of pieceCells(p)) cell(g, c * T, r * T, "#c08552", "#e0a878", "#8c5a32");
			dot = [X, Y];
			break;
		case "cloud":
			g.fillStyle = "rgba(200,225,240,.9)";
			g.beginPath();
			g.ellipse(X + T * 1.5, Y + 16, T * 1.5, 10, 0, 0, 7);
			g.fill();
			g.fillStyle = "#fff";
			g.beginPath();
			g.ellipse(X + 22, Y + 12, 22, 12, 0, 0, 7);
			g.ellipse(X + 60, Y + 8, 26, 14, 0, 0, 7);
			g.ellipse(X + 98, Y + 12, 22, 12, 0, 0, 7);
			g.fill();
			break;
		case "vine":
		{
			g.strokeStyle = "#2d6a4f";
			g.lineWidth = 5;
			g.lineCap = "round";
			g.beginPath();
			for (let y = 0; y <= 4 * T; y += 8) g.lineTo(X + T / 2 + Math.sin(y / 14 + t) * 4, Y + y);
			g.stroke();
			g.fillStyle = "#52b788";
			for (let k = 0; k < 7; k++)
			{
				const yy = Y + 12 + k * 21;
				const sd = k % 2 ? 1 : -1;
				g.beginPath();
				g.ellipse(X + T / 2 + sd * 9, yy, 8, 4, sd * 0.5, 0, 7);
				g.fill();
			}
			break;
		}
		case "jelly":
		{
			const a = o.jelly?.anim ?? 0;
			const sq = Math.sin(a * 10) * a * 5;
			g.fillStyle = "rgba(6,214,160,.35)";
			rr(g, X + 1, Y + 4 + sq, 2 * T - 2, T - 4 - sq, 12);
			g.fill();
			g.fillStyle = "rgba(6,214,160,.85)";
			rr(g, X + 5, Y + 8 + sq, 2 * T - 10, T - 14 - sq, 9);
			g.fill();
			g.fillStyle = "rgba(255,255,255,.7)";
			g.beginPath();
			g.ellipse(X + 18, Y + 16 + sq, 7, 3, -0.4, 0, 7);
			g.fill();
			break;
		}
		case "popspikes":
		{
			const up = o.pop?.up ?? 1;
			g.fillStyle = "#4a4e69";
			rr(g, X + 1, Y + T - 9, 2 * T - 2, 9, 3);
			g.fill();
			const w = (2 * T - 2) / 6;
			const top = Y + T - 9 - (T - 14) * up;
			if (up > 0.05)
				for (let i = 0; i < 6; i++)
				{
					const x0 = X + 1 + i * w;
					g.fillStyle = "#e4e8ef";
					g.beginPath();
					g.moveTo(x0, Y + T - 9);
					g.lineTo(x0 + w / 2, top);
					g.lineTo(x0 + w, Y + T - 9);
					g.fill();
					g.fillStyle = "#e63946";
					g.beginPath();
					g.arc(x0 + w / 2, top + 2, 1.8, 0, 7);
					g.fill();
				}
			g.fillStyle = "#22223b";
			for (let i = 0; i < 6; i++) g.fillRect(X + 1 + i * w + w / 2 - 2, Y + T - 7, 4, 3);
			break;
		}
		case "axe":
		{
			const a = o.axe?.a ?? Math.sin(t * 2.4) * 1.15;
			const px = X + T / 2;
			const py = Y + T / 2;
			const ex = px + Math.sin(a) * 96;
			const ey = py + Math.cos(a) * 96;
			g.strokeStyle = "#6c584c";
			g.lineWidth = 5;
			g.beginPath();
			g.moveTo(px, py);
			g.lineTo(ex, ey);
			g.stroke();
			g.save();
			g.translate(ex, ey);
			g.rotate(-a);
			g.fillStyle = "#cfd6e0";
			g.beginPath();
			g.moveTo(-22, -8);
			g.quadraticCurveTo(0, 30, 22, -8);
			g.closePath();
			g.fill();
			g.fillStyle = "#e63946";
			g.fillRect(-6, -12, 12, 8);
			g.restore();
			g.fillStyle = "#4a4e69";
			g.beginPath();
			g.arc(px, py, 8, 0, 7);
			g.fill();
			break;
		}
		case "crusher":
		{
			const cy = o.crusher?.y ?? Y;
			g.save();
			g.strokeStyle = "rgba(255,255,255,.5)";
			g.lineWidth = 2;
			g.setLineDash([5, 6]);
			g.strokeRect(X + T / 2 - 6, Y + T, 12, 3 * T - 4);
			g.restore();
			g.fillStyle = "#4a4e69";
			rr(g, X + 2, cy + 2, T - 4, T - 10, 6);
			g.fill();
			g.fillStyle = "#e4e8ef";
			for (let i = 0; i < 4; i++)
			{
				const x0 = X + 3 + (i * (T - 6)) / 4;
				g.beginPath();
				g.moveTo(x0, cy + T - 8);
				g.lineTo(x0 + (T - 6) / 8, cy + T);
				g.lineTo(x0 + (T - 6) / 4, cy + T - 8);
				g.fill();
			}
			g.fillStyle = "#ffd166";
			g.fillRect(X + 10, cy + 12, 6, 4);
			g.fillRect(X + T - 16, cy + 12, 6, 4);
			dot = [X, cy];
			break;
		}
		case "blink":
		{
			const off = !!o.blink?.off;
			const warn = !!o.blink?.warn && Math.floor(t * 10) % 2;
			g.save();
			g.globalAlpha = off ? 0.22 : warn ? 0.5 : 1;
			for (const [c, r] of pieceCells(p)) cell(g, c * T, r * T, "#f15bb5", "#ff9ad5", "#b5338a");
			g.restore();
			if (off)
			{
				g.save();
				g.strokeStyle = "rgba(255,255,255,.6)";
				g.setLineDash([4, 4]);
				g.lineWidth = 2;
				for (const [c, r] of pieceCells(p)) g.strokeRect(c * T + 3, r * T + 3, T - 6, T - 6);
				g.restore();
			}
			break;
		}
		case "cannon":
		{
			const f = o.cannon?.flash ?? 0;
			g.fillStyle = "#22223b";
			rr(g, X + 2, Y + 2, T - 4, T - 4, 9);
			g.fill();
			g.save();
			g.translate(X + T / 2, Y + T / 2);
			g.rotate((p.rot * Math.PI) / 2);
			g.fillStyle = "#4a4e69";
			rr(g, 0, -7, T / 2 + 2 - f * 4, 14, 4);
			g.fill();
			g.fillStyle = "#ffd166";
			g.fillRect(T / 2 - 6 - f * 4, -7, 4, 14);
			g.fillStyle = "#363657";
			g.beginPath();
			g.arc(0, 0, 11, 0, 7);
			g.fill();
			g.restore();
			break;
		}
		case "bomb":
			drawBomb(g, X + 1.5 * T, Y + 1.65 * T, 1, t);
			break;
	}
	const owner = p.owner >= 0 ? game.players[p.owner] : undefined;
	if (owner)
	{
		g.fillStyle = owner.color;
		g.strokeStyle = "#fff";
		g.lineWidth = 2;
		g.beginPath();
		g.arc(dot[0] + 8, dot[1] + 8, 5, 0, 7);
		g.fill();
		g.stroke();
	}
}

/** The engineers' hard hat: the same yellow for everyone, so body color still tells players apart. */
function hardHat(g: CanvasRenderingContext2D, cx: number, by: number, s: number, face: number): void
{
	g.save();
	g.translate(cx, by);
	g.scale(face < 0 ? -1 : 1, 1);
	const w = s * 0.4;
	const h = s * 0.38;
	g.fillStyle = "#d99a00";
	g.beginPath();
	g.roundRect(-w - s * 0.06, -s * 0.1, w * 2 + s * 0.34, s * 0.13, [2, 6, 6, 2]);
	g.fill();
	g.fillStyle = "#ffc300";
	g.beginPath();
	g.ellipse(-s * 0.05, -s * 0.07, w, h, 0, Math.PI, 0);
	g.fill();
	g.strokeStyle = "#ffe27a";
	g.lineWidth = s * 0.09;
	g.beginPath();
	g.ellipse(-s * 0.05, -s * 0.07, w * 0.62, h * 0.82, 0, Math.PI * 1.12, Math.PI * 1.75);
	g.stroke();
	g.fillStyle = "rgba(255,255,255,.6)";
	g.beginPath();
	g.ellipse(w * 0.35, -s * 0.07 - h * 0.6, s * 0.06, s * 0.09, 0.6, 0, 7);
	g.fill();
	g.restore();
}

/** A player's square, s wide and h high (shorter when crouched), in its hard hat. */
function square(
	g: CanvasRenderingContext2D,
	x: number,
	y: number,
	s: number,
	c: string,
	al: number,
	face = 1,
	h = s,
): void
{
	g.save();
	g.globalAlpha = al;
	g.fillStyle = shade(c, -0.35);
	g.fillRect(x, y, s, h);
	g.fillStyle = c;
	g.fillRect(x + 2.5, y + 2.5, s - 5, h - 5);
	hardHat(g, x + s / 2, y + 1, s, face);
	g.restore();
}

/** Background clouds as [x, y, scale, drift speed]. */
const CLOUDS = [
	[100, 90, 1, 8],
	[520, 150, 0.7, 12],
	[900, 70, 1.2, 6],
	[1250, 190, 0.8, 10],
] as const;

function drawBg(t: number): void
{
	const gr = ctx.createLinearGradient(0, 0, 0, H);
	gr.addColorStop(0, "#33aef0");
	gr.addColorStop(1, "#c4f0ff");
	ctx.fillStyle = gr;
	ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = "#fff1a8";
	ctx.beginPath();
	ctx.arc(1080, 110, 52, 0, 7);
	ctx.fill();
	ctx.fillStyle = "rgba(255,255,255,.92)";
	for (const [cx, cy, s, sp] of CLOUDS)
	{
		const x = ((cx + t * sp) % (W + 320)) - 160;
		ctx.beginPath();
		ctx.ellipse(x, cy, 60 * s, 22 * s, 0, 0, 7);
		ctx.ellipse(x - 30 * s, cy + 4 * s, 34 * s, 18 * s, 0, 0, 7);
		ctx.ellipse(x + 22 * s, cy - 12 * s, 36 * s, 24 * s, 0, 0, 7);
		ctx.fill();
	}
	ctx.fillStyle = "#9fe6c9";
	ctx.beginPath();
	ctx.ellipse(260, 790, 520, 260, 0, 0, 7);
	ctx.ellipse(1040, 800, 560, 280, 0, 0, 7);
	ctx.fill();
	ctx.fillStyle = "#74d6ae";
	ctx.beginPath();
	ctx.ellipse(680, 860, 560, 270, 0, 0, 7);
	ctx.fill();
	if (!course.level.wrapY)
	{
		const ab = ctx.createLinearGradient(0, 620, 0, H);
		ab.addColorStop(0, "rgba(15,24,48,0)");
		ab.addColorStop(1, "rgba(15,24,48,.5)");
		ctx.fillStyle = ab;
		ctx.fillRect(0, 620, W, 100);
	}
}

/** Draws a level's ground, lava, wrap edges, gate, switch, start box and flag. */
function drawLevel(g: CanvasRenderingContext2D, lv: Level, t: number): void
{
	const world = sim.world;
	for (const [c, r, w, h] of lv.ground)
	{
		const x = c * T;
		const y = r * T;
		const ww = w * T;
		const hh = h * T;
		if (r === 0)
		{
			g.fillStyle = "#55607e";
			rr(g, x, -12, ww, hh + 12, 10);
			g.fill();
			g.fillStyle = "#6d7a9c";
			rr(g, x + 6, hh - 12, ww - 12, 5, 3);
			g.fill();
			continue;
		}
		const bot = r + h >= ROWS;
		g.fillStyle = "#8a5a36";
		rr(g, x, y, ww, hh + (bot ? 20 : 0), bot ? [12, 12, 0, 0] : 12);
		g.fill();
		if (hh > 60)
		{
			g.fillStyle = "#9d6a41";
			for (let k = 0; k < (w * h) / 2; k++)
			{
				g.beginPath();
				g.arc(x + 14 + ((k * 53) % (ww - 28)), y + 30 + ((k * 37) % (hh - 40)), 6, 0, 7);
				g.fill();
			}
		}
		const ice = lv.ice;
		g.fillStyle = ice ? "#9fe3f7" : "#38b26b";
		rr(g, x, y, ww, 16, [12, 12, 4, 4]);
		g.fill();
		g.fillStyle = ice ? "#e8fbff" : "#74e8a0";
		rr(g, x + 8, y + 3, ww - 16, 4, 2);
		g.fill();
	}
	for (const [c, r, w, h] of lv.lava ?? [])
	{
		const x = c * T;
		const y = r * T;
		g.fillStyle = "#e85d04";
		g.fillRect(x, y + 16, w * T, h * T);
		g.fillStyle = "#ffb703";
		g.beginPath();
		g.moveTo(x, y + h * T);
		for (let k = 0; k <= w * 2; k++) g.lineTo(x + (k * T) / 2, y + 14 + Math.sin(t * 3 + k) * 5);
		g.lineTo(x + w * T, y + h * T);
		g.fill();
	}
	if (lv.wrapX || lv.wrapY)
	{
		g.save();
		g.strokeStyle = "rgba(255,255,255,.8)";
		g.lineWidth = 5;
		g.setLineDash([12, 12]);
		g.lineDashOffset = -t * 30;
		g.beginPath();
		if (lv.wrapX)
		{
			g.moveTo(2, 0);
			g.lineTo(2, H);
			g.moveTo(W - 2, 0);
			g.lineTo(W - 2, H);
		}
		if (lv.wrapY)
		{
			g.moveTo(0, 2);
			g.lineTo(W, 2);
			g.moveTo(0, H - 2);
			g.lineTo(W, H - 2);
		}
		g.stroke();
		g.restore();
	}
	if (lv.gate)
	{
		const [c, r, w, h] = lv.gate;
		const x = c * T;
		const y = r * T;
		const ww = w * T;
		const hh = h * T;
		const op = lv === course.level && world.gate ? world.gate.open : 0;
		if (op < 1)
		{
			g.save();
			g.globalAlpha = 1 - op * 0.8;
			g.beginPath();
			g.rect(x, y, ww, hh);
			g.clip();
			const oy = -op * hh;
			g.fillStyle = "#3d405b";
			g.fillRect(x, y + oy, ww, hh);
			g.fillStyle = "#ffd166";
			for (let k = -2; k < h * 2 + 2; k++)
			{
				g.beginPath();
				g.moveTo(x, y + oy + (k * T) / 2);
				g.lineTo(x + ww, y + oy + (k * T) / 2 - ww / 2);
				g.lineTo(x + ww, y + oy + (k * T) / 2 - ww / 2 + 10);
				g.lineTo(x, y + oy + (k * T) / 2 + 10);
				g.fill();
			}
			g.restore();
		}
		else
		{
			g.save();
			g.strokeStyle = "rgba(255,209,102,.5)";
			g.lineWidth = 2;
			g.setLineDash([6, 6]);
			g.strokeRect(x + 1, y + 1, ww - 2, hh - 2);
			g.restore();
		}
	}
	if (lv.sw)
	{
		const on = lv === course.level && world.swOn;
		const x = lv.sw[0] * T;
		const y = lv.sw[1] * T;
		g.fillStyle = "#3d405b";
		rr(g, x + 4, y + T - 10, T - 8, 10, 3);
		g.fill();
		g.fillStyle = on ? "#06d6a0" : "#ef476f";
		rr(g, x + 10, y + (on ? T - 15 : T - 22), T - 20, on ? 6 : 13, 4);
		g.fill();
		g.strokeStyle = "#3d405b";
		g.lineWidth = 2;
		g.beginPath();
		g.moveTo(x + T / 2, y + T - 10);
		g.lineTo(x + T / 2, y + T - 34);
		g.stroke();
		g.fillStyle = on ? "#06d6a0" : "#ffd166";
		g.beginPath();
		g.arc(x + T / 2, y + T - 36, 4, 0, 7);
		g.fill();
	}
	const [sc, sr] = lv.start;
	g.save();
	g.strokeStyle = "rgba(255,255,255,.6)";
	g.lineWidth = 2;
	g.setLineDash([5, 4]);
	g.strokeRect(sc * T + T / 2 - 16, sr * T - 32, 32, 32);
	g.restore();
	const [fc, fr] = lv.flag;
	const fx0 = fc * T + T * 0.2 - 3;
	const top = Math.max(10, fr * T - 3.6 * T);
	g.fillStyle = "#f1faee";
	rr(g, fx0, top, 6, fr * T - top, 3);
	g.fill();
	const wv = Math.sin(t * 3.3) * 3;
	for (let i = 0; i < 3; i++)
		for (let j = 0; j < 2; j++)
		{
			g.fillStyle = (i + j) % 2 ? "#1b1b2f" : "#fff";
			g.fillRect(fx0 + 6 + i * 14, top + 4 + j * 14 + wv * (i / 3), 14, 14);
		}
	g.fillStyle = "#ffd166";
	g.beginPath();
	g.arc(fx0 + 3, top, 6, 0, 7);
	g.fill();
}

export function drawLevelThumb(cnv: HTMLCanvasElement, lv: Level): void
{
	const g = cnv.getContext("2d")!;
	const s = cnv.width / W;
	g.setTransform(s, 0, 0, s, 0, 0);
	const gr = g.createLinearGradient(0, 0, 0, H);
	gr.addColorStop(0, "#33aef0");
	gr.addColorStop(1, "#c4f0ff");
	g.fillStyle = gr;
	g.fillRect(0, 0, W, H);
	drawLevel(g, lv, 0);
}

function drawGrid(): void
{
	ctx.strokeStyle = "rgba(255,255,255,.2)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let c = 1; c < COLS; c++)
	{
		ctx.moveTo(c * T, 0);
		ctx.lineTo(c * T, H);
	}
	for (let r = 1; r < ROWS; r++)
	{
		ctx.moveTo(0, r * T);
		ctx.lineTo(W, r * T);
	}
	ctx.stroke();
	ctx.fillStyle = "rgba(255,255,255,.22)";
	for (const k of course.safe)
	{
		const [c, r] = k.split(",").map(Number);
		ctx.fillRect(c! * T, r! * T, T, T);
	}
}

function banner(a: string, b?: string): void
{
	ctx.font = "700 38px Fredoka,system-ui";
	ctx.textAlign = "center";
	const w = Math.max(ctx.measureText(a).width, b ? ctx.measureText(b).width * 0.5 : 0) + 60;
	ctx.fillStyle = "rgba(15,24,48,.82)";
	rr(ctx, W / 2 - w / 2, 64, w, b ? 104 : 66, 18);
	ctx.fill();
	ctx.fillStyle = "#fff";
	ctx.fillText(a, W / 2, 110);
	if (b)
	{
		ctx.font = "500 20px Fredoka,system-ui";
		ctx.fillStyle = "#ffd166";
		ctx.fillText(b, W / 2, 146);
	}
}

const OUT_BANNERS: Record<string, string> =
{
	fell: "Fell off!",
	burned: "Into the lava!",
	time: "Stood still too long!",
	gaveup: "Gave up!",
};

/** Draws one frame of the course. */
export function draw(): void
{
	const t = performance.now() / 1000;
	const LV = course.level;
	const G = game;
	const run = sim.run;
	ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
	drawBg(t);
	const placingNow = G.phase === "place";
	if (placingNow) drawGrid();
	drawLevel(ctx, LV, t);
	// Hazards, cannons and spike blocks go over the platforms they share cells with.
	for (const p of G.pieces) if (!onTop(p.type)) drawPiece(ctx, p, t);
	for (const p of G.pieces) if (onTop(p.type)) drawPiece(ctx, p, t);
	ctx.fillStyle = "#22223b";
	for (const b of sim.world.balls)
	{
		ctx.beginPath();
		ctx.arc(b.x, b.y, 9, 0, 7);
		ctx.fill();
	}
	if (G.phase === "run" || G.phase === "score")
	{
		let k = 0;
		G.results.forEach((r, i) =>
		{
			const c = G.players[i]!.color;
			if (r.finished)
			{
				square(
					ctx,
					Math.min(W - 26, Math.max(4, (LV.flag[0] - 1.7) * T)) + (k % 6) * 25,
					LV.flag[1] * T - 22 - Math.floor(k / 6) * 24,
					20,
					c,
					0.95,
				);
				k++;
			}
			else
			{
				ctx.lineCap = "round";
				for (const [lw, sc] of [
					[9, "#fff"],
					[5, c],
				] as const)
				{
					ctx.strokeStyle = sc;
					ctx.lineWidth = lw;
					ctx.beginPath();
					ctx.moveTo(r.x - 9, r.y - 9);
					ctx.lineTo(r.x + 9, r.y + 9);
					ctx.moveTo(r.x + 9, r.y - 9);
					ctx.lineTo(r.x - 9, r.y + 9);
					ctx.stroke();
				}
			}
		});
	}
	if (G.phase === "run" && run)
	{
		const p = run.p;
		const pl = G.players[run.pi]!;
		if (!(run.state === "done" && !run.res!.finished))
		{
			const bob = run.state === "ready" ? Math.sin(t * 5) * 2 : 0;
			const offs: [number, number][] = [[0, 0]];
			if (LV.wrapX) offs.push([W, 0], [-W, 0]);
			if (LV.wrapY) offs.push([0, H], [0, -H]);
			for (const [ox, oy] of offs) square(ctx, p.x + ox, p.y + oy + bob, p.w, pl.color, 1, p.face, p.h);
		}
		if (run.state === "go")
		{
			const m = Math.floor(run.t / 60);
			const sec = (run.t % 60).toFixed(1).padStart(4, "0");
			ctx.fillStyle = "rgba(15,24,48,.6)";
			rr(ctx, W / 2 - 70, 14, 140, 40, 12);
			ctx.fill();
			ctx.fillStyle = run.t > 60 ? "#ffd166" : "#fff";
			ctx.font = "700 24px Fredoka,system-ui";
			ctx.textAlign = "center";
			ctx.fillText(`${m}:${sec}`, W / 2, 42);
			if (run.t > 60 && run.idle > 0)
			{
				const left = Math.max(0, 5 - run.idle);
				ctx.fillStyle = "rgba(239,71,111,.9)";
				ctx.beginPath();
				ctx.arc(W / 2, 170, 78, 0, 7);
				ctx.fill();
				ctx.strokeStyle = "#fff";
				ctx.lineWidth = 8;
				ctx.beginPath();
				ctx.arc(W / 2, 170, 66, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * left) / 5);
				ctx.stroke();
				ctx.fillStyle = "#fff";
				ctx.font = "700 64px Fredoka,system-ui";
				ctx.fillText(String(Math.ceil(left)), W / 2, 192);
				ctx.font = "600 22px Fredoka,system-ui";
				ctx.fillStyle = "rgba(15,24,48,.85)";
				rr(ctx, W / 2 - 110, 262, 220, 36, 10);
				ctx.fill();
				ctx.fillStyle = "#fff";
				ctx.fillText("Keep moving!", W / 2, 288);
			}
		}
		if (run.state === "ready")
			banner(`${pl.name}'s run`, run.cpu ? "The CPU is planning its route" : "Press Space, Up or W to go");
		if (run.state === "done")
		{
			const r = run.res!;
			if (r.finished) banner("Made it!", `${r.time.toFixed(2)} seconds`);
			else
			{
				const ow = r.owner >= 0 ? G.players[r.owner] : null;
				const msg =
					OUT_BANNERS[r.cause] ??
					(r.owner === run.pi
						? "Caught by your own trap!"
						: `${r.cause[0]!.toUpperCase() + r.cause.slice(1)} by ${ow ? ow.name : "a trap"}!`);
				banner(msg);
			}
		}
	}
	const held = (): PieceType => G.picks[G.order[G.turn]!]!;
	const pend = placing.pend;
	const gh =
		placingNow && pend
			?
				{
					c: pend.c,
					r: pend.r,
					ok: valid(
						{
							type: held(),
							c: pend.c,
							r: pend.r,
							rot: G.rot,
							owner: -1,
						},
						placeAmong(held()),
					),
				}
			: placing.ghost;
	if (placingNow && G.portalA)
	{
		ctx.save();
		ctx.globalAlpha = 0.85;
		drawPortal(ctx, G.portalA.c * T, G.portalA.r * T, t, "entrance");
		ctx.restore();
	}
	if (placingNow && gh)
	{
		const pl = G.order[G.turn]!;
		const type = held();
		const gp: Piece =
		{
			type,
			c: gh.c,
			r: gh.r,
			rot: G.rot,
			owner: pl,
		};
		if (isBomb(type))
		{
			const area = new Set(pieceCells(gp).map(([a, b]) => a + "," + b));
			ctx.fillStyle = "rgba(239,71,111,.35)";
			for (const q of G.pieces)
				if (pieceCells(q).some(([a, b]) => area.has(a + "," + b)))
					for (const [a, b] of pieceCells(q)) ctx.fillRect(a * T, b * T, T, T);
		}
		ctx.save();
		ctx.globalAlpha = 0.7;
		drawPiece(ctx, gp, t);
		ctx.restore();
		ctx.strokeStyle = gh.ok ? (pend ? "#ffd166" : "#06d6a0") : "#ef476f";
		ctx.lineWidth = pend ? 4 + Math.sin(t * 8) * 1.5 : 3;
		for (const [a, b] of pieceCells(gp))
		{
			rr(ctx, a * T + 2, b * T + 2, T - 4, T - 4, 6);
			ctx.stroke();
		}
		if (pend)
		{
			const cs = pieceCells(gp);
			const mx = Math.min(...cs.map((a) => a[0]));
			const Mx = Math.max(...cs.map((a) => a[0]));
			const my = Math.min(...cs.map((a) => a[1]));
			const lx = ((mx + Mx + 1) / 2) * T;
			const ly = Math.max(26, my * T - 12);
			ctx.font = "700 16px Fredoka,system-ui";
			ctx.textAlign = "center";
			const tw = ctx.measureText("Confirm?").width + 20;
			ctx.fillStyle = "rgba(15,24,48,.85)";
			rr(ctx, lx - tw / 2, ly - 20, tw, 26, 8);
			ctx.fill();
			ctx.fillStyle = "#ffd166";
			ctx.fillText("Confirm?", lx, ly - 2);
		}
	}
	for (const f of sim.fx)
	{
		ctx.globalAlpha = Math.min(1, f.life * 2);
		ctx.fillStyle = f.color;
		ctx.beginPath();
		ctx.arc(f.x, f.y, f.r, 0, 7);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}

/** Draws one piece, centered and scaled to fit, for a card or the tray. */
export function drawThumb(cnv: HTMLCanvasElement, type: PieceType, rot: number): void
{
	const g = cnv.getContext("2d")!;
	g.setTransform(1, 0, 0, 1, 0, 0);
	g.clearRect(0, 0, cnv.width, cnv.height);
	const cs = DEFS[type].cells(rot);
	const bw = Math.max(...cs.map((a) => a[0])) + 1;
	const bh = Math.max(...cs.map((a) => a[1])) + 1;
	const s = Math.min(cnv.width / (bw * T), cnv.height / (bh * T), 2.4) * 0.8;
	g.setTransform(s, 0, 0, s, (cnv.width - bw * T * s) / 2, (cnv.height - bh * T * s) / 2);
	drawPiece(
		g,
		{
			type,
			c: 0,
			r: 0,
			rot,
			owner: -1,
		},
		performance.now() / 1000,
	);
}
