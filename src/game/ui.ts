import {placeAmong, setLevel, valid} from "./course.ts";
import {cpuChoosePick, cpuInitRun, cpuPlacement, cpuPlanFrame} from "./cpu.ts";
import {$, $canvas, buttonOf, canvases, esc} from "./dom.ts";
import {drawLevelThumb, drawThumb} from "./draw.ts";
import {burst} from "./effects.ts";
import {H, rand, T, W} from "./geometry.ts";
import {LEVELS} from "./levels.ts";
import {die, newRunner} from "./physics.ts";
import {DEFS, isBomb, KIND, pieceCells, rollPiece, SOLIDT, TYPES} from "./pieces.ts";
import {genCourse} from "./solver.ts";
import {sfx} from "./sound.ts";
import {course, game as G, placing, settings as S, sim} from "./state.ts";
import {loadBest, loadSettings, saveBest, saveSettings} from "./storage.ts";
import type {Pick, Piece, PieceType, Result} from "./types.ts";
import {buildWorld} from "./world.ts";

// The game's flow and its screens: player setup, the level vote, picking from the box, placing on the course, the
// runs, round results and the winner, plus solo practice and the CPU players' turns.

const ov = (): HTMLElement => $("ov");
const tray = (): HTMLElement => $("tray");

const hexRgb = (h: string): number[] =>
{
	const n = parseInt(h.slice(1), 16);
	return [n >> 16, (n >> 8) & 255, n & 255];
};
const rgbHex = (a: number[]): string => "#" + a.map((v) => v.toString(16).padStart(2, "0")).join("");
/** Another player whose color is too close to player i's to tell apart, or -1. */
function closeTo(i: number): number
{
	const a = hexRgb(S.colors[i]!);
	for (let j = 0; j < S.count; j++)
	{
		if (j === i) continue;
		const b = hexRgb(S.colors[j]!);
		if (Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) < 70) return j;
	}
	return -1;
}

const chipOf = (i: number): string =>
{
	const p = G.players[i]!;
	return `<span class="who"><i style="background:${p.color}"></i>${esc(p.name)}${p.cpu ? '<span class="cputag">CPU</span>' : ""}</span>`;
};
const held = (): PieceType => G.picks[G.order[G.turn]!]!;

let popKey = "";
let popT: ReturnType<typeof setTimeout> | undefined;
/** Pops up whose turn it is, once per turn, in games with more than one player. */
function turnPop(pi: number, verb: string, sub: string): void
{
	const k = G.phase + G.round + ":" + G.turn + ":" + pi;
	if (k === popKey || G.solo) return;
	popKey = k;
	const p = G.players[pi]!;
	const el = $("pop");
	el.innerHTML = `<i style="background:${p.color}"></i><div>It's ${esc(p.name)}'s turn${verb ? " to " + verb : ""}${sub ? `<small>${sub}</small>` : ""}</div>`;
	el.style.borderTop = `6px solid ${p.color}`;
	el.classList.add("show");
	clearTimeout(popT);
	popT = setTimeout(() =>
	{
		el.classList.remove("show");
	}, 1700);
}

function renderHUD(): void
{
	const cur =
		G.phase === "vote"
			? G.turn
			: G.phase === "pick" || G.phase === "place" || G.phase === "run"
				? G.order[G.turn]
				: -1;
	$("chips").innerHTML = G.players
		.map(
			(p, i) =>
				`<span class="chip${i === cur ? " on" : ""}"><i style="background:${p.color}"></i>${esc(p.name)}${G.solo ? "" : ` <b>${p.score}</b>`}</span>`,
		)
		.join("");
	const LV = course.level;
	$("round").textContent =
		G.solo && (G.phase === "place" || G.phase === "run")
			? `Practice · ${LV.name}`
			: G.round
				? `Round ${G.round} · ${LV.name} · first to ${G.target}${G.noFF ? " · no friendly fire" : ""}`
				: "";
	$("stage").classList.toggle("running", G.phase === "run");
}

