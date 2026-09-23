# Paloma Bay

*A seaside town painted by a from-scratch software renderer, one picture at a time.*

A motel on the coast highway, a boulevard laid out on the midsummer sunset, a beach with a lifeguard tower and a pier, a house on the point, and a marina with a lighthouse. It's all grown from rules and painted by an engine written for this project, in homage to the sunlit, deserted resort paintings of Hiroshi Nagai. No images, textures, models or rendering libraries are used. Every pixel comes from the code in `src/`.

![Paloma Bay: the motel, the boulevard at sunset, the beach, the house, the marina, the motel walkway, the beach at sunset, the docks, the diner](docs/gallery/town.png)

- **Visit the town:** [`docs/index.html`](docs/index.html) ([live](https://patelnilay251.github.io/musical-bassoon/docs/)). Full screen, one picture at a time, nothing else on it. Drag across the painting to pass the day. `←` `→` go to another place and `↑` `↓` to another view of it; on a phone, tap the edges or flick up and down. `Space` lets the day go by on its own. The page opens wherever the visitor happens to be at your local time.
- **The book:** [`docs/book.html`](docs/book.html). *Wish You Were Here*: ten postcards from one summer day, sent by someone who never appears in any of them.
- **The film:** [`docs/day.html`](docs/day.html) ([live](https://patelnilay251.github.io/musical-bassoon/docs/day.html)). *One Day in Paloma Bay*: three minutes of one summer day, passing through every postcard in the book, with its own score. The 1080p master is on the [releases page](https://github.com/patelnilay251/musical-bassoon/releases/tag/render-day-final).
- **The arcade version:** [`docs/film.html`](docs/film.html) ([live](https://patelnilay251.github.io/musical-bassoon/docs/film.html)). *Paloma Bay, the attract mode*: 86 seconds of an arcade game from a summer that never happened, with its own music.
- **The workshop:** [`docs/workshop.html`](docs/workshop.html). The first viewer, with all its knobs, for the house alone.
- **The idea behind it:** [`PHILOSOPHY.md`](PHILOSOPHY.md).

## The visitor

Nobody appears anywhere in town. Someone is visiting, though, and they keep a schedule (`src/visitor.js`). The motel at night. Breakfast at the diner. A morning at the house on the point, with a towel, a book and a glass left by the pool. An afternoon on the beach, with an umbrella over nobody and a surfboard missing from the rack, then back again on the sand. At six the red sloop's slip at the marina is empty. The site and the book read the same schedule. Scrub the day on the site and you can follow the yellow convertible around town.

## Wish You Were Here

| | | | | |
|---|---|---|---|---|
| ![4:51 a.m., the motel](docs/book/page-01.png) | ![8:18 a.m., the diner](docs/book/page-02.png) | ![9:48 a.m., the house](docs/book/page-03.png) | ![11:36 a.m., the pool](docs/book/page-04.png) | ![2:12 p.m., the beach](docs/book/page-05.png) |
| 4:51 a.m. | 8:18 a.m. | 9:48 a.m. | 11:36 a.m. | 2:12 p.m. |
| ![4:12 p.m., from the pier](docs/book/page-06.png) | ![6:06 p.m., the marina](docs/book/page-07.png) | ![6:48 p.m., the boulevard](docs/book/page-08.png) | ![7:27 p.m., the lighthouse](docs/book/page-09.png) | ![10:00 p.m., the motel](docs/book/page-10.png) |
| 4:12 p.m. | 6:06 p.m. | 6:48 p.m. | 7:27 p.m. | 10:00 p.m. |

## One place, one day

The sun follows its real path over 34° north in late July. The palette, the shadows, the sea glitter and the lights all follow from the hour. Neon burns until sunrise, and the NO in NO VACANCY comes on when the visitor gets back for the night.

![The motel at eight hours from before dawn to night](docs/gallery/day.png)

## One Day in Paloma Bay

[![ONE DAY IN PALOMA BAY, the title over the motel before dawn: the pink MOTEL sign, NO VACANCY, lit rooms under a paling sky](docs/film/one-day.png)](docs/day.html)

One summer day, from before dawn at the motel to the last room going, told only through light and the things a visitor leaves behind. The visitor is never seen. There are thirteen shots, and the film passes through every postcard in the book: at each card's minute the frame is exactly that page, and a caption in the town's own sign lettering says where and when.

- **Two clocks** (`film/day/score.js`). The light runs fifty to a hundred times fast, so each shot covers ten to twenty minutes of the day and you watch shadows creep and the sky turn. Wind, water, birds and the car run in real time. The camera stays level and mostly still. It pans with the car as it pulls in at the diner and again as it comes home, and it pushes slowly down the boulevard at sunset. The moving car is filmed with a 180° shutter: four exposures across half a frame, averaged.
- **The traces.** The yellow convertible arrives at breakfast and parks where the postcard shows it. Footprints run from the towel to the water, and back once the surfboard is returned. The red sloop comes home past the lighthouse at dusk. At night the visitor's window lights up after the car door closes, and the NO in NO VACANCY buzzes on.
- **The car radio** (`film/day/radio.js`). The visitor exists only through their car, and the car plays the attract mode's song, that summer's hit, through its dashboard speaker. It is heard getting nearer, and it stops dead mid-phrase when the key turns, once at breakfast and once at night. The score (`film/day/music.js`) is the same tune as a 76 bpm ballad on electric piano, pads, a fretless bass, brushes and a soft FM horn. It enters at the pool, lifts a key as the sun touches the sea at the end of the boulevard, and rings a bell on each flash of the lighthouse. At the end it finishes the phrase the radio broke off, and a music box plays the tune once more.
- **The sound of each place** (`src/audio/fx.js`, `film/day/sfx.js`). Every sound is synthesized. Before dawn: crickets, the sign's hum, a truck far up the highway, the ice machine by the office. At sunrise: doves and a mockingbird. On the beach: surf in step with the breakers on screen, the tower flag and its halyard ringing on the pole, pelican wings. Then pilings and creaking planks under the pier, halyards and fenders at the marina, a bell buoy, waves on the rocks and a foghorn. Each place is heard a moment before it is seen, and every source sits where the camera sees it.
- **What the engine learned for it.** A new convertible, lofted from cross-sections, with whitewalls, chrome and pleated seats. Painted ground: wind ripples in the sand, mowing stripes, and lanes worn into the asphalt. Curtains drawn in lit motel rooms, parking meters and hydrants along the boulevard, stars that shimmer and umbrellas that breathe in the wind.

## The attract mode

[![PALOMA BAY, the title screen: the motel at night under its neon sign, PRESS START](docs/film/poster.png)](docs/film.html)

The town, filmed as the arcade game its summer would have had, playing itself between customers. Somebody drops in a coin and presses start, and the game plays one day as the visitor. It starts before dawn at the motel with the sun coming up over the hills. Then the yellow convertible drives down the boulevard to the diner, with the speedometer running. After that come a morning at the house, the surf at the beach, and the red sloop motoring out of the marina and getting its sails up. The camera glides down the boulevard as the sun sets at the end of it and the street lamps catch. At night the car comes home to its stall, the NO in NO VACANCY buzzes on, and the caption types itself out: WISH YOU WERE HERE. INSERT COIN.

- **Everything moves.** Each frame builds the place as it stands at that instant (`src/world/motion.js`): fronds sway in the onshore wind, boats heave and pitch on the swell, breakers surge in and the swash runs up the sand, the tower's flag flutters, gulls cross the sky. The car and the sloop follow paths with speed profiles (`film/attract/score.js`). At rest, for the stills, nothing moves.
- **The look of the hardware** (`src/retro.js`, `src/pixelfont.js`, `film/attract/screen.js`). The engine paints each frame at 384×216. It is reduced to 512 colors (three bits a channel) with a 4×4 ordered dither and enlarged four times with hard pixels and scanlines. The HUD, the stage cards and the logo are drawn in a 5×7 board font. Stages change the way consoles changed them: the picture breaks into blocks and fades in steps. Quiet scenes are animated on twos, 15 pictures a second; the two drives run at 30.
- **The sound** (`src/audio/synth.js`, `film/attract/music.js`, `film/attract/sfx.js`). An original tune in D in the city-pop manner is played on a small FM synthesizer written for it. It uses rootless ninth chords and the royal road progression (IV–V–iii–vi), with the last chorus a whole step up for the sunset. Every effect is synthesized and placed from the same score as the pictures. The surf breaks when the lines on screen do, the engine's revs follow the car's speed, the door closes after the car has parked, and the neon clicks on frame by frame.

## Painted, not rendered

The first version rendered a resort. This one tries to paint a town, the way an illustrator with an airbrush would:

- **Light is chosen, not simulated.** Each moment of the day names a light tone and a shade tone, keyed to the sun's elevation. Planes take one of three lit values (full, oblique, grazing) instead of a continuous falloff. Walls are airbrushed lighter toward the top in sun and warmer near the ground in shade, and curved forms get a soft terminator and a sprayed sheen. Shadows are a change of hue, periwinkle and violet, not a loss of it.
- **Skies are sprayed in layers:** an ultramarine ground, white mist from the horizon, blue laid back over it and deepening toward the top of the frame, and never quite even. Cumulus clouds live on the sky dome as crowns of puffs in paint order, lit as one airbrushed form with a flat, shaded base.
- **Glass and water are painted the way painters paint them.** Windows get deep blue at the foot of each floor, lifting toward the sky's color, with diagonal bands of reflected light. Water mirrors the world through a second camera, then gets marbled bands and broken white crest lines. Beaches fade from aqua over the sand to deep blue offshore, with foam drawn as tapered strokes.
- **Verticals stay vertical.** Every composition is built level, like a view camera, and a lens shift puts the horizon where the picture wants it (`src/camera.js`). Taller screens keep the width of the view and gain sky. Long lenses flatten the perspective.
- **Finish:** neon and lamps burn past white, and a glow pass lets them bleed. A fine grain, strongest in the midtones, stands in for the tooth of acrylic on board.

## How it works

**Rasterizer** (`src/raster.js`). Triangles are clipped against the near plane and rasterized with edge functions into a visibility buffer: for each sample, the nearest triangle's id and depth. Shading runs once per visible sample, afterwards, so overdraw is nearly free. Frames render in 64-pixel tiles with supersampling.

**Shadows** (`src/bvh.js`). An orthographic sun shadow map, read with PCF. For print, the map only classifies: where a 4×4 neighborhood agrees, its answer stands, and everywhere else a ray is traced through a bounding volume hierarchy, which gives exact edges for a fraction of the cost.

**Reflections.** Everything above the water is rendered a second time from a camera mirrored in its surface, then looked up along the ripple-perturbed reflected ray. Pools limit that pass to their rectangle. For open water under a level camera, row *y* of the frame only ever sees mirrored row *−y − 2·shift*. So only a band of the mirror is rendered, and a test proves the picture doesn't change by a single bit.

**The town** (`src/scenes/`, `src/world/`). A transform-stack mesh builder (boxes, prisms, extruded profiles, tubes, spheres) feeds the rules for each place:
- a motel block with walkways, pickets and colored doors;
- a pylon sign with stacked channel letters in a stroke font, neon laid in every stroke;
- Mexican fan palms with skirts and split, drooping fan leaves, and coconut palms with folded leaflets;
- cars in three bodies;
- hulls lofted from stations, with sheer, flare and overhangs, then rigged as sloops or built up into motor yachts;
- a lighthouse, a rock breakwater, a pier on pilings, a lifeguard tower, and a streamline diner with a rounded end.

The boulevard is built in a road frame and turned onto the sunset bearing. Every place has a fixed seed and independent random streams, so the things the visitor leaves behind never reshuffle the town.

**The site** (`web/`). The whole engine is bundled into a Web Worker and inlined into one HTML file. A pool of workers paints each frame from the middle out. While you drag, it's a quick sketch at a fraction of the resolution. Once you let go, the finished picture comes in tile by tile over the sketch, and the glow is laid on at the end. Places crossfade. Without workers, the same service runs on the page one tile per task.

## Running it

Node 22 or newer. `npm install` brings in esbuild, which is used only to bundle the site.

```sh
npm test                 # engine, world rules, the town, the visitor, the lens, the mirror band, the render service, both films
npm run build            # docs/index.html (the town) and docs/workshop.html (the old viewer)
npm run book             # the postcards, in parallel on every core, into docs/book/ and docs/book.html
npm run gallery          # the contact sheets above
npm run film -- --film day   # One Day in Paloma Bay, its poster and docs/day.html (needs ffmpeg)
npm run film                 # the attract mode, its poster and docs/film.html
npm run render -- --place marina --view slips --time 15.8 --w 1500 --h 1000 --ss 3 --rays --out docks.png
```

Films are streamed frame by frame, in order, into ffmpeg (on the `PATH`, or named by `FFMPEG`); every frame is built and painted from scratch. `--draft` makes a quick low-resolution cut, `--from 57.6 --to 67.2` renders a stretch, and `--audio-only` just the soundtrack, which takes ten to twenty seconds. The attract mode takes about seven minutes on four cores. It is 1536×864 because at four times enlargement each board pixel fills exactly one of H.264's 4×4 blocks, which keeps the pixels hard and the file small.

*One Day* is 4,396 frames at 1920×1080 with four samples a pixel and exact shadows, several hours on four cores, so it renders on GitHub Actions instead (`.github/workflows/render.yml`). Committing a change to `render/request.json` (which film, draft or final, how many slices) starts twenty runners. Each renders a slice with `--slice k/20 --video-only`, and a last job joins the slices without re-encoding (`--join`), lays the soundtrack under them, and posts the film to a pre-release named after it. The draft takes about three minutes and the final about half an hour.

`node scripts/book.js --inline book.html` writes a single self-contained copy of the book with the images embedded. A 1500×1000 postcard with 9 samples per pixel and exact shadows takes 8 to 19 seconds on one core, and the whole book about 40 seconds on four.

## Notes

- The style is an homage. No artwork was copied or used as input; the look comes from rules written in code.
- Geometry ranges from about 35,000 triangles (the house) to 218,000 (the boulevard, which has 128 palms, a parking meter for every space and a dozen cars on it).
- The film's game, its company and its copyright line are fictional.
- `PHILOSOPHY.md` is the brief the engine was built against.
