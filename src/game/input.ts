import {$, pointer} from "./dom.ts";
import {die} from "./physics.ts";
import {sound} from "./sound.ts";
import {game as G, placing, sim} from "./state.ts";
import type {Keys} from "./types.ts";
import {beginRun, confirmPlace, cpuTurn, ghostFrom, placeGhost, practicePlay, renderTray, rotate} from "./ui.ts";
import {buildWorld} from "./world.ts";

// The keyboard, the touch pad under the course, the mouse on the course, and the full screen and sound toggles.

const KEYMAP: Record<string, keyof Keys> =
{
	ArrowLeft: "l",
	KeyA: "l",
	ArrowRight: "r",
	KeyD: "r",
	Space: "j",
	ArrowUp: "j",
	KeyW: "j",
	ArrowDown: "d",
	KeyS: "d",
};

function onKeyDown(e: KeyboardEvent): void
{
	if (e.target instanceof HTMLInputElement) return;
	const run = sim.run;
	if (G.phase === "place" && e.code === "KeyR")
	{
		rotate();
		return;
	}
	if (G.phase === "place" && placing.pend)
	{
		if (e.code === "Enter")
		{
			e.preventDefault();
			confirmPlace();
			return;
		}
		if (e.code === "Escape")
		{
			placing.pend = null;
			renderTray();
			return;
		}
	}
	if (G.solo && G.phase === "place" && (e.code === "KeyP" || e.code === "Enter"))
	{
		e.preventDefault();
		practicePlay();
		return;
	}
	if (G.phase === "run" && run?.state === "go" && e.code === "KeyG")
	{
		die(-1, "gaveup");
		return;
	}
	if (G.solo && G.phase === "run" && run && e.code === "Escape")
	{
		sim.run = null;
		G.lastMsg = "Run stopped.";
		G.phase = "place";
		buildWorld();
		renderTray();
		return;
	}
	const k = KEYMAP[e.code];
	if (!k && e.code !== "Enter") return;
	if (G.phase === "run") e.preventDefault();
	if (G.phase !== "run" || !run) return;
	if ((k === "j" || e.code === "Enter") && !e.repeat && run.state === "ready")
	{
		beginRun();
		return;
	}
	if (run.cpu) return;
	if (k)
	{
		sim.keys[k] = 1;
		if (k === "j" && !e.repeat && run.state === "go") run.p.buf = 0.12;
	}
}

function onKeyUp(e: KeyboardEvent): void
{
	if (sim.run?.cpu) return;
	const k = KEYMAP[e.code];
	if (k) sim.keys[k] = 0;
}

function bindTouchButton(b: HTMLButtonElement): void
{
	const k = b.dataset["k"];
	if (k !== "l" && k !== "r" && k !== "j" && k !== "d") return;
	b.addEventListener("pointerdown", (e) =>
	{
		e.preventDefault();
		const run = sim.run;
		if (run?.cpu) return;
		sim.keys[k] = 1;
		if (k === "j" && run)
		{
			if (run.state === "ready") beginRun();
			else if (run.state === "go") run.p.buf = 0.12;
		}
	});
	for (const ev of ["pointerup", "pointercancel", "pointerleave"])
		b.addEventListener(ev, () =>
		{
			if (!sim.run?.cpu) sim.keys[k] = 0;
		});
}

function bindCourse(cv: HTMLElement): void
{
	cv.addEventListener("pointermove", (e) =>
	{
		if (G.phase === "place" && !cpuTurn() && e.pointerType === "mouse" && !placing.pend) ghostFrom(e, 0);
	});
	cv.addEventListener("pointerleave", () =>
	{
		if (G.phase === "place") placing.ghost = null;
	});
	cv.addEventListener("pointerdown", (e) =>
	{
		if (cpuTurn()) return;
		if (G.phase === "place") ghostFrom(e, 0);
		else if (G.phase === "run" && sim.run?.state === "ready") beginRun();
	});
	cv.addEventListener("pointerup", () =>
	{
		if (G.phase === "place" && !cpuTurn()) placeGhost();
	});
	cv.addEventListener("contextmenu", (e) =>
	{
		if (G.phase === "place")
		{
			e.preventDefault();
			rotate();
		}
	});
	cv.addEventListener(
		"wheel",
		(e) =>
		{
			if (G.phase === "place")
			{
				e.preventDefault();
				rotate();
			}
		},
		{
			passive: false,
		},
	);
}

/** Sets pointer.coarse, and the body's `coarse` class that shows the touch pad. */
function setCoarse(on: boolean): void
{
	pointer.coarse = on;
	document.body.classList.toggle("coarse", on);
}

/** Keeps pointer.coarse in step with the main pointer. */
function watchPointer(): void
{
	const coarse = matchMedia("(pointer:coarse)");
	setCoarse(coarse.matches);
	coarse.addEventListener("change", (e) =>
	{
		setCoarse(e.matches);
	});
}

/** Shows the full screen toggle where the browser allows it. */
function bindFullScreen(): void
{
	const el = document.documentElement;
	const btn = $("fsBtn");
	if (!document.fullscreenEnabled) return;
	btn.hidden = false;
	btn.addEventListener("click", () =>
	{
		(document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen()).catch(() =>
		{
			// Refused, as when the browser wants a fresher tap: the page stays as it is.
		});
	});
	document.addEventListener("fullscreenchange", () =>
	{
		btn.textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
	});
}

export function initInput(): void
{
	watchPointer();
	addEventListener("keydown", onKeyDown);
	addEventListener("keyup", onKeyUp);
	for (const b of document.querySelectorAll(".touch button")) if (b instanceof HTMLButtonElement) bindTouchButton(b);
	$("padGive").addEventListener("click", () =>
	{
		if (sim.run?.state === "go") die(-1, "gaveup");
	});
	bindFullScreen();
	bindCourse($("cv"));
	const mute = $("mute");
	mute.addEventListener("click", () =>
	{
		sound.muted = !sound.muted;
		mute.textContent = sound.muted ? "Sound off" : "Sound on";
	});
}