function renderSetup(): void
{
	G.phase = "setup";
	const n = S.count;
	ov().innerHTML = `<div class="card"><h2>Build It!</h2><p class="lede">You are the engineers. Build the course together, one piece at a time, then race to the flag. Make it hard enough to stop your friends, but not so hard you can't make it yourself.</p>
  <div class="row"><span class="lbl">Players</span><div class="seg" id="cnt">${[1, 2, 3, 4, 5, 6, 7, 8].map((k) => `<button data-n="${k}" class="${k === n ? "on" : ""}">${k === 1 ? "Solo" : k}</button>`).join("")}</div></div>
  <p class="lede" style="margin:4px 0 0">Everyone plays as a square, so color is the only way to tell players apart. Slide R, G and B to make yours stand out.</p>
  <div class="names">${Array.from(
		{
			length: n,
		},
		(_, i) =>
		{
			const c = hexRgb(S.colors[i]!);
			return `<div class="nm"><div class="nmtop"><i id="sw${i}" style="background:${S.colors[i]}"></i><input data-i="${i}" maxlength="12" value="${esc(S.names[i] ?? "")}" aria-label="Player ${i + 1} name">${n > 1 ? `<button class="cpub${S.cpu[i] ? " on" : ""}" data-cpu="${i}" aria-pressed="${!!S.cpu[i]}">${S.cpu[i] ? "CPU" : "Human"}</button>` : ""}</div>
  <div class="rgb">${["R", "G", "B"].map((ch, j) => `<label><span>${ch}</span><input type="range" min="0" max="255" value="${c[j]}" data-c="${i}" data-ch="${j}" style="accent-color:${["#ef476f", "#06d6a0", "#3a86ff"][j]}" aria-label="Player ${i + 1} ${ch}"><output id="o${i}${j}">${c[j]}</output></label>`).join("")}</div><div class="warn" id="wn${i}"></div></div>`;
		},
  ).join("")}</div>
  ${n === 1 ? '<p class="lede" style="margin:10px 0 0"><b style="color:var(--acc)">Solo practice:</b> choose any level, build whatever you like from every piece, and replay it as many times as you want. Your best time on each level is saved.</p>' : ""}
  ${n > 1 && S.cpu.slice(0, n).some(Boolean) ? `<div class="row"><span class="lbl">CPU skill</span><div class="seg">${["Easy", "Normal", "Hard"].map((k, j) => `<button data-skill="${j}" class="${j === S.skill ? "on" : ""}">${k}</button>`).join("")}</div></div>` : ""}
  <div class="row" ${n === 1 ? "hidden" : ""}><span class="lbl">Friendly fire</span><div class="seg"><button data-ff="0" class="${S.noFF ? "" : "on"}">On</button><button data-ff="1" class="${S.noFF ? "on" : ""}">No friendly fire</button></div><small style="color:var(--mut);flex:1 1 220px">${S.noFF ? "Your own traps can't hurt you." : "Your own traps can knock you out too."}</small></div>
  <div class="row" ${n === 1 ? "hidden" : ""}><span class="lbl">Points to win</span><div class="seg" id="tgt">${[5, 8, 10, 15, 20, 25, 30].map((k) => `<button data-t="${k}" class="${k === S.target ? "on" : ""}">${k}</button>`).join("")}</div></div>
  <ul class="rules"><li>First, everyone <b>votes on a level</b>. Some levels wrap around the edges, have lava, low gravity or ice.</li><li>Each round, everyone <b>picks a piece</b> from the box, then <b>drags it onto the course</b>. Press R or right-click to rotate.</li>
  <li>Then everyone takes a turn running from Start to the flag. Move with arrows or A/D, jump with Space, Up or W, crouch with Down or S (squeeze under low beams, sink through fans, slide down vines, drop through clouds). There's no time limit, but after 1 minute, stop moving and a 5-second countdown starts. If it runs out, you're out.</li>
  <li><b>+3</b> for reaching the flag. <b>+1</b> each time your trap knocks someone out (only if somebody made it). With 3 or more players: <b>+2 more</b> if you are the only one to make it, and <b>+1</b> for the fastest finisher when two or more make it.</li>
  <li>If everyone makes it: <b>too easy, no points</b>.</li>
  <li>Every 3rd round, a <b>bomb</b> is in the box.</li>
  <li>If two or more players reach the winning score in the same round, the one with the <b>fastest run</b> that round wins.</li>
  <li>If nobody makes it, nobody scores. Keep building and try again next round.</li>
  <li>The course starts empty. You build it as you go.</li>
  <li>Can't decide? Grab the <b>Mystery</b> card for a completely random piece, but only one player per round can take it. <b>Portals</b> send you from one spot to another, toward the flag or far away from it.</li>
  <li>Short on players? Switch any player to <b>CPU</b> and the computer plays for them.</li></ul>
  <button class="pri big" id="startBtn">${n === 1 ? "Start practice" : "Start game"}</button></div>`;
	ov().classList.add("show");
	tray().innerHTML = '<div class="msg">Set up your players to begin.</div>';
	renderHUD();
	updateWarns();
}

function onOverlayClick(e: MouseEvent): void
{
	const b = buttonOf(e);
	if (!b) return;
	const d = b.dataset;
	if (cpuTurn() && (d["pick"] !== undefined || d["vote"] !== undefined || b.id === "okPick")) return;
	if (d["n"])
	{
		S.count = Number(d["n"]);
		renderSetup();
	}
	else if (d["cpu"] !== undefined)
	{
		S.cpu[Number(d["cpu"])] = !S.cpu[Number(d["cpu"])];
		renderSetup();
	}
	else if (d["skill"] !== undefined)
	{
		S.skill = Number(d["skill"]);
		renderSetup();
	}
	else if (d["ff"] !== undefined)
	{
		S.noFF = d["ff"] === "1";
		renderSetup();
	}
	else if (d["t"])
	{
		S.target = Number(d["t"]);
		renderSetup();
	}
	else if (b.id === "startBtn") startGame();
	else if (d["pick"] !== undefined)
	{
		if (!G.revealing) selectPick(d["pick"] === "m" ? "m" : Number(d["pick"]));
	}
	else if (b.id === "okPick" && G.sel != null && !G.revealing) pickPiece(G.sel);
	else if (b.id === "nextBtn") nextRound();
	else if (b.id === "againBtn")
	{
		G.players.forEach((p) => (p.score = 0));
		G.round = 0;
		startVote();
	}
	else if (d["vote"] !== undefined) castVote(Number(d["vote"]));
	else if (b.id === "lvStart")
	{
		setLevel(LEVELS[G.chosen]!);
		G.pieces = [];
		G.round = 0;
		G.drought = 0;
		buildWorld();
		nextRound();
	}
	else if (b.id === "newBtn")
	{
		G.pieces = [];
		buildWorld();
		G.round = 0;
		G.players = [];
		renderSetup();
	}
}

