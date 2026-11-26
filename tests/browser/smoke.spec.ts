import {expect, test} from "@playwright/test";

test("the game loads, draws the course and opens the player setup with no errors", async ({page}) =>
{
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await expect(page.locator("header h1")).toHaveText("Build It!");
	await expect(page.locator("#ov.show h2")).toHaveText("Build It!");
	await expect(page.locator("#startBtn")).toHaveText("Start game");
	await expect.poll(async () => page.locator("#cv").evaluate(drawnPixels)).toBeGreaterThan(0);
	expect(errors).toStrictEqual([]);
});

// How many of the canvas's pixels the game has painted.
function drawnPixels(canvas: HTMLCanvasElement): number
{
	const {data} = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
	let painted = 0;
	for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) painted++;
	return painted;
}
