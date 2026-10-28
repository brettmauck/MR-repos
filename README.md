# Mullet Buffet Tracker

Tracks Mullet Reviews' Chinese-buffet tour across the US.

- **Map tab**: every buffet as a numbered pin (visit order), joined by a dashed line showing the route. Latest stop is gold. Tap a pin for details.
- **Buffet Log tab**: a sortable table with date, name, address, Yelp ★, Mullet ★, delta (Mullet − Yelp), gooning / not gooning, pizza on the buffet, and cost for 2.
- Summary stats across the top (buffets, states, average ratings and delta, % gooning, % pizza, average cost).

## Using it
Open `index.html` through any static web server (e.g. `python3 -m http.server`) or host it free on GitHub Pages.

Addresses are turned into map pins automatically (free OpenStreetMap lookup). If one can't be found, enter latitude/longitude by hand under "Map location".

Data is saved in your browser. Use **Export JSON** to back it up and **Import JSON** to load it on another device. "Load demo data" fills in fake sample buffets to try things out.

No build step: plain HTML/CSS/JS plus [Leaflet](https://leafletjs.com) for the map.