function onOverlayInput(e: Event): void
{
	const t = e.target;
	if (!(t instanceof HTMLInputElement)) return;
	const d = t.dataset;
	if (d["i"] !== undefined) S.names[Number(d["i"])] = t.value;
	if (d["c"] !== undefined)
	{
		const i = Number(d["c"]);
		const c = hexRgb(S.colors[i]!);
		c[Number(d["ch"])] = Number(t.value);
		S.colors[i] = rgbHex(c);
		$("sw" + i).style.background = S.colors[i];
		$("o" + i + d["ch"]).textContent = t.value;
		updateWarns();
	}
}

function updateWarns(): void
{
	for (let i = 0; i < S.count; i++)
	{
		const el = document.getElementById("wn" + i);
		if (!el) continue;
		const j = closeTo(i);
		el.textContent =
			j >= 0
				? `Looks a lot like ${(S.names[j] === undefined || S.names[j] === "" ? "Player " + (j + 1) : S.names[j]).trim()}`
				: "";
	}
}

function startPractice(): void
{
	setLevel(LEVELS[G.chosen]!);
	G.pieces = [];
	G.hist = [];
	G.order = [0];
	G.turn = 0;
	G.picks =
	{
		0: G.picks[0] ?? "plank",
	};
	G.rot = 0;
	G.round = 0;
	G.results = [];
	G.lastMsg = "";
	G.phase = "place";
	buildWorld();
	ov().classList.remove("show");
	sfx("pick");
	renderTray();
}

/** Starts a solo practice run on the course as built. */
export function practicePlay(): void
{
	if (!G.solo || G.phase !== "place") return;
	placing.ghost = null;
	G.phase = "run";
	G.results = [];
	G.turn = 0;
	readyRun();
	beginRun();
}

function surprise(): void
{
	const pcs = genCourse();
	if (!pcs)
	{
		G.lastMsg = "Could not build a course that time. Try again!";
		return;
	}
	G.hist.push(G.pieces.slice());
	for (const q of pcs) q.t0 = sim.clock - Math.random() * 3;
	G.pieces = pcs;
	buildWorld();
	G.lastMsg = "Surprise course ready. It can be beaten!";
	sfx("place");
}

const isCPU = (i: number): boolean => !!G.players[i]?.cpu;
/** Whether the computer is the one voting, picking or placing now. */
export function cpuTurn(): boolean
{
	if (G.solo) return false;
	if (G.phase === "vote") return isCPU(G.turn);
	if (G.phase === "pick" || G.phase === "place") return isCPU(G.order[G.turn]!);
	return false;
}

let cpuKey = "";
let cpuT = 0;
let cpuStage = 0;
/** Plays the CPU players' turns, a step at a time with pauses so people can follow along. */
export function cpuTick(now: number): void
{
	if (G.solo) return;
	const run = sim.run;
	if (G.phase === "run" && run?.cpu)
	{
		cpuPlanFrame(now);
		if (run.state === "ready" && run.cpu.ready && now > run.cpu.t0 + 600) beginRun(true);
		return;
	}
	if (G.phase === "voted" && G.players.every((p) => p.cpu))
	{
		if (cpuKey !== "voted")
		{
			cpuKey = "voted";
			cpuT = now + 1500;
		}
		else if (now > cpuT)
		{
			cpuKey = "";
			document.getElementById("lvStart")?.click();
		}
		return;
	}
	if (G.phase === "score" && G.players.every((p) => p.cpu))
	{
		if (cpuKey !== "score" + G.round)
		{
			cpuKey = "score" + G.round;
			cpuT = now + 2500;
		}
		else if (now > cpuT) (document.getElementById("nextBtn") ?? document.getElementById("winBtn"))?.click();
		return;
	}
	if (!cpuTurn() || G.revealing)
	{
		cpuKey = "";
		return;
	}
	const k = G.phase + G.round + ":" + G.turn;
	if (k !== cpuKey)
	{
		cpuKey = k;
		cpuStage = 0;
		cpuT = now + 800;
	}
	if (now < cpuT) return;
	if (G.phase === "vote")
	{
		castVote(rand(LEVELS.length));
		return;
	}
	if (G.phase === "pick")
	{
		if (cpuStage === 0)
		{
			selectPick(cpuChoosePick());
			cpuStage = 1;
			cpuT = now + 700;
		}
		else if (G.sel != null) pickPiece(G.sel);
		return;
	}
	if (G.phase === "place")
	{
		// A pause between a portal's entrance and its exit.
		if (cpuStage === 2)
		{
			cpuStage = 0;
			cpuT = now + 500;
			return;
		}
		if (cpuStage === 0)
		{
			const q = cpuPlacement(held());
			if (!q)
			{
				advancePlace();
				return;
			}
			G.rot = q.rot;
			placing.pend =
			{
				c: q.c,
				r: q.r,
			};
			sfx("pick");
			renderTray();
			cpuStage = 1;
			cpuT = now + 900;
		}
		else
		{
			confirmPlace();
			// A portal entrance still waiting means the same turn goes on, to place its exit.
			if (G.portalA) cpuStage = 2;
		}
	}
}

function startVote(): void
{
	popKey = "";
	G.phase = "vote";
	G.votes = [];
	G.turn = 0;
	renderVote();
}

