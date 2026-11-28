import {expect, type Page, test} from "@playwright/test";
import {serveFonts} from "./harness/fonts.ts";

// Opens the game and collects page errors.
async function open(page: Page): Promise<string[]>
{
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await serveFonts(page);
	await page.goto("/");
	return errors;
}

// The page position of a point on the course, given in course cells (32 by 18).
async function at(page: Page, c: number, r: number): Promise<[number, number]>
{
	const box = (await page.locator("#cv").boundingBox())!;
	return [box.x + (c / 32) * box.width, box.y + (r / 18) * box.height];
}

// Clicks the course so the held piece, w cells wide and h tall, lands with its top left cell at column c, row r.
async function placeAt(page: Page, c: number, r: number, w: number, h: number): Promise<void>
{
	await page.mouse.click(...(await at(page, c + w / 2, r + h / 2)));
}

// Drags the held piece from the tray onto the course at column c, row r.
async function dragHoldTo(page: Page, c: number, r: number): Promise<void>
{
	const hold = (await page.locator("#hold").boundingBox())!;
	await page.mouse.move(hold.x + hold.width / 2, hold.y + hold.height / 2);
	await page.mouse.down();
	await page.mouse.move(
		...(await at(page, c, r)),
		{
			steps: 5,
		},
	);
	await page.mouse.up();
}

test("solo practice: bridge The Gap, run and jump to the flag, then switch levels", async ({page}) =>
{
	const errors = await open(page);
	await page.locator('button[data-n="1"]').click();
	await page.locator("#startBtn").click();
	await page.locator('button[data-vote="0"]').click();
	await expect(page.locator("#round")).toHaveText("Practice · The Gap");

	// Four bridges, a plank and a block fill row 13 from the start ledge to the flag ledge.
	await page.locator('button[data-sel="bridge"]').click();
	for (const c of [4, 9, 14, 19]) await placeAt(page, c, 13, 5, 1);
	await page.locator('button[data-sel="plank"]').click();
	await placeAt(page, 24, 13, 3, 1);
	await page.locator('button[data-sel="block"]').click();
	await placeAt(page, 27, 13, 1, 1);
	await expect(page.locator("#undoBtn")).toBeEnabled();

	await page.locator("#playBtn").click();
	await page.keyboard.down("ArrowRight");
	await page.keyboard.press("Space");
	await expect(page.locator("#tray .msg b").first()).toHaveText(
		/^Made it in \d+\.\d\ds\. New best!$/,
		{
			timeout: 15_000,
		},
	);
	await page.keyboard.up("ArrowRight");
	const best = await page.evaluate(
		() => JSON.parse(localStorage.getItem("pieceparty-best") ?? "{}") as Record<string, number>,
	);
	expect(Object.keys(best)).toStrictEqual(["The Gap"]);

	await page.locator("#lvlBtn").click();
	await expect(page.locator('button[data-vote="0"] .tag')).toHaveText(`Best ${best["The Gap"]!.toFixed(2)}s`);
	await page.locator('button[data-vote="3"]').click();
	await expect(page.locator("#round")).toHaveText("Practice · Sky Tower");
	await expect(page.locator("#undoBtn")).toBeDisabled();
	expect(errors).toStrictEqual([]);
});

test("a 2-player round: vote, pick, toggle the sound, place or discard, give up and see the results", async ({page}) =>
{
	const errors = await open(page);
	await page.locator('button[data-n="2"]').click();
	await page.locator("#startBtn").click();
	await expect(page.locator("#ov h2")).toHaveText("Red votes for a level");
	await page.locator('button[data-vote="0"]').click();
	await page.locator('button[data-vote="0"]').click();
	await expect(page.locator("#ov h2")).toHaveText("Level: The Gap");
	await page.locator("#lvStart").click();

	// The box is random, so each player takes whatever is first.
	for (const who of ["Red", "Sunny"])
	{
		await expect(page.locator("#ov h2")).toHaveText(`${who} picks a piece`);
		await page.locator('button[data-pick="0"]').click();
		await page.locator("#okPick").click();
	}

	// The sound toggle in the header is in reach once the cards close.
	await page.locator("#mute").click();
	await expect(page.locator("#mute")).toHaveText("Sound off");
	await page.locator("#mute").click();
	await expect(page.locator("#mute")).toHaveText("Sound on");

	// Red drags the piece from the tray to the middle of the open sky and confirms; Sunny discards. A portal goes down
	// in two steps, its entrance and then its exit.
	await expect(page.locator("#tray .msg")).toContainText(/Red, (drag your|place the portal entrance)/);
	// Dropped into the ground, it does not fit until it is cancelled and dragged to the sky, then nudged along.
	await dragHoldTo(page, 1, 15);
	await expect(page.locator("#tray .msg")).toContainText("doesn't fit there");
	await expect(page.locator("#okPlace")).toBeDisabled();
	await page.locator("#movePlace").click();
	await dragHoldTo(page, 15, 5);
	await page.locator('button[data-nudge="1,0"]').click();
	await expect(page.locator("#tray .msg")).toContainText("Red, place your");
	await page.locator("#okPlace").click();
	if ((await page.locator("#tray .msg").textContent())!.includes("portal exit"))
	{
		await dragHoldTo(page, 20, 5);
		await page.locator("#okPlace").click();
	}
	await expect(page.locator("#tray .msg")).toContainText(/Sunny, (drag your|place the portal entrance)/);
	await page.locator("#skipBtn").click();
	await expect(page.locator("#skipBtn")).toHaveText("Tap again to discard");
	await page.locator("#skipBtn").click();

	// Red starts with Go! and gives up with the button; Sunny starts with Space and gives up with G.
	await expect(page.locator("#tray .msg")).toContainText("Red's turn to run");
	await page.locator("#goBtn").click();
	await page.locator("#giveBtn").click();
	await expect(page.locator("#tray .msg")).toContainText("Sunny's turn to run");
	await page.keyboard.press("Space");
	await expect(page.locator("#giveBtn")).toBeEnabled();
	await page.keyboard.press("KeyG");

	await expect(page.locator("#ov h2")).toHaveText("Round 1 results");
	await expect(page.locator("#ov .note")).toHaveText("Nobody made it! No points this round. Keep building.");
	await expect(page.locator("#round")).toHaveText("Round 1 · The Gap · first to 15");

	expect(errors).toStrictEqual([]);
});
