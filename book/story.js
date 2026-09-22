// "Wish You Were Here": ten postcards from one summer day in Paloma Bay.
// Nobody appears in them. The visitor is a yellow convertible and the
// things it leaves behind, on the schedule in src/visitor.js, the same one
// the site keeps, so the book and the town always agree.

import { propsAt } from '../src/visitor.js';

export { clock } from '../src/visitor.js';

export const TITLE = 'Wish You Were Here';
export const SUBTITLE = 'Ten postcards from one summer day in Paloma Bay, sent by someone who never appears in any of them.';

const card = (place, view, hours, alt, text = '') => ({ place, view, hours, props: propsAt(place, hours), alt, text });

export const COVER = card(
  'beach',
  'sunset',
  18.72,
  'Sunset on the beach: a lifeguard tower in silhouette, the pier walking out to a low sun, long shadows on pink sand.',
);

export const PAGES = [
  card(
    'motel',
    'front',
    4.85,
    'Before dawn at a two-story motel: a pink MOTEL sign and a red NO VACANCY still burning, the sky paling behind the building.',
    'Ten to five. All night the sign has been telling an empty highway MOTEL, and since midnight NO VACANCY. Behind the building the sky is getting ready. One of the cars in the lot is yellow.',
  ),
  card(
    'boulevard',
    'diner',
    8.3,
    'A white streamline diner with red speed stripes and DINER on the roof; a yellow convertible at the curb outside.',
    'Breakfast is at the diner on the corner. The yellow car waits at the curb, pointed at the sea, the way you park when you already know where you are going next.',
  ),
  card(
    'house',
    'front',
    9.8,
    'A yellow convertible parked at the door of a white house, palm shadows falling across the wall.',
    'Mid-morning the car goes out to the house on the point and parks with its nose to the door. The palms print their shadows on the wall. The house has been waiting, the way houses by the sea do.',
  ),
  card(
    'house',
    'pool',
    11.6,
    'A white villa behind a turquoise pool, a red-and-white float, striped loungers under an open umbrella.',
    'Somebody has been at the pool: a towel on the middle lounger, a book face down to keep the place, a glass on the little table. The float is taking its time about the shallow end.',
  ),
  card(
    'beach',
    'tower',
    14.2,
    'A pale blue lifeguard tower on stilts, a rack of surfboards with one missing, a striped towel and a red umbrella on the sand.',
    'By two there is a towel on the sand, an umbrella shading nobody, and a gap in the rack where the blue board was.',
  ),
  card(
    'beach',
    'pier',
    16.2,
    'The beach seen from the pier: pastel beach houses, palms along the promenade, a few umbrellas, the lifeguard tower, the sea in the foreground.',
    'From halfway down the pier the beach looks barely started, like a page with one word on it. The blue board is back, lying on the sand next to the towel.',
  ),
  card(
    'marina',
    'harbor',
    18.1,
    'A marina seen from above: rows of sailboats and motor yachts in their slips, a breakwater, a red and white lighthouse, the open sea.',
    'At six the marina is full of boats going nowhere. One slip in the middle is empty. The red sloop has gone out past the lighthouse.',
  ),
  card(
    'boulevard',
    'sunset',
    18.8,
    'The sun going down exactly at the far end of the boulevard, between two long rows of palms.',
    'Twice a year the sun goes down exactly at the bottom of the boulevard. This is one of those evenings, and every palm on both sides of the street has lined up to watch.',
  ),
  card(
    'marina',
    'lighthouse',
    19.45,
    'Dusk on the breakwater: the lighthouse lit, its lamp burning over the water.',
    'The lighthouse comes on at dusk whether or not anyone is out there. This evening somebody was, and came in with the last of the light.',
  ),
  card(
    'motel',
    'front',
    22.0,
    'Night at the motel: the pink neon sign, NO VACANCY in red, lit windows, a yellow convertible back in the lot.',
    'The yellow car is back outside its door, and the sign has had second thoughts: NO VACANCY. Wish you were here.',
  ),
];