function renderVote(): void
{
	const pi = G.turn;
	turnPop(pi, "vote", "Pick the level you want to play");
	ov().innerHTML = `<div class="card">${G.solo ? `<h2>Pick a level to practice</h2><p class="lede">You can switch levels any time from the practice tray.</p>` : `<h2>${chipOf(pi)} votes for a level</h2><p class="lede">Everyone gets one vote. The level with the most votes wins, and ties are broken at random.</p>`}
  <div class="box lv">${LEVELS.map((l, i) => `<button class="pc" data-vote="${i}"><canvas width="320" height="180" data-l="${i}"></canvas><b>${l.name}</b><small>${l.desc}</small>${G.solo && G.best[l.name] ? `<span class="tag t-help">Best ${G.best[l.name]!.toFixed(2)}s</span>` : ""}<span class="vt">${G.votes.map((v, j) => (v === i ? `<i style="background:${G.players[j]!.color}" title="${esc(G.players[j]!.name)}"></i>` : "")).join("")}</span></button>`).join("")}</div></div>`;
	ov().classList.add("show");
	for (const c of canvases(ov(), "canvas[data-l]")) drawLevelThumb(c, LEVELS[Number(c.dataset["l"])]!);
	tray().innerHTML = `<div class="msg">${chipOf(pi)} is voting on the level.</div>`;
	renderHUD();
}

function castVote(i: number): void
{
	if (G.solo)
	{
		G.chosen = i;
		startPractice();
		return;
	}
	G.votes[G.turn] = i;
	sfx("pick");
	G.turn++;
	if (G.turn < G.players.length)
	{
		renderVote();
		return;
	}
	const cnt = LEVELS.map((_, k) => G.votes.filter((v) => v === k).length);
	const mx = Math.max(...cnt);
	const tied = cnt.map((_, k) => k).filter((k) => cnt[k] === mx);
	G.chosen = tied[rand(tied.length)]!;
	const chosen = LEVELS[G.chosen]!;
	ov().innerHTML = `<div class="card"><h2>Level: ${chosen.name}</h2><p class="lede">${chosen.desc}${tied.length > 1 ? " (Picked at random from a tie.)" : ""}</p>
  <canvas id="lvBig" width="760" height="428" style="width:100%;border-radius:14px"></canvas>
  <div class="picked">${LEVELS.map((l, k) => (cnt[k] ? `${l.name}: ${cnt[k]} vote${cnt[k] > 1 ? "s" : ""}` : ""))
		.filter(Boolean)
		.join(" · ")}</div>
  <div class="row" style="margin-top:16px"><button class="pri big" id="lvStart">Start building</button></div></div>`;
	drawLevelThumb($canvas("lvBig"), chosen);
	sfx("win");
	G.phase = "voted";
	renderHUD();
}

function startGame(): void
{
	saveSettings(localStorage, S);
	G.players = Array.from(
		{
			length: S.count,
		},
		(_, i) => (
		{
			name: (S.names[i] ?? "").trim() || `Player ${i + 1}`,
			color: S.colors[i]!,
			score: 0,
			cpu: S.count > 1 && !!S.cpu[i],
		}),
	);
	G.skill = S.skill;
	G.noFF = S.count > 1 && S.noFF;
	G.target = S.target;
	G.round = 0;
	G.solo = S.count === 1;
	sfx("pick");
	startVote();
}

/** The pieces in the box for a round: a hazard, a bomb every third round, a block after a round nobody finished. */
function fillBox(n: number, round: number, drought: number): PieceType[]
{
	const hz: PieceType[] = ["spikes", "saw", "cannon", "firebar", "laser", "sawtrack"];
	const box: PieceType[] = [hz[rand(hz.length)]!];
	if (round % 3 === 0) box.push("bomb");
	while (box.length < n + 1) box.push(rollPiece());
	if (drought >= 1 && !box.some((t) => SOLIDT.has(t)))
	{
		const i = box.findIndex((t, k) => k > 0 && t !== "bomb");
		box[i > 0 ? i : box.length] = (["plank", "bridge", "big"] as const)[rand(3)]!;
	}
	for (let i = box.length - 1; i > 0; i--)
	{
		const j = rand(i + 1);
		[box[i], box[j]] = [box[j]!, box[i]!];
	}
	return box;
}

function nextRound(): void
{
	const n = G.players.length;
	G.round++;
	G.order = Array.from(
		{
			length: n,
		},
		(_, i) => (G.round - 1 + i) % n,
	);
	G.turn = 0;
	G.picks = {};
	G.results = [];
	G.box = fillBox(n, G.round, G.drought);
	G.mystTaken = false;
	G.phase = "pick";
	buildWorld();
	renderPick();
}

function renderPick(): void
{
	const pi = G.order[G.turn]!;
	turnPop(pi, "pick", "Choose a piece from the box");
	const sel = G.sel;
	ov().innerHTML = `<div class="card"><h2>${chipOf(pi)} picks a piece</h2><p class="lede">Round ${G.round}. One piece each. Whatever is left over goes back in the box.${G.box.includes("bomb") ? " This round has a bomb!" : ""}</p>
  <div class="box">${G.box
		.map((t, i) =>
		{
			const d = DEFS[t];
			return `<button class="pc${sel === i ? " sel" : ""}" data-pick="${i}" aria-pressed="${sel === i}"><canvas width="280" height="168" data-t="${t}"></canvas><b>${d.name}</b><small>${d.tip}</small><span class="tag t-${d.kind}">${KIND[d.kind]}</span></button>`;
		})
		.join(
			"",
		)}${G.mystTaken ? "" : `<button class="pc myst${sel === "m" ? " sel" : ""}" data-pick="m" aria-pressed="${sel === "m"}"><span class="qm">?</span><b>Mystery</b><small>Only one per round! Get a completely random piece, revealed after you confirm.</small><span class="tag t-clear">Random</span></button>`}</div>
  <div class="row" style="margin-top:14px"><button class="pri big" id="okPick" ${sel == null ? "disabled" : ""}>${sel == null ? "Tap a piece to choose it" : sel === "m" ? "Confirm: take a Mystery piece" : "Confirm: take the " + DEFS[G.box[sel]!].name}</button></div>
  ${
		Object.keys(G.picks).length
			? `<div class="picked">Already picked: ${G.order
					.slice(0, G.turn)
					.map((i) => `${chipOf(i)} ${DEFS[G.picks[i]!].name}`)
					.join(" · ")}</div>`
			: ""
  }</div>`;
	ov().classList.add("show");
	for (const c of canvases(ov(), "canvas[data-t]")) drawThumb(c, pieceTypeOf(c), 0);
	tray().innerHTML = `<div class="msg">${chipOf(pi)} is choosing from the box.</div>`;
	renderHUD();
}

