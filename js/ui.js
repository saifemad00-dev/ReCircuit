// =====================================================================
// PRESENTATION LAYER
// Builds each screen as HTML and passes user actions to the
// application layer (logic.js). Screens are picked by the URL hash:
// #browse, #item/<id>, #mine, #new, #edit/<id>, #manage/<id>,
// #recycle, #guide, #impact, #admin
// =====================================================================

const app = document.getElementById("app");

let message = null;          // { text, kind } shown once at the top of the next screen
let authMode = "login";      // login | register | verify
let pendingEmail = "";       // email waiting for its verification code
let demoCode = "";           // shown on screen because the prototype cannot send emails
let filters = { text: "", category: "", type: "", condition: "" };
let guideCategory = "Phone";

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatSlot(value) {
  return new Date(value).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });
}

function offerText(listing) {
  if (listing.type === "Sell") return "AED " + listing.price.toLocaleString("en-US");
  return listing.type === "Swap" ? "Swap" : "Free";
}

function nameOf(userId) {
  const user = db.data.users.find(u => u.id === userId);
  return user ? user.name : "Unknown user";
}

function pill(status) {
  return `<span class="pill pill-${status.toLowerCase()}">${esc(status)}</span>`;
}

function options(values, selected, placeholder) {
  const first = placeholder ? `<option value="">${esc(placeholder)}</option>` : "";
  return first + values.map(v =>
    `<option ${v === selected ? "selected" : ""}>${esc(v)}</option>`).join("");
}

