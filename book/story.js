// "Someone Was Just Here": one summer day at one house, eight pictures.
// Nobody appears. The story is carried by what moves between pages: a
// towel and a book arrive and go, the umbrella opens and closes, the float
// drifts from the deep end to the shallow end, and the car leaves.
//
// Cameras are functions of the layout so the shots follow the house.

export const SEED = 1981;

export const TITLE = 'Someone Was Just Here';
export const SUBTITLE = 'One summer day at a house by the sea, in eight pictures, drawn by an engine that has never seen a person.';

const pcz = (p) => (p.z0 + p.z1) / 2;

export const COVER = {
  alt: 'Golden hour at water level: a red-and-white float, a chrome ladder, palms, and the villa with its white fins and striped loungers.',
  hours: 17.35,
  props: { towel: true, book: true, glass: true, umbrella: 'open', car: true, float: 0.62 },
  camera: ({ pool: p, deck: d }) => ({ eye: [p.x0 + 0.4, d.y + 0.6, p.z1 - 0.2], target: [p.x1 + 6, 3.2, p.z0 - 2.5], fovY: 56 }),
};

export const PAGES = [
  {
    hours: 6.83,
    props: { towel: false, book: false, glass: false, umbrella: 'closed', car: true, float: 0.0 },
    camera: ({ pool: p }) => ({ eye: [p.x0 - 3.2, 1.45, pcz(p) + 3.2], target: [3, 3.1, pcz(p) - 3.5], fovY: 50 }),
    alt: 'Early morning. A still turquoise pool in front of a white two-story villa, backlit by a pale sky.',
    text: 'Ten to seven. The pool has not been touched yet, and neither has the day. The house is still deciding what color to be.',
  },
  {
    hours: 9.0,
    props: { towel: false, book: false, glass: false, umbrella: 'closed', car: true, float: 0.08 },
    camera: ({ car }) => ({ eye: [car.x + 8.5, 1.45, car.z + 6.2], target: [car.x - 3, 1.7, car.z - 1.5], fovY: 44 }),
    alt: 'A yellow convertible parked in front of a white wall striped with palm shadows, a globe lamp beside the drive.',
    text: 'Out front, the car sits with its top down, nose to the door, the way you leave a car when you mean to come right back.',
  },
  {
    hours: 11.4,
    props: { towel: true, book: true, glass: false, umbrella: 'closed', car: true, float: 0.18 },
    camera: ({ loungers: l }) => ({
      eye: [l.hx - 3.6, 1.95, l.zs[0] - 2.1],
      target: [l.hx - 1.1, 0.3, l.zs[1] + 0.2],
      fovY: 46,
    }),
    alt: 'Three blue-and-white striped loungers in hard midday light; a red striped towel lies folded on the middle one.',
    text: 'Someone has been down to the pool. A towel, folded twice. A book, left face-down to keep the page.',
  },
  {
    hours: 13.0,
    props: { towel: true, book: true, glass: true, umbrella: 'open', car: true, float: 0.36 },
    camera: ({ pool: p, deck: d }) => ({ eye: [p.x0 - 0.7, d.y + 0.45, p.z0 - 0.9], target: [p.x1, 5.5, p.z1], fovY: 62 }),
    alt: 'Seen from the water line: the villa in cool shade, an open umbrella, two palms against a deep blue sky.',
    text: 'By one o\'clock the umbrella is open and the shadows have crawled under things to stay cool. Nobody is steering the float.',
  },
  {
    hours: 15.2,
    props: { towel: true, book: true, glass: true, umbrella: 'open', car: true, float: 0.55 },
    camera: ({ villa: V, pool: p }) => ({
      eye: [V.ux0 - 0.4, V.U1 + 1.9, pcz(p) + 1.5],
      target: [p.x0 - 9, -1, pcz(p) - 2.5],
      fovY: 55,
    }),
    alt: 'Looking down from the roof: the pool with its float and diving board, the lawn, a white sea wall and the sea.',
    text: 'From the roof, the afternoon looks drawn with a ruler: one line for the pool, one for the wall, one for the sea.',
  },
  {
    hours: 18.25,
    props: { towel: false, book: false, glass: true, umbrella: 'closed', car: true, float: 0.78 },
    camera: ({ pool: p, bounds: b }) => ({ eye: [p.x1 + 1.3, 1.65, pcz(p) + 3], target: [b.x0 - 30, 1.4, pcz(p) - 3], fovY: 54 }),
    alt: 'Sunset across the pool: palms in silhouette, a low sun over the sea, the float drifting in the foreground.',
    text: 'The towel is gone, and the book. Someone careful has closed the umbrella. Then the sun comes down to the water to see what everyone was looking at.',
  },
  {
    hours: 19.75,
    props: { towel: false, book: false, glass: true, umbrella: 'closed', car: true, float: 1.0 },
    camera: ({ pool: p }) => ({ eye: [p.x0 - 3.5, 1.55, p.z1 + 4.5], target: [2, 3.4, p.z0 + 1], fovY: 52 }),
    alt: 'Dusk: the pool glows turquoise, the windows glow amber, stars come out over the villa.',
    text: 'At dusk the pool lights come on for whoever might still want a swim. The float has finally made it to the shallow end.',
  },
  {
    hours: 21.75,
    props: { towel: false, book: false, glass: true, umbrella: 'closed', car: false, float: 1.0 },
    camera: ({ car }) => ({ eye: [car.x + 9, 1.5, car.z + 6.5], target: [car.x - 2, 1.9, car.z - 1], fovY: 46 }),
    alt: 'Night: the empty drive, a lit globe lamp, moonlit palm shadows on the white wall.',
    text: 'Nobody is in any of these pictures. But the towel is gone, and the book, and now the car. Someone was just here.',
  },
];

export function clock(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const H24 = (mm === 60 ? hh + 1 : hh) % 24;
  const m = mm === 60 ? 0 : mm;
  const h12 = H24 % 12 === 0 ? 12 : H24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${H24 < 12 ? 'a.m.' : 'p.m.'}`;
}