const pieceTypeOf = (c: HTMLCanvasElement): PieceType => TYPES.find((t) => t === c.dataset["t"])!;

function selectPick(i: Pick): void
{
	G.sel = i;
	sfx("place");
	renderPick();
}

function pickPiece(i: Pick): void
{
	G.sel = null;
	const pi = G.order[G.turn]!;
	if (i === "m")
	{
		if (G.mystTaken) return;
		const t = TYPES[rand(TYPES.length)]!;
		const d = DEFS[t];
		G.picks[pi] = t;
		G.mystTaken = true;
		G.revealing = true;
		sfx("win");
		clearTimeout(popT);
		$("pop").classList.remove("show");
		ov().innerHTML = `<div class="card reveal"><h2>Mystery piece!</h2><p class="lede">${chipOf(pi)} got...</p><canvas width="420" height="240" id="mysCv"></canvas><h2 style="color:var(--acc)">${d.name}</h2><p class="lede">${d.tip}</p></div>`;
		drawThumb($canvas("mysCv"), t, 0);
		setTimeout(() =>
		{
			G.revealing = false;
			nextPicker();
		}, 1700);
		return;
	}
	G.picks[pi] = G.box[i]!;
	G.box.splice(i, 1);
	sfx("pick");
	nextPicker();
}

/** On to the next player's pick, or to placing once everyone has a piece. */
function nextPicker(): void
{
	G.turn++;
	if (G.turn >= G.players.length)
	{
		ov().classList.remove("show");
		G.phase = "place";
		G.turn = 0;
		G.rot = 0;
		renderTray();
	}
	else renderPick();
}

/** Redraws the tray under the course for the phase: the piece to place, the run's controls, or a message. */
export function renderTray(): void
{
	const run = sim.run;
	if (G.phase === "place" && G.solo)
	{
		const t = G.picks[0]!;
		const d = DEFS[t];
		const best = G.best[course.level.name];
		tray().innerHTML = `<div class="pal">${TYPES.map((k) => `<button class="${k === t ? "on" : ""}" data-sel="${k}" title="${DEFS[k].name}" aria-label="${DEFS[k].name}"><canvas width="112" height="64" data-t="${k}"></canvas></button>`).join("")}</div>
    <canvas id="hold" width="240" height="128" title="Drag onto the course"></canvas><div class="msg">${G.lastMsg ? `<b>${esc(G.lastMsg)}</b> ` : ""}Holding <b>${d.name}</b>: ${t === "portal" && G.portalA ? "now place the exit" : d.tip}.<small>Drag or click to place as many as you like. ${d.rots > 1 ? "R to rotate. " : ""}P or Enter to play, Esc to stop a run.${best ? ` Best on ${course.level.name}: ${best.toFixed(2)}s.` : ""}</small></div>
    <div class="btns">${d.rots > 1 ? '<button id="rotBtn">Rotate</button>' : ""}<button class="pri" id="playBtn">Play</button><button id="undoBtn" ${G.hist.length ? "" : "disabled"}>Undo</button><button id="randBtn">Surprise me</button><button id="clearBtn">Clear</button><button id="lvlBtn">Change level</button><button id="menuBtn">Menu</button></div>`;
		for (const c of canvases(tray(), "canvas[data-t]")) drawThumb(c, pieceTypeOf(c), 0);
		drawThumb($canvas("hold"), t, G.rot);
		bindHold();
		renderHUD();
		return;
	}
	if (G.phase === "place")
	{
		const pi = G.order[G.turn]!;
		const d = DEFS[held()];
		turnPop(pi, "place", isCPU(pi) ? "The CPU is choosing a spot" : "Drag your " + d.name + " onto the course");
		if (isCPU(pi) && !placing.pend)
		{
			tray().innerHTML = `<div class="msg">${chipOf(pi)} is deciding where to put the <b>${d.name}</b>.</div>`;
			renderHUD();
			return;
		}
		const what = held() === "portal" ? (G.portalA ? "portal exit" : "portal entrance") : d.name;
		if (placing.pend)
		{
			tray().innerHTML = `<div class="msg">${chipOf(pi)}, place your <b>${what}</b> here?<small>Enter to confirm, Esc to move it. You can also click another spot${d.rots > 1 ? " or rotate it" : ""}.</small></div>${d.rots > 1 ? '<button id="rotBtn">Rotate</button>' : ""}<button id="movePlace">Move it</button><button class="pri" id="okPlace">Confirm</button>`;
			renderHUD();
			return;
		}
		tray().innerHTML = `<canvas id="hold" width="240" height="128" title="Drag onto the course"></canvas><div class="msg">${chipOf(pi)}, ${held() === "portal" ? (G.portalA ? "now place the <b>portal exit</b>." : "place the <b>portal entrance</b> first, then its exit.") : `drag your <b>${d.name}</b> onto the course.`}<small>Or hover the course and click. ${d.rots > 1 ? "R, right-click or scroll to rotate." : ""} Green outline means it fits. You'll confirm before it's placed.</small></div>${d.rots > 1 ? '<button id="rotBtn">Rotate</button>' : ""}<button id="skipBtn">${placing.discardArm ? "Tap again to discard" : "Discard piece"}</button>`;
		drawThumb($canvas("hold"), held(), G.rot);
		bindHold();
	}
	else if (G.phase === "run" && run)
	{
		tray().innerHTML = `<div class="msg">${chipOf(run.pi)}'s turn to run <small>Arrows or A/D to move · Space, Up or W to jump · Down or S to crouch · stuck? press Give up (or G) · no time limit, but after 1 minute you get 5 seconds to start moving again or you're out</small></div><button id="giveBtn" ${run.state === "go" ? "" : "disabled"}>Give up</button><button class="pri" id="goBtn" ${run.state === "ready" && !run.cpu ? "" : "disabled"}>Go!</button>`;
	}
	renderHUD();
}

