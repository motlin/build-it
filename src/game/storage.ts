import {COLORS} from "./state.ts";
import type {Settings} from "./types.ts";

// The player setup and the solo best times, kept in localStorage under the artifact's keys. A browser that blocks
// storage still gets the game, without the saving.
const SETTINGS_KEY = "pieceparty";
const BEST_KEY = "pieceparty-best";

/** The saved setup laid over the defaults, with colors, CPU flags and skill the game can use. */
export function loadSettings(storage: Storage, defaults: Settings): Settings
{
	const S: Settings =
	{
		...defaults,
	};
	try
	{
		const s: unknown = JSON.parse(storage.getItem(SETTINGS_KEY) ?? "null");
		if (typeof s === "object" && s !== null && "names" in s && s.names) Object.assign(S, s);
	}
	catch
	{
		// Unreadable storage or a corrupt save leaves the defaults.
	}
	if (!Array.isArray(S.colors) || S.colors.length < 8) S.colors = COLORS.slice();
	if (!Array.isArray(S.cpu)) S.cpu = [];
	if (![0, 1, 2].includes(S.skill)) S.skill = 1;
	return S;
}

export function saveSettings(storage: Storage, S: Settings): void
{
	try
	{
		storage.setItem(SETTINGS_KEY, JSON.stringify(S));
	}
	catch
	{
		// A full or blocked storage only loses the saved setup.
	}
}

const isBest = (b: unknown): b is Record<string, number> => typeof b === "object" && b !== null;

/** Each level's best solo time in seconds, by level name. */
export function loadBest(storage: Storage): Record<string, number>
{
	try
	{
		const b: unknown = JSON.parse(storage.getItem(BEST_KEY) ?? "{}");
		if (isBest(b)) return b;
	}
	catch
	{
		// Unreadable storage or a corrupt save starts with no best times.
	}
	return {};
}

export function saveBest(storage: Storage, best: Record<string, number>): void
{
	try
	{
		storage.setItem(BEST_KEY, JSON.stringify(best));
	}
	catch
	{
		// A full or blocked storage only loses the best times.
	}
}
