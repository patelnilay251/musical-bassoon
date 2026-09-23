# One Day in Paloma Bay: director's plan

*A short film of the town at full painted resolution. No pixel look, no game layer. Written for discussion before anything was built; the notes below record what was decided and what changed on the way.*

## As built

- **Answers:** the full cut (3:03, all thirteen shots), captions at every postcard, the score with the car radio, a 1080p master, rendered on GitHub Actions.
- **Animations kept:** pelicans, twinkling stars, the umbrellas breathing, the beacon's flash, the sloop coming home, motion blur on the car. The page turn and the sprinkler were dropped. At the film's framing the book and the lawn are too small in the frame for either to read.
- **Added while shooting:**
  - footprints from the towel to the water, and back once the board is returned;
  - the visitor's window on its own switch, and curtains in every lit room;
  - a new lofted convertible;
  - wind ripples in the sand, mowing stripes, and lane wear on the roads;
  - parking meters, hydrants and newspaper boxes along the boulevard;
  - a little bell over the diner's door.
- **Changed:**
  - The opening title and the closing line moved into the sky left of the MOTEL pylon, which a centered title runs into.
  - The pier shot keeps its silence, as planned. The chords of the shore shot ring on over the cut into it.
  - The radio plays the attract mode's song at its own 100 bpm. It is cut once inside the chorus and once in the hook's last bar, and the night's score picks up the three notes it broke off.

## The idea

One summer day in a seaside town that doesn't exist, from before dawn to the last room going. It is told only through light and the things a visitor leaves behind. The visitor is never seen and never heard speaking. We know them by their yellow convertible, the song on its radio, a towel on the sand and a room light coming on.

The film **passes through every postcard in the book**. Each shot runs a few minutes of the day either side of its postcard's moment. At that moment the frame is exactly the book's page, and a small caption says where and when. The book becomes the film's spine.

**House rules**
- The camera is always level (verticals stay vertical). It is mostly still, like a painting on a wall. Three shots move.
- Two clocks run at once. The light runs 50 to 100 times fast, so a shot covers 10 to 25 minutes of the day and you see shadows creep and the sky turn. Wind, water, gulls and the car run in real time.
- No people appear, and no human sounds are heard: no voices, no footsteps. The visitor exists only through their car: the engine, the radio, the doors.
- Everything is made from rules: every picture, every sound, every note, as in the rest of the project.

## Format

| | |
|---|---|
| Length | about 2:55 (a 2:15 cut drops shots 4 and 7) |
| Frame | 16:9, 1920×1080 master (2560×1440 or 4K if we render on GitHub Actions), 24 fps |
| Look | the painted engine as it is, with 4 samples per pixel and exact shadows (about the same cost as shadow maps at this size), bloom, and the painted grain held still like the tooth of the board |
| Cutting | cuts land on the score's bar lines. The film fades in from black on sound and fades out to black at the end |

## Shot list

Durations snap to bars of the score (76 bpm, 3.16 s a bar). "Card" marks the frame that is the book's page.

**0. Black.** Sound first: crickets, a far-off truck on the coast highway, the neon's hum.

**1. The Motel, before dawn.** 4:36 → 4:54 (card 1, 4:51), 16 s, `front` view, locked off.
- *Moves:* palms barely stirring, stars, NO VACANCY burning, the sky paling behind the building, the yellow car in its stall.
- *Title:* PALOMA BAY fades up over the sky and away.
- *Sound:* crickets, neon hum and the odd tick of a tube, surf across the road, the ice machine by the office dropping a load of ice.

