import {$} from "./dom.ts";
import {die} from "./physics.ts";
import {sound} from "./sound.ts";
import {game as G, placing, sim} from "./state.ts";
import type {Keys} from "./types.ts";
import {beginRun, confirmPlace, cpuTurn, ghostFrom, placeGhost, practicePlay, renderTray, rotate} from "./ui.ts";
import {buildWorld} from "./world.ts";

// The keyboard, the touch buttons over the course, the mouse on the course, and the sound toggle.

const KEYMAP: Record<string, keyof Keys> =
{
	ArrowLeft: "l",
	KeyA: "l",
	ArrowRight: "r",
	KeyD: "r",
	Space: "j",
	ArrowUp: "j",
	KeyW: "j",
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
	if (k !== "l" && k !== "r" && k !== "j") return;
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

export function initInput(): void
{
	addEventListener("keydown", onKeyDown);
	addEventListener("keyup", onKeyUp);
	for (const b of document.querySelectorAll(".touch button")) if (b instanceof HTMLButtonElement) bindTouchButton(b);
	bindCourse($("cv"));
	const mute = $("mute");
	mute.addEventListener("click", () =>
	{
		sound.muted = !sound.muted;
		mute.textContent = sound.muted ? "Sound off" : "Sound on";
	});
}