function onTrayClick(e: MouseEvent): void
{
	const b = buttonOf(e);
	if (!b) return;
	const run = sim.run;
	const sel = TYPES.find((t) => t === b.dataset["sel"]);
	if (b.id === "rotBtn") rotate();
	else if (b.id === "skipBtn")
	{
		if (placing.discardArm) advancePlace();
		else
		{
			placing.discardArm = true;
			renderTray();
		}
	}
	else if (b.id === "okPlace") confirmPlace();
	else if (b.id === "movePlace")
	{
		placing.pend = null;
		renderTray();
	}
	else if (b.id === "goBtn") beginRun();
	else if (b.id === "giveBtn" && run?.state === "go") die(-1, "gaveup");
	else if (sel)
	{
		G.picks[0] = sel;
		G.rot = 0;
		G.portalA = null;
		renderTray();
	}
	else if (b.id === "playBtn") practicePlay();
	else if (b.id === "undoBtn" && G.hist.length)
	{
		G.pieces = G.hist.pop()!;
		buildWorld();
		renderTray();
	}
	else if (b.id === "randBtn")
	{
		surprise();
		renderTray();
	}
	else if (b.id === "clearBtn" && G.pieces.length)
	{
		G.hist.push(G.pieces.slice());
		G.pieces = [];
		buildWorld();
		renderTray();
	}
	else if (b.id === "lvlBtn") startVote();
	else if (b.id === "menuBtn")
	{
		G.solo = false;
		G.pieces = [];
		buildWorld();
		renderSetup();
	}
}

/** Turns the held piece to its next rotation. */
export function rotate(): void
{
	if (G.phase !== "place") return;
	const d = DEFS[held()];
	if (d.rots < 2) return;
	G.rot = (G.rot + 1) % d.rots;
	const h = document.getElementById("hold");
	if (h instanceof HTMLCanvasElement) drawThumb(h, held(), G.rot);
	if (placing.ghost) setGhost(placing.ghost.c, placing.ghost.r);
}

function setGhost(c: number, r: number): void
{
	placing.ghost =
	{
		c,
		r,
		ok: valid(
			{
				type: held(),
				c,
				r,
				rot: G.rot,
				owner: -1,
			},
			placeAmong(held()),
		),
	};
}

/** Puts the ghost of the held piece under the pointer, lifted above a finger by `lift` pixels. */
export function ghostFrom(e: PointerEvent, lift: number): void
{
	const rc = $("cv").getBoundingClientRect();
	const wx = ((e.clientX - rc.left) / rc.width) * W;
	const wy = ((e.clientY - rc.top) / rc.height) * H - lift;
	if (wx < 0 || wx > W || wy < -T || wy > H)
	{
		placing.ghost = null;
		return;
	}
	const cs = DEFS[held()].cells(G.rot);
	const bw = Math.max(...cs.map((a) => a[0])) + 1;
	const bh = Math.max(...cs.map((a) => a[1])) + 1;
	setGhost(Math.round(wx / T - bw / 2), Math.round(wy / T - bh / 2));
}

/** Drops the held piece at the ghost: straight onto the course in practice, or to confirm in a game. */
export function placeGhost(): void
{
	const ghost = placing.ghost;
	if (!ghost) return;
	if (!ghost.ok)
	{
		sfx("bad");
		return;
	}
	if (!G.solo)
	{
		placing.pend =
		{
			c: ghost.c,
			r: ghost.r,
		};
		placing.ghost = null;
		sfx("pick");
		renderTray();
		return;
	}
	doPlace();
}

export function confirmPlace(): void
{
	const pend = placing.pend;
	if (!pend) return;
	placing.ghost =
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
	};
	if (!placing.ghost.ok)
	{
		sfx("bad");
		placing.ghost = null;
		return;
	}
	placing.pend = null;
	doPlace();
}