function nowForInput() {
  const d = new Date(Date.now() + 3600000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function notify(text, kind = "ok") {
  message = { text, kind };
}

// Runs an action from the application layer, shows the result and
// redraws the screen (or moves to another screen).
async function run(action, successText, nextHash) {
  try {
    await action();
    if (successText) notify(successText);
    if (nextHash && location.hash !== nextHash) {
      location.hash = nextHash;   // the hashchange event redraws
      return;
    }
  } catch (err) {
    notify(err.message, "error");
  }
  render();
  window.scrollTo(0, 0);
}

const logo = `
  <svg class="mark" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
    <path d="M11 3a8 8 0 1 1-7.3 4.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M1.8 3.6 3.7 7.8 8 6.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="11" cy="11" r="2.8" fill="currentColor"/>
  </svg>`;

// ---------------------------------------------------------------------
// Shell: top bar, message, page, footer
// ---------------------------------------------------------------------

function render() {
  const user = Auth.current();
  const [route, id] = location.hash.slice(1).split("/");

  let page;
  if (!user) {
    page = authPage();
  } else {
    const pages = {
      browse: browsePage, item: itemPage, mine: minePage, new: listingFormPage, edit: listingFormPage,
      manage: managePage, recycle: recyclePage, guide: guidePage, impact: impactPage, admin: adminPage
    };
    try {
      page = (pages[route] || browsePage)(id, user);
    } catch (err) {
      page = `<div class="empty"><p>${esc(err.message)}</p><a href="#browse">Go to browse</a></div>`;
    }
  }

  const note = message
    ? `<div class="message message-${message.kind}" role="${message.kind === "error" ? "alert" : "status"}">${esc(message.text)}</div>`
    : "";
  message = null;

  app.innerHTML = `
    ${user ? topBar(user, route || "browse") : ""}
    <main class="wrap">${note}${page}</main>
    <footer class="wrap footer">
      <span>ReCircuit prototype, INT305. Data is saved in this browser only.</span>
      <button class="link" data-action="reset">Reset sample data</button>
    </footer>`;

  showResults(); // fills the list when the browse screen is open
}

function topBar(user, route) {
  const links = [
    ["browse", "Browse"], ["mine", "My listings"], ["recycle", "Recycle"],
    ["guide", "Wipe guide"], ["impact", "My impact"]
  ];
  if (user.role === "admin") links.push(["admin", "Admin"]);
  const active = { item: "browse", new: "mine", edit: "mine", manage: "mine" }[route] || route;

  return `
    <header class="topbar">
      <div class="wrap topbar-inner">
        <a class="brand" href="#browse">${logo}<span>ReCircuit</span></a>
        <nav class="nav" aria-label="Main">
          ${links.map(([r, label]) =>
            `<a href="#${r}" ${r === active ? 'aria-current="page"' : ""}>${label}</a>`).join("")}
        </nav>
        <div class="who">
          <span>${esc(user.name)}</span>
          <button class="link" data-action="logout">Log out</button>
        </div>
      </div>
    </header>`;
}

// ---------------------------------------------------------------------
// Log in / register / verify (FR1)
// ---------------------------------------------------------------------

function authPage() {
  let form;
  if (authMode === "register") {
    form = `
      <form data-form="register" class="stack">
        <label>Full name <input name="name" autocomplete="name" required></label>
        <label>University email <input name="email" type="email" placeholder="name@${CAMPUS_DOMAIN}" required></label>
        <label>Password <input name="password" type="password" minlength="8" autocomplete="new-password" required>
          <small>At least 8 characters.</small></label>
        <button class="btn">Create account</button>
      </form>
      <p class="switch">Already registered? <button class="link" data-action="auth-mode" data-id="login">Log in</button></p>`;
  } else if (authMode === "verify") {
    form = `
      <p>We sent a 6-digit code to <strong>${esc(pendingEmail)}</strong>.</p>
      <p class="demo-note">Prototype only, no email is sent. Your code is <strong class="num">${esc(demoCode)}</strong>.</p>
      <form data-form="verify" class="stack">
        <label>Verification code <input name="code" inputmode="numeric" maxlength="6" required></label>
        <button class="btn">Verify email</button>
      </form>`;
  } else {
    form = `
      <form data-form="login" class="stack">
        <label>University email <input name="email" type="email" autocomplete="username" required></label>
        <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn">Log in</button>
      </form>
      <p class="switch">New to ReCircuit? <button class="link" data-action="auth-mode" data-id="register">Create an account</button></p>
      <div class="demo-note">
        <p>Sample accounts for the demo:</p>
        <p>layla@${CAMPUS_DOMAIN} / demo1234 (student)<br>
           omar@${CAMPUS_DOMAIN} / demo1234 (student)<br>
           admin@${CAMPUS_DOMAIN} / admin1234 (admin)</p>
      </div>`;
  }

  const titles = { login: "Log in", register: "Create your account", verify: "Verify your email" };

  return `
    <div class="auth">
      <section class="auth-intro">
        <p class="brand brand-large">${logo}<span>ReCircuit</span></p>
        <h1>Pass on your old devices, or recycle them properly</h1>
        <p>A campus app for students and staff. Sell, swap or donate phones, laptops and chargers to
           other people on campus, find where to drop off e-waste, and keep track of the devices you
           kept out of landfill.</p>
        <ul class="ticks">
          <li>Only verified @${CAMPUS_DOMAIN} accounts can join</li>
          <li>A wipe checklist before every handoff</li>
          <li>Only confirmed handoffs count on your impact page</li>
        </ul>
      </section>
      <section class="panel auth-form">
        <h2>${titles[authMode]}</h2>
        ${form}
      </section>
    </div>`;
}

// ---------------------------------------------------------------------
// Browse and search (FR4)
// ---------------------------------------------------------------------

function browsePage() {
  return `
    <div class="title-row">
      <h1>Browse devices</h1>
      <a class="btn" href="#new">List a device</a>
    </div>
    <form class="filters" data-form="filters" role="search">
      <label class="grow"><span class="sr">Search</span>
        <input name="text" type="search" placeholder="Search phones, laptops, chargers..." value="${esc(filters.text)}"></label>
      <label><span class="sr">Category</span><select name="category">${options(CATEGORIES, filters.category, "All categories")}</select></label>
      <label><span class="sr">Offer</span><select name="type">${options(TYPES, filters.type, "Sell, swap or donate")}</select></label>
      <label><span class="sr">Condition</span><select name="condition">${options(CONDITIONS, filters.condition, "Any condition")}</select></label>
    </form>
    <p class="count" id="count"></p>
    <div class="list" id="results"></div>`;
}

// Only the result list is redrawn while typing, so the search box keeps focus
function showResults() {
  const box = document.getElementById("results");
  if (!box) return;
  const me = Auth.current();
  const results = Listings.search(filters);
  document.getElementById("count").textContent =
    results.length === 1 ? "1 device available" : results.length + " devices available";

  box.innerHTML = results.length ? results.map(l => `
    <a class="row" href="#item/${l.id}">
      <span class="row-main">
        <strong>${esc(l.title)}</strong>
        <span class="meta">${esc(l.category)} · ${esc(l.condition)} · ${l.ownerId === me.id ? "Your listing" : esc(nameOf(l.ownerId))} · ${formatDate(l.createdAt)}</span>
      </span>
      <span class="row-end">
        <span class="offer offer-${l.type.toLowerCase()}">${esc(offerText(l))}</span>
      </span>
    </a>`).join("")
    : `<div class="empty"><p>No devices match these filters.</p>
         <button class="btn btn-quiet" data-action="clear-filters">Clear filters</button></div>`;
}

// ---------------------------------------------------------------------
// One listing, request it (FR5), report it
// ---------------------------------------------------------------------

function itemPage(id, user) {
  const l = Listings.get(id);
  if (!l || l.status === "Removed") throw new Error("This listing does not exist or was removed.");

  const myRequest = db.data.requests.find(r => r.listingId === id && r.fromId === user.id
    && (r.status === "Pending" || r.status === "Accepted"));

  let side;
  if (l.ownerId === user.id) {
    side = `<p>This is your listing.</p><a class="btn" href="#manage/${l.id}">Manage listing</a>`;
  } else if (myRequest) {
    side = `<p>${myRequest.status === "Accepted"
        ? `<strong>${esc(nameOf(l.ownerId))} accepted your request.</strong> Arrange the handoff with them on campus.`
        : `Request sent. ${esc(nameOf(l.ownerId))} will see it on their listing.`}</p>
      <button class="btn btn-quiet" data-action="cancel-request" data-id="${myRequest.id}">Cancel request</button>`;
  } else if (l.status !== "Published") {
    side = `<p>This item is no longer available.</p>`;
  } else {
    side = `
      <form data-form="request" data-id="${l.id}" class="stack">
        <label>Message to ${esc(nameOf(l.ownerId).split(" ")[0])}
          <textarea name="message" rows="4" placeholder="When and where could you meet?"></textarea></label>
        <button class="btn">Request this item</button>
      </form>
      <p class="hint">The owner wipes the device and confirms the handoff before it counts as reused.</p>`;
  }

  const alreadyReported = l.reports.some(r => r.by === user.id);
  const report = l.ownerId === user.id ? "" : alreadyReported
    ? `<p class="hint">You reported this listing. An admin will review it.</p>`
    : `<details class="report">
         <summary>Report this listing</summary>
         <form data-form="report" data-id="${l.id}" class="stack">
           <label>What is wrong? <input name="reason" required></label>
           <button class="btn btn-quiet">Send report</button>
         </form>
       </details>`;

  return `
    <a class="back" href="#browse">Back to browse</a>
    <div class="detail">
      <section class="panel">
        <div class="title-row tight"><h1>${esc(l.title)}</h1>${l.status !== "Published" ? pill(l.status) : ""}</div>
        <dl class="facts">
          <div><dt>Offer</dt><dd class="num">${esc(offerText(l))}</dd></div>
          <div><dt>Category</dt><dd>${esc(l.category)}</dd></div>
          <div><dt>Condition</dt><dd>${esc(l.condition)}</dd></div>
          <div><dt>Listed by</dt><dd>${esc(nameOf(l.ownerId))}</dd></div>
          <div><dt>Listed on</dt><dd>${formatDate(l.createdAt)}</dd></div>
        </dl>
        <h2>Description</h2>
        <p>${esc(l.description)}</p>
      </section>
      <aside class="panel side">${side}${report}</aside>
    </div>`;
}

// ---------------------------------------------------------------------
// My listings and the requests I sent
// ---------------------------------------------------------------------

function minePage() {
  const listings = Listings.mine();
  const sent = Requests.sentByMe();

  const listingRows = listings.map(l => {
    const pending = Requests.forListing(l.id).filter(r => r.status === "Pending").length;
    return `
      <tr>
        <td><a href="#manage/${l.id}">${esc(l.title)}</a></td>
        <td>${esc(offerText(l))}</td>
        <td>${pill(l.status)}</td>
        <td class="num">${pending ? `<strong>${pending} new</strong>` : "0"}</td>
        <td class="actions"><a href="#manage/${l.id}">Manage</a></td>
      </tr>`;
  }).join("");

  const sentRows = sent.map(r => {
    const l = Listings.get(r.listingId);
    const canCancel = r.status === "Pending" || r.status === "Accepted";
    return `
      <tr>
        <td><a href="#item/${l.id}">${esc(l.title)}</a></td>
        <td>${esc(nameOf(l.ownerId))}</td>
        <td>${formatDate(r.createdAt)}</td>
        <td>${pill(r.status)}</td>
        <td class="actions">${canCancel ? `<button class="link" data-action="cancel-request" data-id="${r.id}">Cancel</button>` : ""}</td>
      </tr>`;
  }).join("");

  return `
    <div class="title-row">
      <h1>My listings</h1>
      <a class="btn" href="#new">List a device</a>
    </div>
    <section class="panel flush">
      ${listings.length ? `
        <table>
          <thead><tr><th>Device</th><th>Offer</th><th>Status</th><th class="num">Requests</th><th></th></tr></thead>
          <tbody>${listingRows}</tbody>
        </table>` : `<div class="empty"><p>You have not listed anything yet.</p><a class="btn" href="#new">List a device</a></div>`}
    </section>

    <h2 class="section-title">Requests I sent</h2>
    <section class="panel flush">
      ${sent.length ? `
        <table>
          <thead><tr><th>Device</th><th>Owner</th><th>Sent</th><th>Status</th><th></th></tr></thead>
          <tbody>${sentRows}</tbody>
        </table>` : `<div class="empty"><p>When you request an item it shows up here.</p><a href="#browse">Browse devices</a></div>`}
    </section>`;
}

// ---------------------------------------------------------------------
// Create / edit listing (FR2, FR3)
// ---------------------------------------------------------------------

function listingFormPage(id) {
  const editing = Boolean(id);
  const l = editing ? Listings.get(id) : { title: "", category: "", condition: "", type: "Sell", price: "", description: "" };
  if (editing && !l) throw new Error("Listing not found.");

  return `
    <a class="back" href="${editing ? "#manage/" + id : "#mine"}">Back</a>
    <div class="title-row"><h1>${editing ? "Edit listing" : "List a device"}</h1></div>
    <form class="panel form-grid" data-form="listing" data-id="${id || ""}">
      <label class="full">Device name <input name="title" value="${esc(l.title)}" placeholder="e.g. HP EliteBook 840, 16 GB RAM" required></label>
      <label>Category <select name="category" required>${options(CATEGORIES, l.category, "Choose...")}</select></label>
      <label>Condition <select name="condition" required>${options(CONDITIONS, l.condition, "Choose...")}</select></label>
      <label>Offer <select name="type">${options(TYPES, l.type)}</select></label>
      <label id="price-field" ${l.type === "Sell" ? "" : "hidden"}>Price (AED)
        <input name="price" type="number" min="1" step="1" value="${l.price || ""}"></label>
      <label class="full">Description
        <textarea name="description" rows="4" placeholder="Age, faults, what is included" required>${esc(l.description)}</textarea></label>
      <div class="full buttons">
        ${editing
          ? `<button class="btn" name="intent" value="save">Save changes</button>`
          : `<button class="btn" name="intent" value="publish">Publish</button>
             <button class="btn btn-quiet" name="intent" value="draft">Save as draft</button>`}
      </div>
    </form>`;
}

// ---------------------------------------------------------------------
// Manage one listing: lifecycle, requests, handoff with wipe checklist
// (FR6, FR7)
// ---------------------------------------------------------------------

function lifecycle(status) {
  const steps = ["Draft", "Published", "Reserved", "Completed"];
  const at = steps.indexOf(status);
  return `
    <ol class="lifecycle" aria-label="Listing status">
      ${steps.map((s, i) => `<li class="${i < at ? "done" : i === at ? "now" : ""}">${s}</li>`).join("")}
    </ol>`;
}

function managePage(id, user) {
  const l = Listings.get(id);
  if (!l || l.ownerId !== user.id || l.status === "Removed") throw new Error("Listing not found.");
  const requests = Requests.forListing(id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  let actions = "";
  if (l.status === "Draft") {
    actions = `
      <p>This listing is a draft. Nobody else can see it yet.</p>
      <div class="buttons">
        <button class="btn" data-action="publish" data-id="${l.id}">Publish</button>
        <a class="btn btn-quiet" href="#edit/${l.id}">Edit</a>
        <button class="btn btn-quiet" data-action="remove" data-id="${l.id}">Remove</button>
      </div>`;
  } else if (l.status === "Published") {
    actions = `
      <p>Visible to everyone on campus. Accept a request below to reserve it.</p>
      <div class="buttons">
        <a class="btn btn-quiet" href="#edit/${l.id}">Edit</a>
        <button class="btn btn-quiet" data-action="remove" data-id="${l.id}">Remove</button>
      </div>`;
  } else if (l.status === "Reserved") {
    const steps = WIPE_GUIDES[l.category];
    actions = `
      <p>Reserved for <strong>${esc(nameOf(l.reservedFor))}</strong>. When you hand the device over,
         go through the wipe checklist and confirm the handoff.</p>
      <form data-form="handoff" data-id="${l.id}" class="checklist">
        <h3>Before you hand it over</h3>
        ${steps.map((s, i) => `<label class="check"><input type="checkbox" name="step${i}"> <span>${esc(s)}</span></label>`).join("")}
        <div class="buttons">
          <button class="btn">Confirm handoff</button>
          <button type="button" class="btn btn-quiet" data-action="cancel-reservation" data-id="${l.id}">Cancel reservation</button>
        </div>
      </form>`;
  } else if (l.status === "Completed") {
    const rec = db.data.impact.find(r => r.title === l.title && r.ownerId === l.ownerId && r.action === "Reused");
    actions = `<p>Handed over to <strong>${esc(nameOf(l.reservedFor))}</strong>${rec ? " on " + formatDate(rec.at) : ""}.
                 It now counts on your <a href="#impact">impact page</a>.</p>`;
  }

  const rows = requests.map(r => `
    <tr>
      <td>${esc(nameOf(r.fromId))}</td>
      <td class="msg">${r.message ? esc(r.message) : '<span class="faint">No message</span>'}</td>
      <td>${formatDate(r.createdAt)}</td>
      <td>${pill(r.status)}</td>
      <td class="actions">${r.status === "Pending" && l.status === "Published" ? `
        <button class="link" data-action="accept" data-id="${r.id}">Accept</button>
        <button class="link" data-action="decline" data-id="${r.id}">Decline</button>` : ""}</td>
    </tr>`).join("");

  return `
    <a class="back" href="#mine">Back to my listings</a>
    <div class="title-row"><h1>${esc(l.title)}</h1><span class="offer">${esc(offerText(l))}</span></div>
    ${lifecycle(l.status)}
    <section class="panel">${actions}</section>
    <h2 class="section-title">Requests</h2>
    <section class="panel flush">
      ${requests.length ? `
        <table>
          <thead><tr><th>From</th><th>Message</th><th>Sent</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>` : `<div class="empty"><p>No requests yet.</p></div>`}
    </section>`;
}

// ---------------------------------------------------------------------
// Recycle: drop-off points and pickups (FR8, FR9)
// ---------------------------------------------------------------------

function recyclePage() {
  const pickups = Recycling.mine();
  return `
    <div class="title-row"><h1>Recycle a device</h1></div>
    <p class="lead">If nobody can reuse it, take it to a campus drop-off point or ask for a pickup.
       Wipe it first with the <a href="#guide">wipe guide</a>.</p>
    <div class="two-col">
      <section>
        <h2 class="section-title">Drop-off points</h2>
        <div class="panel flush">
          ${Recycling.points().map(p => `
            <div class="point">
              <strong>${esc(p.name)}</strong>
              <span>${esc(p.location)}</span>
              <span class="meta">Accepts: ${esc(p.accepts)}</span>
              <span class="meta">${esc(p.hours)}</span>
            </div>`).join("")}
        </div>
      </section>
      <section>
        <h2 class="section-title">Request a pickup</h2>
        <form class="panel stack" data-form="pickup">
          <label>Device <input name="device" placeholder="e.g. Old desktop monitor" required></label>
          <label>Category <select name="category" required>${options(CATEGORIES, "", "Choose...")}</select></label>
          <label>Pickup address <textarea name="address" rows="2" placeholder="Building, room or dorm" required></textarea>
            <small>Only the collection team can see your address.</small></label>
          <label>Preferred time <input name="slot" type="datetime-local" min="${nowForInput()}" required></label>
          <button class="btn">Request pickup</button>
        </form>
      </section>
    </div>
    <h2 class="section-title">My pickups</h2>
    <section class="panel flush">
      ${pickups.length ? `
        <table>
          <thead><tr><th>Device</th><th>Preferred time</th><th>Status</th><th></th></tr></thead>
          <tbody>${pickups.map(p => `
            <tr>
              <td>${esc(p.device)}</td>
              <td>${formatSlot(p.slot)}</td>
              <td>${pill(p.status)}</td>
              <td class="actions">${p.status === "Requested" || p.status === "Scheduled"
                ? `<button class="link" data-action="cancel-pickup" data-id="${p.id}">Cancel</button>` : ""}</td>
            </tr>`).join("")}</tbody>
        </table>` : `<div class="empty"><p>You have not requested a pickup.</p></div>`}
    </section>`;
}

// ---------------------------------------------------------------------
// Wipe guide (FR7)
// ---------------------------------------------------------------------

function guidePage() {
  return `
    <div class="title-row"><h1>Wipe guide</h1></div>
    <p class="lead">ReCircuit cannot wipe a device for you. Follow these steps before you give,
       sell, swap or recycle anything that has held your data.</p>
    <div class="segmented" role="tablist">
      ${CATEGORIES.map(c => `<button role="tab" aria-selected="${c === guideCategory}"
          data-action="guide" data-id="${esc(c)}">${esc(c)}</button>`).join("")}
    </div>
    <section class="panel checklist">
      <h2>${esc(guideCategory)}</h2>
      ${WIPE_GUIDES[guideCategory].map(s =>
        `<label class="check"><input type="checkbox"> <span>${esc(s)}</span></label>`).join("")}
    </section>`;
}

// ---------------------------------------------------------------------
// Impact dashboard (FR10)
// ---------------------------------------------------------------------

function impactPage(id, user) {
  const records = Impact.mine();
  const mine = Impact.summary(records);
  const campus = Impact.summary(Impact.campus());

  const role = r => r.action === "Recycled" ? "Recycled" : r.ownerId === user.id ? "You gave it away" : "You received it";

  return `
    <div class="title-row"><h1>My impact</h1></div>
    <section class="panel kpis">
      <div><span class="label">Devices reused</span><span class="kpi num">${mine.reused}</span></div>
      <div><span class="label">Devices recycled</span><span class="kpi num">${mine.recycled}</span></div>
      <div><span class="label">Kept out of landfill (estimate)</span><span class="kpi num">${mine.kg.toFixed(1)}<small> kg</small></span></div>
    </section>
    <p class="hint">Only confirmed handoffs and collected pickups are counted. Cancelled or pending ones are not.</p>

    <h2 class="section-title">History</h2>
    <section class="panel flush">
      ${records.length ? `
        <table>
          <thead><tr><th>Date</th><th>Device</th><th>Category</th><th>What happened</th></tr></thead>
          <tbody>${records.map(r => `
            <tr>
              <td>${formatDate(r.at)}</td>
              <td>${esc(r.title)}</td>
              <td>${esc(r.category)}</td>
              <td><span class="action-${r.action.toLowerCase()}">${role(r)}</span></td>
            </tr>`).join("")}</tbody>
        </table>` : `<div class="empty"><p>Nothing yet. Your first confirmed handoff or pickup will show up here.</p></div>`}
    </section>

    <p class="campus">Across campus so far: <strong class="num">${campus.reused}</strong> devices reused,
       <strong class="num">${campus.recycled}</strong> recycled, about <strong class="num">${campus.kg.toFixed(1)} kg</strong> of e-waste avoided.</p>`;
}

// ---------------------------------------------------------------------
// Admin (FR11, NFR2: addresses only visible here and to the owner)
// ---------------------------------------------------------------------

function adminPage() {
  const reported = Admin.reported();
  const pickups = Admin.pickups();

  return `
    <div class="title-row"><h1>Admin</h1></div>
    <h2 class="section-title">Reported listings</h2>
    <section class="panel flush">
      ${reported.length ? `
        <table>
          <thead><tr><th>Listing</th><th>Owner</th><th>Reason</th><th></th></tr></thead>
          <tbody>${reported.map(l => `
            <tr>
              <td><a href="#item/${l.id}">${esc(l.title)}</a></td>
              <td>${esc(nameOf(l.ownerId))}</td>
              <td class="msg">${l.reports.map(r => esc(r.reason)).join("<br>")}</td>
              <td class="actions">
                <button class="link danger" data-action="admin-remove" data-id="${l.id}">Remove listing</button>
                <button class="link" data-action="dismiss" data-id="${l.id}">Dismiss</button>
              </td>
            </tr>`).join("")}</tbody>
        </table>` : `<div class="empty"><p>No reported listings.</p></div>`}
    </section>

    <h2 class="section-title">Pickup requests</h2>
    <section class="panel flush">
      ${pickups.length ? `
        <table>
          <thead><tr><th>Requested by</th><th>Device</th><th>Address</th><th>Preferred time</th><th>Status</th><th></th></tr></thead>
          <tbody>${pickups.map(p => `
            <tr>
              <td>${esc(nameOf(p.userId))}</td>
              <td>${esc(p.device)}</td>
              <td class="msg">${esc(p.address)}</td>
              <td>${formatSlot(p.slot)}</td>
              <td>${pill(p.status)}</td>
              <td class="actions">
                ${p.status === "Requested" ? `<button class="link" data-action="schedule" data-id="${p.id}">Schedule</button>` : ""}
                ${p.status === "Scheduled" ? `<button class="link" data-action="collected" data-id="${p.id}">Mark collected</button>` : ""}
                ${p.status === "Requested" || p.status === "Scheduled" ? `<button class="link danger" data-action="admin-cancel-pickup" data-id="${p.id}">Cancel</button>` : ""}
              </td>
            </tr>`).join("")}</tbody>
        </table>` : `<div class="empty"><p>No pickup requests.</p></div>`}
    </section>`;
}

// ---------------------------------------------------------------------
// Events: every button with data-action and every form with data-form
// ---------------------------------------------------------------------

const clickActions = {
  "logout":             () => run(() => Auth.logout(), "You are logged out.", "#"),
  "reset":              () => { if (confirm("Delete all changes and reload the sample data?")) db.reset(); },
  "auth-mode":          mode => { authMode = mode; render(); },
  "clear-filters":      () => { filters = { text: "", category: "", type: "", condition: "" }; render(); },
  "guide":              cat => { guideCategory = cat; render(); },
  "publish":            id => run(() => Listings.publish(id), "Listing published."),
  "remove":             id => { if (confirm("Remove this listing?")) run(() => Listings.remove(id), "Listing removed.", "#mine"); },
  "accept":             id => run(() => Requests.accept(id), "Request accepted. The listing is now reserved."),
  "decline":            id => run(() => Requests.decline(id), "Request declined."),
  "cancel-request":     id => run(() => Requests.cancel(id), "Request cancelled."),
  "cancel-reservation": id => run(() => Listings.cancelReservation(id), "Reservation cancelled. The listing is published again."),
  "cancel-pickup":      id => run(() => Recycling.cancel(id), "Pickup cancelled."),
  "admin-remove":       id => run(() => Listings.remove(id), "Listing removed."),
  "dismiss":            id => run(() => Admin.dismissReports(id), "Report dismissed."),
  "schedule":           id => run(() => Admin.schedulePickup(id), "Pickup scheduled."),
  "collected":          id => run(() => Admin.completePickup(id), "Pickup marked as collected and added to impact."),
  "admin-cancel-pickup": id => run(() => Admin.cancelPickup(id), "Pickup cancelled.")
};

const formActions = {
  filters: () => {},   // results already update while typing

  login: f => run(() => Auth.login(f.get("email"), f.get("password")), "", "#browse"),

  register: f => run(async () => {
    demoCode = await Auth.register(f.get("name"), f.get("email"), f.get("password"));
    pendingEmail = f.get("email").trim().toLowerCase();
    authMode = "verify";
  }),

  verify: f => run(() => {
    Auth.verify(pendingEmail, f.get("code"));
    authMode = "login";
  }, "Email verified. You can log in now."),

  listing: (f, form, submitter) => {
    const fields = {
      title: f.get("title"), category: f.get("category"), condition: f.get("condition"),
      type: f.get("type"), price: f.get("price"), description: f.get("description")
    };
    const id = form.dataset.id;
    if (id) {
      run(() => Listings.update(id, fields), "Changes saved.", "#manage/" + id);
    } else {
      const publish = submitter && submitter.value === "publish";
      run(() => Listings.create(fields, publish),
        publish ? "Your listing is live." : "Saved as a draft.", "#mine");
    }
  },

  request: (f, form) => run(() => Requests.send(form.dataset.id, f.get("message")), "Request sent to the owner."),

  report: (f, form) => run(() => Listings.report(form.dataset.id, f.get("reason")), "Thanks. An admin will review this listing."),

  handoff: (f, form) => {
    const boxes = form.querySelectorAll('input[type="checkbox"]');
    const allChecked = Array.from(boxes).every(b => b.checked);
    run(() => Listings.confirmHandoff(form.dataset.id, allChecked), "Handoff confirmed. It now counts as reused.");
  },

  pickup: f => run(() => Recycling.requestPickup({
    device: f.get("device"), category: f.get("category"), address: f.get("address"), slot: f.get("slot")
  }), "Pickup requested. The collection team will schedule it.")
};

document.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  e.preventDefault();
  clickActions[el.dataset.action](el.dataset.id);
});

document.addEventListener("submit", e => {
  const form = e.target;
  const handler = formActions[form.dataset.form];
  if (!handler) return;
  e.preventDefault();
  handler(new FormData(form), form, e.submitter);
});

document.addEventListener("input", e => {
  const filterForm = e.target.closest('[data-form="filters"]');
  if (filterForm) {
    filters[e.target.name] = e.target.value;
    showResults();
  }
  // show the price field only for "Sell"
  if (e.target.name === "type" && e.target.closest('[data-form="listing"]')) {
    document.getElementById("price-field").hidden = e.target.value !== "Sell";
  }
});

window.addEventListener("hashchange", render);

// Start the app
db.load().then(render);
