// Small helpers for the page's markup.

/** The element with this id. The markup in index.html always has it, so a miss is a bug. */
export const $ = (id: string): HTMLElement => document.getElementById(id)!;

/** The canvas with this id. */
export function $canvas(id: string): HTMLCanvasElement
{
	const el = document.getElementById(id);
	if (!(el instanceof HTMLCanvasElement)) throw new Error(`#${id} is missing or not a canvas`);
	return el;
}

/** The canvases inside an element that match the selector. */
export const canvases = (root: ParentNode, selector: string): HTMLCanvasElement[] =>
	[...root.querySelectorAll(selector)].filter((el) => el instanceof HTMLCanvasElement);

/** The button an event happened on or inside, if any. */
export const buttonOf = (e: Event): HTMLButtonElement | null =>
	e.target instanceof Element ? e.target.closest("button") : null;

const ESCAPES: Record<string, string> =
{
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};
/** Text made safe to put in markup. */
export const esc = (s: string | number): string => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]!);
