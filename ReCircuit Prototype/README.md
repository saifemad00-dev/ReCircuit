# ReCircuit prototype

A working prototype of ReCircuit, the campus e-waste reuse and recycling app from our INT305 report.
It uses plain HTML, CSS and JavaScript. There are no libraries and no build step.

## How to run

Double-click `index.html`. It opens in any modern browser (Chrome, Edge, Firefox).
All data is saved in the browser (localStorage). Use "Reset sample data" in the footer to start again.

Sample accounts:

| Email | Password | Role |
| --- | --- | --- |
| layla@campus.ac.ae | demo1234 | student |
| omar@campus.ac.ae | demo1234 | student |
| noor@campus.ac.ae | demo1234 | staff |
| admin@campus.ac.ae | admin1234 | admin |

To use the real university domain, change `CAMPUS_DOMAIN` at the top of `js/data.js`.

## Files and the three-tier architecture

| File | Layer | What it does |
| --- | --- | --- |
| `index.html`, `css/style.css`, `js/ui.js` | Presentation | Screens, forms, buttons |
| `js/logic.js` | Application | Auth, Listings, Requests, Recycling, Impact, Admin modules and all rules |
| `js/data.js` | Data | Stores users, listings, requests, pickups, drop-off points, impact records |

## Requirements covered

| Req | Where in the prototype |
| --- | --- |
| FR1 | Register with a university email, verify with a code, log in (`Auth`) |
| FR2, FR3 | List a device, edit, remove; category, condition, sell/swap/donate, price, description |
| FR4 | Browse screen: search and filter by category, offer and condition |
| FR5 | Request an item from its page; the owner sees it under My listings |
| FR6 | Owner accepts a request (Reserved), then confirms the handoff (Completed) |
| FR7 | Wipe guide screen, and the checklist must be ticked before a handoff can be confirmed |
| FR8 | Recycle screen lists the campus drop-off points |
| FR9 | Pickup request with device, address and preferred time; incomplete requests are rejected |
| FR10 | My impact counts only confirmed handoffs and collected pickups |
| FR11 | Admin screen: review reported listings, remove or dismiss; manage pickups |
| NFR1 | Passwords stored as salted SHA-256 hashes; sessions expire after 8 hours |
| NFR2 | Pickup addresses are shown only to the requester and the admin |
| NFR5 | A listing is never completed without the confirm step; every failed action shows a clear message |
| NFR7 | Every field has a label, visible keyboard focus, readable contrast |

Listing states follow the state diagram: Draft, Published, Reserved, Completed, Removed.
Cancelling a reservation puts the listing back to Published.

## Test cases you can run by hand

1. Register with a `@gmail.com` address: you get "Use your university email".
2. Log in with a wrong password: you get "Email or password is incorrect".
3. As Layla, request the Dell laptop. Log in as Omar, open My listings, accept the request.
4. Click "Confirm handoff" without ticking the checklist: it is refused. Tick all steps: the listing is Completed and shows on My impact.
5. Try to list a "Sell" item with no price: it is refused.
6. Request a pickup as any user. Log in as admin, Schedule, then Mark collected: it shows as Recycled on that user's impact page.

## Limits of the prototype

- No real email is sent. The verification code is shown on screen.
- Data lives in one browser, so two people cannot use it together. The real system would use a cloud database (e.g. Firebase).
- No photos, maps or in-app messaging yet. Drop-off points are sample campus locations.
