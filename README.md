# Mullet Buffet Tracker

Tracks Mullet Reviews' Chinese-buffet tour across the US.

- **Map tab**: every buffet as a numbered pin (visit order), joined by a dashed line showing the route. Latest stop is gold. Tap a pin for details.
- **Buffet Log tab**: a sortable table with date, name, address, Yelp ★, Mullet ★, delta (Mullet − Yelp), gooning / not gooning, pizza on the buffet, and cost for 2.
- **Analytics tab**: state rankings (pizza, gooning, a state report card), buffet superlatives (best value, biggest letdowns, hidden gems, hall of fame/shame), hot takes, road-trip stats and a fortune cookie corner. All recalculated live from the buffet list.
- Summary stats across the top (buffets, states, average ratings and delta, % gooning, % pizza, average cost).

## Where the data lives
The buffet list is `data/buffets.json` in this repo, so every device and every visitor sees the same list.

- **Visitors** see the app read-only.
- **The editor** taps 🔑 and pastes a GitHub token once per device. Then Add / Edit / Delete save straight to `data/buffets.json` as a commit. Other devices see the change about a minute later, once GitHub Pages refreshes.

Creating the token: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token. Under Repository access pick *Only select repositories → MR-repos*. Under Permissions → Repository permissions set **Contents: Read and write**.

Addresses are turned into map pins automatically. The app tries the US Census Bureau geocoder, then OpenStreetMap, then Photon (all free, no key), and if none finds the exact street it pins the town/ZIP and says so. You can also type coordinates like `39.19, -84.24` as the address. If an address can't be found, enter latitude/longitude by hand under "Map location".

No build step: plain HTML/CSS/JS plus [Leaflet](https://leafletjs.com) for the map, hosted on GitHub Pages.
