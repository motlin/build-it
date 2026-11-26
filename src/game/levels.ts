import type {Level} from "./types.ts";

// The eight courses players vote on.
export const LEVELS: Level[] = [
	{
		name: "The Gap",
		desc: "Start on the left, flag on the right. Build a bridge across.",
		ground: [
			[0, 13, 4, 5],
			[28, 13, 4, 5],
		],
		start: [1, 13],
		flag: [30, 13],
	},
	{
		name: "Loop Around",
		desc: "Start at the top. Falling off the bottom drops you back in from the top. A gate blocks the flag: loop around, slip under the roof and hit the switch to lift it.",
		wrapY: true,
		ground: [
			[0, 3, 4, 1],
			[11, 10, 5, 1],
			[12, 14, 3, 1],
			[26, 13, 6, 2],
		],
		gate: [20, 0, 2, 18],
		sw: [13, 13],
		forced: [
			{
				type: "plank",
				c: 15,
				r: 14,
			},
		],
		aims: [[15, 17, 14]],
		start: [1, 3],
		flag: [29, 13],
	},
	{
		name: "Around the World",
		desc: "A wall blocks the way left. Head right, wrap off the edge, and arrive at the flag from the other side.",
		wrapX: true,
		aims: [[28, 31, 13]],
		noFlagAim: true,
		ground: [
			[0, 13, 3, 5],
			[4, 0, 1, 18],
			[6, 13, 4, 5],
			[28, 13, 4, 5],
		],
		start: [7, 13],
		flag: [1, 13],
	},
	{
		name: "Sky Tower",
		desc: "The flag floats way up high. Build a staircase to the sky.",
		ground: [
			[0, 14, 5, 4],
			[26, 3, 6, 1],
		],
		start: [2, 14],
		flag: [29, 3],
	},
	{
		name: "Lava Run",
		desc: "The floor is lava. Start up high and work your way down to the flag.",
		ground: [
			[0, 4, 4, 1],
			[27, 15, 5, 2],
		],
		lava: [[0, 17, 32, 1]],
		start: [1, 4],
		flag: [30, 15],
	},
	{
		name: "Low Ceiling",
		desc: "A rock ceiling hangs over the gap. No room for big jumps.",
		ground: [
			[0, 13, 4, 5],
			[28, 13, 4, 5],
			[4, 0, 24, 9],
		],
		start: [1, 13],
		flag: [30, 13],
	},
	{
		name: "Moon Base",
		desc: "Low gravity. You float high and land slow, so traps are harder to dodge.",
		grav: 0.5,
		ground: [
			[0, 13, 4, 5],
			[14, 15, 4, 3],
			[28, 9, 4, 9],
		],
		start: [1, 13],
		flag: [30, 9],
	},
	{
		name: "Frozen Peaks",
		desc: "All the ground is ice. Stopping on the flag ledge is half the battle.",
		ice: true,
		ground: [
			[0, 11, 4, 7],
			[13, 14, 6, 4],
			[27, 11, 5, 7],
		],
		start: [1, 11],
		flag: [30, 11],
	},
];