function doPlace(): void
{
	const ghost = placing.ghost!;
	const pi = G.order[G.turn]!;
	const p: Piece =
	{
		type: held(),
		c: ghost.c,
		r: ghost.r,
		rot: G.rot,
		owner: G.solo ? -1 : pi,
	};
	// A portal goes down in two steps: its entrance waits in portalA until its exit is placed.
	if (p.type === "portal")
	{
		const a = G.portalA;
		if (!a)
		{
			G.portalA =
			{
				c: p.c,
				r: p.r,
			};
			placing.ghost = null;
			sfx("gate");
			renderTray();
			return;
		}
		p.b =
		{
			c: p.c,
			r: p.r,
		};
		p.c = a.c;
		p.r = a.r;
		G.portalA = null;
	}
	if (G.solo) G.hist.push(G.pieces.slice());
	if (isBomb(p.type))
	{
		const area = new Set(pieceCells(p).map(([a, b]) => a + "," + b));
		G.pieces = G.pieces.filter((q) => !pieceCells(q).some(([a, b]) => area.has(a + "," + b)));
		const h = DEFS[p.type].cells(0).length === 25 ? 2.5 : 1.5;
		burst(p.c * T + h * T, p.r * T + h * T, "#ffd166", h > 2 ? 60 : 30);
		burst(p.c * T + h * T, p.r * T + h * T, "#ef476f", h > 2 ? 40 : 20);
		sfx("boom");
	}
	else
	{
		p.t0 = sim.clock;
		G.pieces.push(p);
		burst(p.c * T + T / 2, p.r * T + T / 2, "#ffffff", 10);
		sfx("place");
	}
	buildWorld();
	if (G.solo)
	{
		placing.ghost = null;
		renderTray();
		return;
	}
	advancePlace();
}

function advancePlace(): void
{
	placing.ghost = null;
	placing.pend = null;
	placing.discardArm = false;
	G.portalA = null;
	G.turn++;
	G.rot = 0;
	if (G.turn >= G.players.length)
	{
		G.phase = "run";
		G.turn = 0;
		readyRun();
	}
	else renderTray();
}

/** Lets the piece in the tray be dragged onto the course. */
function bindHold(): void
{
	const h = $("hold");
	let drag = false;
	h.addEventListener("pointerdown", (e) =>
	{
		drag = true;
		h.setPointerCapture(e.pointerId);
		h.style.opacity = "0.4";
		e.preventDefault();
	});
	h.addEventListener("pointermove", (e) =>
	{
		if (drag) ghostFrom(e, e.pointerType === "touch" ? 60 : 0);
	});
	h.addEventListener("pointerup", () =>
	{
		if (!drag) return;
		drag = false;
		h.style.opacity = "1";
		if (placing.ghost) placeGhost();
	});
	h.addEventListener("pointercancel", () =>
	{
		drag = false;
		h.style.opacity = "1";
		placing.ghost = null;
	});
}

function readyRun(): void
{
	buildWorld();
	const pi = G.order[G.turn]!;
	sim.run =
	{
		pi,
		p: newRunner(),
		state: "ready",
		t: 0,
		idle: 0,
		doneT: 0,
	};
	if (isCPU(pi)) cpuInitRun();
	turnPop(pi, "run", isCPU(pi) ? "The CPU is planning its route" : "Press Space, Up or W when ready");
	sim.keys =
	{
		l: 0,
		r: 0,
		j: 0,
		d: 0,
	};
	renderTray();
}

/** Starts the run waiting at the start. A CPU's run starts only when its plan is ready (force). */
export function beginRun(force = false): void
{
	const run = sim.run;
	if (run?.state !== "ready") return;
	if (run.cpu && !force) return;
	buildWorld();
	run.state = "go";
	run.t = 0;
	run.p = newRunner();
	renderTray();
}

const OUT_MESSAGES: Record<string, string> =
{
	fell: "You fell off.",
	time: "You stood still too long.",
	gaveup: "You gave up.",
	burned: "Into the lava.",
};

/** After a run ends: back to building in practice, else the next player's run or the round's results. */
export function nextRunner(): void
{
	const run = sim.run!;
	const r = run.res!;
	if (G.solo)
	{
		const name = course.level.name;
		if (r.finished)
		{
			const b = G.best[name];
			const nb = !b || r.time < b;
			if (nb)
			{
				G.best[name] = r.time;
				saveBest(localStorage, G.best);
			}
			G.lastMsg = `Made it in ${r.time.toFixed(2)}s.${nb ? " New best!" : ""}`;
		}
		else G.lastMsg = (OUT_MESSAGES[r.cause] ?? `You got ${r.cause}.`) + " Try again!";
		G.results = [r];
		sim.run = null;
		G.phase = "place";
		renderTray();
		return;
	}
	G.results[run.pi] = r;
	G.turn++;
	if (G.turn < G.players.length) readyRun();
	else
	{
		sim.run = null;
		showScore();
	}
}

/** Each player's points from a round: finish, solo bonus, traps and fastest. */
interface Gain
{
	f: number;
	s: number;
	t: number;
	q: number;
}

/** Scores a round from each player's run. */
function scoreRound(R: Result[]):
{
	gain: Gain[];
	fin: number;
	fast: number[];
}
{
	const n = R.length;
	const fin = R.filter((r) => r.finished).length;
	const gain = R.map(() => (
	{
		f: 0,
		s: 0,
		t: 0,
		q: 0,
	}));
	let fast: number[] = [];
	if (fin === n || fin === 0)
		return {
			gain,
			fin,
			fast,
		};
	R.forEach((r, i) =>
	{
		if (r.finished)
		{
			gain[i]!.f = 3;
			if (fin === 1 && n > 2) gain[i]!.s = 2;
		}
		else if (r.owner >= 0 && r.owner !== i) gain[r.owner]!.t++;
	});
	if (n > 2 && fin >= 2)
	{
		const best = Math.min(...R.map((r) => (r.finished ? r.time : Infinity)));
		fast = R.map((_, i) => i).filter((i) =>
		{
			const r = R[i]!;
			return r.finished && r.time - best < 0.005;
		});
		fast.forEach((i) => (gain[i]!.q = 1));
	}
	return {
		gain,
		fin,
		fast,
	};
}

/** A score as a percentage of a full bar, which is the points to win. */
const pct = (v: number): number => Math.min(100, (v / G.target) * 100);
const timeOf = (r: Result | undefined): number => (r?.finished ? r.time : Infinity);

