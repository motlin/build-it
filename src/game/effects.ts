import {sim} from "./state.ts";

// Particle bursts for knockouts, finishes, placing and bombs.

export function burst(x: number, y: number, color: string, n: number): void
{
	if (sim.quiet) return;
	for (let i = 0; i < n; i++)
	{
		const a = Math.random() * Math.PI * 2;
		const s = 80 + Math.random() * 320;
		sim.fx.push(
			{
				x,
				y,
				vx: Math.cos(a) * s,
				vy: Math.sin(a) * s - 120,
				life: 0.6 + Math.random() * 0.5,
				color,
				r: 3 + Math.random() * 4,
			},
		);
	}
}

export function updateFx(dt: number): void
{
	sim.fx = sim.fx.filter((f) =>
	{
		f.vy += 900 * dt;
		f.x += f.vx * dt;
		f.y += f.vy * dt;
		f.life -= dt;
		return f.life > 0;
	});
}
