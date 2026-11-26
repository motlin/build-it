import {initCanvas} from "./game/draw.ts";
import {initInput} from "./game/input.ts";
import {startLoop} from "./game/loop.ts";
import {initUI} from "./game/ui.ts";
import {registerServiceWorker} from "./pwa/register.ts";

// Boots the game in the order the artifact's script ran: the course canvas, the setup screen with the overlay and
// tray, the keyboard, touch and mouse, then the frame loop. Each part starts on its own, so a failure in one leaves
// the others working.
for (const init of [initCanvas, initUI, initInput, startLoop])
{
	try
	{
		init();
	}
	catch (error)
	{
		reportError(error);
	}
}
registerServiceWorker();