function showScore(): void
{
	G.phase = "score";
	const n = G.players.length;
	const R = G.results;
	const {gain, fin, fast} = scoreRound(R);
	let note: string;
	if (fin === n) note = "Too easy, no points!";
	else if (fin === 0) note = "Nobody made it! No points this round. Keep building.";
	else
		note =
			fin === 1
				? `${esc(G.players[R.findIndex((r) => r.finished)]!.name)} was the only one to make it.${n > 2 ? " Solo bonus!" : ""}`
				: `${fin} of ${n} made it to the flag.${fast.length ? ` Fastest: ${fast.map((i) => esc(G.players[i]!.name)).join(" & ")} in ${timeOf(R[fast[0]!]).toFixed(2)}s, +1.` : ""}`;
	G.drought = fin === 0 ? G.drought + 1 : 0;
	G.lastFin = fin / n;
	ov().innerHTML = `<div class="card"><h2>Round ${G.round} results</h2><p class="note">${note}</p>
  <div class="bars">${G.players
		.map((p, i) =>
		{
			const g = gain[i]!;
			const tot = p.score + g.f + g.s + g.t + g.q;
			const r = R[i]!;
			return `<div class="br"><span>${chipOf(i)}<small class="tm">${r.finished ? r.time.toFixed(2) + "s" : "out"}</small></span><div class="track"><span style="background:${p.color}" data-w="${pct(p.score)}"></span><span style="background:#fff" data-w="${pct(g.f)}">${g.f ? "+3" : ""}</span><span style="background:#ffd166" data-w="${pct(g.s)}">${g.s ? "+2" : ""}</span><span style="background:#06d6a0" data-w="${pct(g.q)}">${g.q ? "+1" : ""}</span><span style="background:#ef476f;color:#fff" data-w="${pct(g.t)}">${g.t ? "+" + g.t : ""}</span></div><span class="pts">${tot}</span></div>`;
		})
		.join("")}</div>
  <div class="legend"><span><i style="background:#fff"></i>Finish</span>${n > 2 ? '<span><i style="background:#ffd166"></i>Solo bonus</span><span><i style="background:#06d6a0"></i>Fastest</span>' : ""}<span><i style="background:#ef476f"></i>Traps</span><span>Full bar = ${G.target} points</span></div>
  <div class="row" style="margin-top:18px"><button class="pri big" id="nextBtn">Next round</button></div></div>`;
	ov().classList.add("show");
	G.players.forEach((p, i) => (p.score += gain[i]!.f + gain[i]!.s + gain[i]!.t + gain[i]!.q));
	const spans = [...ov().querySelectorAll<HTMLElement>(".track span")];
	spans.forEach((s, k) =>
	{
		if (k % 5 === 0) s.style.width = s.dataset["w"] + "%";
	});
	setTimeout(() =>
	{
		spans.forEach((s) => (s.style.width = s.dataset["w"] + "%"));
	}, 350);
	const top = Math.max(...G.players.map((p) => p.score));
	if (top >= G.target)
	{
		const nb = $("nextBtn");
		nb.textContent = "See the winner";
		nb.id = "winBtn";
		nb.addEventListener("click", showWin);
	}
	tray().innerHTML = '<div class="msg">Scores are in.</div>';
	renderHUD();
}

/** The time of a player's run this round, or Infinity if they did not finish. */
const tm = (i: number): number => timeOf(G.results[i]);

function showWin(): void
{
	G.phase = "win";
	const ids = G.players.map((_, i) => i);
	const cross = ids.filter((i) => G.players[i]!.score >= G.target);
	let w = cross;
	let why = `${G.players[cross[0]!]!.score} points after ${G.round} rounds.`;
	if (cross.length > 1)
	{
		const best = Math.min(...cross.map(tm));
		w = best < Infinity ? cross.filter((i) => tm(i) - best < 0.005) : cross;
		why =
			`${cross.map((i) => esc(G.players[i]!.name)).join(" and ")} ${cross.length === 2 ? "both" : "all"} reached ${G.target} in the same round, so it came down to speed. ` +
			(best < Infinity ? `Fastest run: ${best.toFixed(2)}s.` : "Nobody finished that run, so it is a tie.");
	}
	const order = ids.toSorted(
		(a, b) => Number(w.includes(b)) - Number(w.includes(a)) || G.players[b]!.score - G.players[a]!.score,
	);
	ov().innerHTML = `<div class="card"><h2>${w.map(chipOf).join(" & ")} ${w.length > 1 ? "win together!" : "wins!"}</h2><p class="lede">${why}</p>
  <div class="bars">${order.map((i) => `<div class="br">${chipOf(i)}<div class="track"><span style="background:${G.players[i]!.color};width:${Math.min(100, (G.players[i]!.score / G.target) * 100)}%"></span></div><span class="pts">${G.players[i]!.score}</span></div>`).join("")}</div>
  <div class="row"><button class="pri big" id="againBtn">Play again</button><button id="newBtn">Change players</button></div></div>`;
	sfx("win");
	burst(W / 2, H / 2, "#ffd166", 40);
}

/** Loads the saved setup and best times, wires the overlay and tray, builds the empty course and opens the setup. */
export function initUI(): void
{
	Object.assign(S, loadSettings(localStorage, S));
	G.best = loadBest(localStorage);
	ov().addEventListener("click", onOverlayClick);
	ov().addEventListener("input", onOverlayInput);
	tray().addEventListener("click", onTrayClick);
	buildWorld();
	renderSetup();
}
