// One day of an unseen visitor to Paloma Bay: where their yellow car is at
// each hour, and what they leave behind in each place. The site and the
// book both read this, so the traces always agree.

import { clamp } from './math.js';

export const DAY = [
  { place: 'motel', to: 8.2 },
  { place: 'boulevard', to: 9.2 }, // breakfast at the diner, from a quarter past eight
  { place: 'house', to: 12.6 }, // a morning at the house on the point
  { place: 'beach', to: 17.2 },
  { place: 'marina', to: 19.7 }, // out on the red sloop, back by dusk
  { place: 'boulevard', to: 20.8 }, // dinner, after the sun went down the road
  { place: 'motel', to: 24 },
];

export function whereIs(hours) {
  for (const d of DAY) if (hours < d.to) return d.place;
  return DAY[DAY.length - 1].place;
}

// What a place looks like at an hour: the car, and the things left behind.
// Values are kept to a few states, so scrubbing the day only rarely asks
// for a new world.
export function propsAt(place, hours) {
  const car = whereIs(hours) === place;
  switch (place) {
    case 'motel':
      // The last room goes when the visitor gets back for the night, and
      // their window stays lit until a little before midnight.
      return { car, noVacancy: hours >= 20.8 || hours < 5.5, roomLight: hours >= 20.85 && hours < 23.7 ? 1 : 0 };
    case 'boulevard':
      return { car };
    case 'beach': {
      const there = hours >= 12.8 && hours < 17.2;
      return {
        car,
        towel: there,
        umbrella: there ? 'open' : null,
        board: hours >= 13.1 && hours < 15.1 ? 'gone' : there ? 'sand' : 'rack',
        // Footprints down to the water, and back; the evening tide and
        // the wind have them by morning.
        prints: hours >= 13.1 && hours < 23 ? (hours >= 15.1 ? 2 : 1) : 0,
      };
    }
    case 'house': {
      const there = hours >= 9.9 && hours < 12.6;
      return {
        car,
        towel: there,
        book: hours >= 10.2 && hours < 12.6,
        glass: hours >= 10.6,
        umbrella: there ? 'open' : 'closed',
        float: Math.round(clamp((hours - 6) / 15, 0, 1) * 8) / 8,
      };
    }
    case 'marina':
      return { car, sloop: hours >= 17.5 && hours < 19.4 ? 'out' : 'in' };
    default:
      return {};
  }
}

// 16.5 -> "4:30 p.m."
export function clock(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const H24 = (mm === 60 ? hh + 1 : hh) % 24;
  const m = mm === 60 ? 0 : mm;
  const h12 = H24 % 12 === 0 ? 12 : H24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${H24 < 12 ? 'a.m.' : 'p.m.'}`;
}