**2. Sunrise over the hills.** 5:05 → 5:25, 10 s, from the pool deck over the wall (the attract-mode film's dawn shot).
- *Moves:* the sun clears the hills, long light across the deck, pool ripples, a gull.
- *Sound:* the sign clicks off somewhere behind us and its hum stops. Then mourning doves and a mockingbird, the pool filter, crickets thinning out.

**3. The Diner.** 8:12 → 8:22 (card 2, 8:18), 16 s, `diner` view from across the street, slow pan.
- *Moves:* the yellow convertible comes down the hill from the right with its top down and pulls into the curb outside the diner. The pan settles as it parks, and by 8:18 the frame is the postcard.
- *Sound:* **a song on the car's radio**, getting nearer, then the engine. The key turns, the radio stops mid-phrase and a door closes. Birds and the street come back.

**4. The House.** 9:44 → 9:52 (card 3, 9:48), 10 s, `front` view, locked off.
- *Moves:* the car in the drive, palms in the onshore breeze, a lawn sprinkler ticking round (optional).
- *Sound:* palm rustle in gusts, the sprinkler, surf far below the cliff.

**5. The Pool.** 11:30 → 11:42 (card 4, 11:36), 13 s, `pool` view, locked off.
- *Moves:* the float drifting and turning, caustics on the floor, the umbrella breathing. The towel, the book and the glass are left out, and the wind lifts a page of the book and turns it (optional, but my favorite trace in the film).
- *Sound:* water at the coping, the skimmer, ice settling in the glass, the page.
- *Music:* the first notes of the score come in here: the radio's tune, remembered on electric piano.

**6. The Beach.** 14:06 → 14:18 (card 5, 2:12 p.m.), 13 s, `tower` view, locked off.
- *Moves:* the tower flag snapping, the rack with its gap (the visitor is out surfing), the towel and umbrella on the sand.
- *Sound:* big surf behind us, wind, the flag and its halyard ringing the pole, gulls.

**7. The Shore.** 14:40 → 15:05, 13 s, `shore` view, locked off.
- *Moves:* waves coming in line after line, swash running up the sand, a line of pelicans gliding low along the surf, the pier.
- *Sound:* surf close and in step with the lines on screen, gulls.

**8. From the Pier.** 16:06 → 16:18 (card 6, 4:12 p.m.), 10 s, `pier` view, locked off.
- *Moves:* looking back at the beach and the town, glitter starting on the water.
- *Sound:* water slapping the pilings, the planks creaking, wind.

**9. The Marina.** 18:00 → 18:12 (card 7, 6:06 p.m.), 13 s, `harbor` view, locked off.
- *Moves:* boats bobbing, masts upside down in the water, the red sloop's slip empty. Far out, a small white sail heading for the harbor mouth.
- *Sound:* halyards clinking, water among the hulls, fenders squeaking, a bell buoy far off.

**10. The Boulevard at sunset.** 18:42 → 18:56 (card 8, 6:48 p.m.), 19 s, `sunset` view, a slow push down the street.
- *Moves:* the sun going down straight down the middle of the boulevard. The street lamps and the neon catch at the end.
- *Sound:* wind, distant surf at the bottom of the hill, the lamps' relays clunking and their hum rising.
- *Music:* the climax. The score lifts a key as the sun touches the horizon.

**11. The Lighthouse.** 19:20 → 19:30 (card 9, 7:27 p.m.), 10 s, `lighthouse` view, locked off.
- *Moves:* the beacon flashing its characteristic (one flash every 6 s). The red sloop comes home past the breakwater with its sails full, and has gone into the harbor by the card moment.
- *Sound:* waves on the rocks, the bell buoy, one long foghorn at the end.

**12. The Motel, coming home.** 20:44 → 20:52, 16 s, `front` view, slow pan.
- *Moves:* headlights up the coast highway, the turn into the lot, the car into its stall. The lights go off, then one room's window lights up, and the NO in NO VACANCY buzzes on.
- *Sound:* **the same song on the radio**, cut again when the key turns. The door, then a room door across the lot. Crickets and the neon.

**13. The Motel, later.** 21:56 → 22:04 (card 10, 10:00 p.m.), 13 s, `front` view, locked off.
- *Moves:* the last postcard. The moon, the neon, the car home.
- *Caption:* "Wish you were here." Fade to black.

**Titles.** On black, about 9 s: PALOMA BAY, and a line such as "Every picture, sound and note made from rules". The tune plays once on a music box and stops short, as the attract mode ends.

## Continuity

The film, the book and the site keep one schedule, so a few things have to line up:
- **Breakfast.** The schedule has the car at the diner from 7:36, but the film shows it arriving at 8:14. Moving the visitor's departure from the motel to 8:10 fixes this. It changes nothing in the book, and on the site the car stays at the motel a little longer.
- **The sloop** is back in its slip at 7:24 p.m. It passes the lighthouse just before, which is why it has left the frame by card 9.
- **The surfboard** is back on the sand at 3:06 p.m. It is still out in shot 7 and back by shot 8.
- **Coming home.** The car gets back to the motel at 8:48 p.m., as the schedule already says, and NO VACANCY comes on after it.

## Captions and titles

The type is the town's own lettering: the stroke alphabet the neon signs are made from, drawn thin and letterspaced, white with a soft shadow. That keeps every pixel ours, with no font files, and it matches the signs in the pictures. At each card moment a lower-third fades up for about 3 s, for example **THE DINER · 8:18 A.M.**

*Alternative:* no captions at all, only the opening and closing titles.

## Animation: what exists and what's new

**Already built** (from the attract-mode film): palms and fan palms in the wind, boats heaving and pitching, breakers surging and the swash running up the sand, the tower flag, gulls, drifting clouds, water ripples on their own clock, the float, the driving car with lit headlights, the sloop with sails that hoist, neon and lamp power, NO VACANCY switching.

**New, needed for this plan** (rough effort)
- Captions and titles in the sign lettering (2–3 h)
- The car's path for the diner view, and camera moves with easing (2 h)
- Motion blur on the moving car, by averaging sub-frames (1 h)
- The visitor's room light: one window on its own switch (30 min)
- The lighthouse's flash characteristic (30 min)
- The sloop coming home past the lighthouse (1 h)

**New, optional**
- The wind turning a page of the book (2–3 h)
- A lawn sprinkler at the house (3 h)
- Pelicans along the surf (1 h)
- Twinkling stars (30 min)
- The umbrella canvas breathing in the wind (1 h)

## Sound

**Principles**
1. The place is the soundtrack. Every shot has its own bed, all synthesized: nothing recorded, nothing sampled.
2. Sound leads the picture. Each place's sound starts half a second to a second before the cut (a J-cut), so cuts feel like turning your head rather than changing channels.
3. Perspective. Level, tone and echo follow distance, and the stereo position follows the source's direction on screen.
4. Sync. Surf breaks when the lines on screen do, the flag cracks when it snaps, halyards ring as the boats roll, and the neon clicks on the frames it flickers.
5. Mix. About −16 LUFS overall with plenty of dynamics. Beds sit well under the music, and some shots (2, 4, 8) have no music at all.

**New sounds to build**
- Birds and animals: mourning dove, mockingbird, pelican wingbeats (a soft whoosh)
- Motel: a truck passing on the highway (Doppler), the motel ice machine
- Water: a pool skimmer, water slapping pilings, waves on rocks
- Machinery and objects: an impact sprinkler, a page turning, creaking planks, fender squeaks
- The harbor: a bell buoy, a foghorn
- Street and car: lamp relays with ballast hum, the car radio, tires turning in off the road

**Already built**
Surf, crickets, gulls, songbirds, wind, water lapping, halyards, the engine that follows the car's speed, the door, relay clicks, neon hum.

**The car radio.** This is the one device that carries the visitor. The song plays from the convertible as it arrives at breakfast and stops dead when the key turns. It comes back when the car comes home, and stops again. The score then finishes the song for the ending. On the radio the song is thin, mono and a little saturated, and it sits where the car is on screen.

## Music

A slow city-pop ballad built on the same theme as the attract-mode film: the same song, remembered. It runs at 76 bpm in D, on electric piano, soft pads, a fretless-style bass and brushes, with the melody on a soft FM horn. No drum machine.

| Where | What plays |
|---|---|
| Shots 1–2 | no score, only the town waking up |
| Shot 3 | the song, on the car radio |
| Shots 4–5 | quiet, then the electric piano takes up the radio's tune |
| Shots 6–9 | the band, lightly |
| Shot 10 | the full theme, lifting to E as the sun touches the horizon |
| Shot 11 | one held chord, with a bell on each flash of the beacon |
| Shot 12 | the radio again |
| Shot 13 and titles | the score finishes the song, then the music box |

## Deliverables

1. **The film**, 16:9, about 2:55.
2. **From the same renders:** a 30-second trailer and new postcard stills.
3. **Separate short renders:** five 24-hour time-lapses (one fixed shot per place, 30 s each, looping at midnight) and five 9:16 living-postcard loops for social media.

**Hosting.** A few minutes of painted 1080p will be too big to keep in git, probably 60–150 MB. The plan:
- publish the master as a GitHub Release file;
- keep a web-sized version for the site page;
- upload to YouTube or Vimeo yourself if you want it shared widely.

## Rendering and compute

**Measured here:** a full-quality 1080p frame takes 4 to 8 seconds on one core.

| Job | Frames | Core-hours | This sandbox (4 cores) | GitHub Actions (80 cores) |
|---|---|---|---|---|
| The film, 1080p | ~4,250 | ~7 | ~2 h | ~10 min |
| The film, 4K | ~4,250 | ~28 | ~7 h | ~30 min |
| Time-lapses and verticals | ~4,600 | ~6 | ~1.5 h | ~10 min |

**GitHub Actions** is the way to get more compute. The repo is public, so GitHub's standard runners are free: 4 cores each and 20 jobs at once. A render workflow splits the film into 20 slices, one per job, and each job renders its slice losslessly. A final job joins the slices, adds the soundtrack, encodes the deliverables and publishes them. I can start runs, watch them and pull the results back from here. Nothing else is needed from you except the go-ahead to add the workflow.

**Other options**
- Cloud GPU and compute providers (Modal, RunPod, Lambda, AWS, GCP, Fly) are all reachable from here. But they need an account and an API key from you, and they cost money. GPUs wouldn't help much anyway, because the engine runs on the CPU.
- Any machine with Node and ffmpeg can run the render script too.

## Production steps

1. **Direction.** Agree this plan: shots, captions, music, extras.
2. **Animatic.** A quick low-resolution draft of the whole cut with the full soundtrack, for timing and feel. It takes about 15 minutes to render here.
3. **Build** the new animations and sounds, and compose and arrange the score.
4. **Look tests.** 1080p stills of every shot at its card moment, to check against the book.
5. **Final render** on GitHub Actions, then the cutdowns.
6. **Publish:** a film page on the site, the release, and the README.

## Questions for you

1. Length: the full cut (~2:55) or the tighter one (~2:15)?
2. Captions at each postcard moment, or titles only?
3. Music: the score with the car-radio device (my pick), ambience only, or a full song start to finish?
4. Which optional animations: the page turn, the sprinkler, pelicans, stars, the umbrella?
5. A 1080p or 4K master?
6. OK to add the GitHub Actions render workflow to the repo?
