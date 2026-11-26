import {expect, it} from "vite-plus/test";
import {settings} from "../../src/game/state.ts";
import {loadBest, loadSettings, saveBest, saveSettings} from "../../src/game/storage.ts";
import type {Settings} from "../../src/game/types.ts";

// localStorage for node: a map of strings, which can be made to refuse every call like a browser that blocks storage.
class MemoryStorage implements Storage
{
	readonly items = new Map<string, string>();
	constructor(private readonly blocked = false)
	{
	}
	get length(): number
	{
		return this.items.size;
	}
	clear(): void
	{
		this.items.clear();
	}
	getItem(key: string): string | null
	{
		this.check();
		return this.items.get(key) ?? null;
	}
	key(index: number): string | null
	{
		return [...this.items.keys()][index] ?? null;
	}
	removeItem(key: string): void
	{
		this.items.delete(key);
	}
	setItem(key: string, value: string): void
	{
		this.check();
		this.items.set(key, value);
	}
	private check(): void
	{
		if (this.blocked) throw new DOMException("The operation is insecure.", "SecurityError");
	}
}

const DEFAULTS: Settings = structuredClone(settings);
const SETUP: Settings =
{
	count: 3,
	names: ["Ann", "Bo", "Cy", "Ocean", "Orange", "Grape", "Sky", "Lime"],
	target: 10,
	cpu: [false, true],
	skill: 2,
	noFF: true,
	colors: ["#000000", "#ffffff", "#06d6a0", "#118ab2", "#ff8c00", "#9b5de5", "#00bbf9", "#8ac926"],
};

it("saves the player setup under pieceparty and loads it back over the defaults", () =>
{
	const storage = new MemoryStorage();
	expect(loadSettings(storage, DEFAULTS)).toStrictEqual(DEFAULTS);
	saveSettings(storage, SETUP);
	expect(
		{
			stored: storage.items,
			loaded: loadSettings(storage, DEFAULTS),
		},
	).toStrictEqual(
		{
			stored: new Map([["pieceparty", JSON.stringify(SETUP)]]),
			loaded: SETUP,
		},
	);
});

it("repairs a saved setup's colors, CPU flags and skill, and ignores one that is corrupt or has no names", () =>
{
	const load = (saved: string): Settings =>
	{
		const storage = new MemoryStorage();
		storage.setItem("pieceparty", saved);
		return loadSettings(storage, DEFAULTS);
	};
	expect(
		{
			repaired: load(
				JSON.stringify(
					{
						...SETUP,
						colors: ["#000000"],
						cpu: "yes",
						skill: 7,
					},
				),
			),
			corrupt: load("{not json"),
			nameless: load(
				JSON.stringify(
					{
						count: 2,
					},
				),
			),
		},
	).toStrictEqual(
		{
			repaired:
			{
				...SETUP,
				colors: DEFAULTS.colors,
				cpu: [],
				skill: 1,
			},
			corrupt: DEFAULTS,
			nameless: DEFAULTS,
		},
	);
});

it("saves the solo best times under pieceparty-best and loads them back", () =>
{
	const storage = new MemoryStorage();
	expect(loadBest(storage)).toStrictEqual({});
	saveBest(
		storage,
		{
			"The Gap": 4.25,
			"Sky Tower": 9.5,
		},
	);
	expect(
		{
			stored: storage.items,
			loaded: loadBest(storage),
		},
	).toStrictEqual(
		{
			stored: new Map([["pieceparty-best", '{"The Gap":4.25,"Sky Tower":9.5}']]),
			loaded:
			{
				"The Gap": 4.25,
				"Sky Tower": 9.5,
			},
		},
	);
});

it("plays on with the defaults and no best times when the browser blocks storage", () =>
{
	const storage = new MemoryStorage(true);
	saveSettings(storage, SETUP);
	saveBest(
		storage,
		{
			"The Gap": 4.25,
		},
	);
	expect(
		{
			settings: loadSettings(storage, DEFAULTS),
			best: loadBest(storage),
			stored: storage.items,
		},
	).toStrictEqual(
		{
			settings: DEFAULTS,
			best: {},
			stored: new Map(),
		},
	);
});
