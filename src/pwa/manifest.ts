// What makes the page an installable app: the web app manifest and the fixed files the service worker keeps for
// offline play. index.html links them, and src/pwa/register.ts registers the worker. The color is the page's deep
// navy, so the splash screen and status bar match the page; the manifest test checks they match.
const NAVY = "#0f1830";

type Icon =
{
	src: string;
	sizes: string;
	type: "image/png";
	purpose: "any" | "maskable";
};

export const MANIFEST =
{
	id: "/",
	name: "Build It!",
	short_name: "Build It!",
	description: "A party platformer: place pieces on the course, then race to the flag",
	start_url: "/",
	scope: "/",
	display: "standalone",
	orientation: "any",
	background_color: NAVY,
	theme_color: NAVY,
	icons: [
		{
			src: "/icons/icon-192.png",
			sizes: "192x192",
			type: "image/png",
			purpose: "any",
		},
		{
			src: "/icons/icon-512.png",
			sizes: "512x512",
			type: "image/png",
			purpose: "any",
		},
		{
			src: "/icons/icon-maskable-512.png",
			sizes: "512x512",
			type: "image/png",
			purpose: "maskable",
		},
	] satisfies Icon[],
};

export const APPLE_TOUCH_ICON = "/icons/apple-touch-icon.png";
export const FAVICON = "/favicon.svg";

/** The files every build has. The build adds its hashed script and stylesheet; see scripts/service-worker-build.ts. */
export const PRECACHE_URLS = [
	"/",
	"/manifest.webmanifest",
	...MANIFEST.icons.map(({src}) => src),
	APPLE_TOUCH_ICON,
	FAVICON,
];
