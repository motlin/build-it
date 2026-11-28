import {cpuControl} from "./cpu.ts";
import {draw} from "./draw.ts";
import {updateFx} from "./effects.ts";
import {STEP} from "./geometry.ts";
import {stepRun} from "./physics.ts";
import {game, sim} from "./state.ts";
import type {Run} from "./types.ts";
import {cpuTick, nextRunner} from "./ui.ts";
import {updateWorld} from "./world.ts";

// The frame loop: CPU turns, then fixed physics steps while a run is on, then particles and the drawing. A CPU run
// keeps moving while its planner works.

/** Read through a function, since a CPU's controls can end the run within a step. */
const going = (run: Run): boolean => run.state === "go";

let last = performance.now();
let acc = 0;

function frame(now: number): void
{
	const dt = Math.min(0.05, (now - last) / 1000);
	last = now;
	cpuTick(now);
	const run = sim.run;
	if (game.phase === "run" && run)
	{
		acc += dt;
		while (acc >= STEP)
		{
			updateWorld(STEP, run.state === "go");
			if (going(run))
			{
				run.t += STEP;
				if (run.cpu) cpuControl();
				if (going(run)) stepRun(STEP);
			}
			acc -= STEP;
		}
		if (run.state === "done")
		{
			run.doneT -= dt;
			if (run.doneT <= 0) nextRunner();
		}
	}
	else updateWorld(dt, false);
	updateFx(dt);
	draw();
	requestAnimationFrame(frame);
}

export function startLoop(): void
{
	requestAnimationFrame(frame);
}
