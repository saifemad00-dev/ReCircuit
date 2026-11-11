// =====================================================================
// APPLICATION LAYER
// All business rules live here, split into the modules from the
// component diagram: Auth, Listings & Requests, Recycling & Pickup,
// Impact Tracking and Admin. The UI never changes data directly, it
// always calls one of these functions. Each function throws an Error
// with a clear message when a rule is broken (NFR5).
// =====================================================================

const SESSION_HOURS = 8;

function fail(message) {
  throw new Error(message);
}

function findById(list, id) {
  return db.data[list].find(item => item.id === id);
}

// ---------------------------------------------------------------------
// Auth module (FR1, NFR1)
// ---------------------------------------------------------------------

const Auth = {
  current() {
    const s = db.data.session;
    if (!s) return null;
    if (Date.now() > s.expires) {          // expired session = logged out
      db.data.session = null;
      db.save();
      return null;
    }
    return findById("users", s.userId) || null;
  },

  require() {
    const user = this.current();
    if (!user) fail("Please log in first.");
    return user;
  },

  requireAdmin() {
    const user = this.require();
    if (user.role !== "admin") fail("Only an administrator can do this.");
    return user;
  },

  async register(name, email, password) {
    name = name.trim();
    email = email.trim().toLowerCase();
    if (!name) fail("Enter your full name.");
    if (!email.endsWith("@" + CAMPUS_DOMAIN)) fail("Use your university email (@" + CAMPUS_DOMAIN + ").");
    if (password.length < 8) fail("Password must be at least 8 characters.");
    if (db.data.users.some(u => u.email === email)) fail("An account with this email already exists.");

    const salt = newId();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    db.data.users.push({
      id: newId(), name, email, role: "student", verified: false, verifyCode: code,
      salt, passwordHash: await hashPassword(password, salt)
    });
    db.save();
    return code; // a real system would email this code
  },

  verify(email, code) {
    const user = db.data.users.find(u => u.email === email.trim().toLowerCase());
    if (!user) fail("No account found for this email.");
    if (user.verifyCode !== code.trim()) fail("That code is not correct.");
    user.verified = true;
    delete user.verifyCode;
    db.save();
  },

  async login(email, password) {
    const user = db.data.users.find(u => u.email === email.trim().toLowerCase());
    if (!user) fail("Email or password is incorrect.");
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.passwordHash) fail("Email or password is incorrect.");
    if (!user.verified) fail("Verify your email before logging in.");
    db.data.session = { userId: user.id, expires: Date.now() + SESSION_HOURS * 3600000 };
    db.save();
    return user;
  },

  logout() {
    db.data.session = null;
    db.save();
  }
};

// ---------------------------------------------------------------------
// Listings module (FR2, FR3, FR4, FR6)
// Listing states: Draft -> Published -> Reserved -> Completed
//                 any open state -> Removed
//                 Reserved -> Published (reservation cancelled)
// ---------------------------------------------------------------------

function checkListingFields(f) {
  if (!f.title.trim()) fail("Enter the device name.");
  if (!CATEGORIES.includes(f.category)) fail("Choose a category.");
  if (!CONDITIONS.includes(f.condition)) fail("Choose the condition.");
  if (!TYPES.includes(f.type)) fail("Choose sell, swap or donate.");
  if (f.type === "Sell" && !(Number(f.price) > 0)) fail("Enter a price for items you are selling.");
  if (!f.description.trim()) fail("Add a short description.");
}

function ownListing(id) {
  const user = Auth.require();
  const listing = findById("listings", id);
  if (!listing) fail("Listing not found.");
  if (listing.ownerId !== user.id) fail("You can only change your own listings.");
  return listing;
}

const Listings = {
  get(id) {
    return findById("listings", id);
  },

  create(fields, publish) {
    const user = Auth.require();
    checkListingFields(fields);
    const listing = {
      id: newId(), ownerId: user.id,
      title: fields.title.trim(), category: fields.category, condition: fields.condition,
      type: fields.type, price: fields.type === "Sell" ? Number(fields.price) : 0,
      description: fields.description.trim(),
      status: publish ? "Published" : "Draft", reports: [], createdAt: new Date().toISOString()
    };
    db.data.listings.push(listing);
    db.save();
    return listing;
  },

  update(id, fields) {
    const listing = ownListing(id);
    if (listing.status === "Completed" || listing.status === "Removed") fail("This listing can no longer be edited.");
    checkListingFields(fields);
    Object.assign(listing, {
      title: fields.title.trim(), category: fields.category, condition: fields.condition,
      type: fields.type, price: fields.type === "Sell" ? Number(fields.price) : 0,
      description: fields.description.trim()
    });
    db.save();
  },

  publish(id) {
    const listing = ownListing(id);
    if (listing.status !== "Draft") fail("Only drafts can be published.");
    listing.status = "Published";
    db.save();
  },

  remove(id) {
    const user = Auth.require();
    const listing = findById("listings", id);
    if (!listing) fail("Listing not found.");
    if (listing.ownerId !== user.id && user.role !== "admin") fail("You can only remove your own listings.");
    if (listing.status === "Completed") fail("A completed handoff cannot be removed.");
    listing.status = "Removed";
    // open requests on a removed listing are declined
    db.data.requests
      .filter(r => r.listingId === id && (r.status === "Pending" || r.status === "Accepted"))
      .forEach(r => { r.status = "Declined"; });
    db.save();
  },

  // FR4: only published listings show up in search
  search({ text = "", category = "", type = "", condition = "" }) {
    const q = text.trim().toLowerCase();
    return db.data.listings
      .filter(l => l.status === "Published")
      .filter(l => !q || (l.title + " " + l.description).toLowerCase().includes(q))
      .filter(l => !category || l.category === category)
      .filter(l => !type || l.type === type)
      .filter(l => !condition || l.condition === condition)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  mine() {
    const user = Auth.require();
    return db.data.listings
      .filter(l => l.ownerId === user.id && l.status !== "Removed")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  report(id, reason) {
    const user = Auth.require();
    const listing = findById("listings", id);
    if (!listing) fail("Listing not found.");
    if (!reason.trim()) fail("Tell us what is wrong with this listing.");
    if (listing.reports.some(r => r.by === user.id)) fail("You already reported this listing.");
    listing.reports.push({ by: user.id, reason: reason.trim(), at: new Date().toISOString() });
    db.save();
  },

  cancelReservation(id) {
    const listing = ownListing(id);
    if (listing.status !== "Reserved") fail("This listing is not reserved.");
    const req = db.data.requests.find(r => r.listingId === id && r.status === "Accepted");
    if (req) req.status = "Cancelled";
    listing.status = "Published";
    delete listing.reservedFor;
    db.save();
  },

  // FR6 + FR7 + NFR5: a handoff only counts after the owner confirms it
  // and ticks every step of the wipe checklist
  confirmHandoff(id, allStepsChecked) {
    const listing = ownListing(id);
    if (listing.status !== "Reserved") fail("Only a reserved listing can be completed.");
    if (!allStepsChecked) fail("Tick every step of the wipe checklist before handing over the device.");
    const req = db.data.requests.find(r => r.listingId === id && r.status === "Accepted");
    listing.status = "Completed";
    if (req) req.status = "Completed";
    db.data.requests
      .filter(r => r.listingId === id && r.status === "Pending")
      .forEach(r => { r.status = "Declined"; });
    db.data.impact.push({
      id: newId(), action: "Reused", category: listing.category, title: listing.title,
      ownerId: listing.ownerId, receiverId: listing.reservedFor, at: new Date().toISOString()
    });
    db.save();
  }
};

// ---------------------------------------------------------------------
// Requests module (FR5)
// ---------------------------------------------------------------------

const Requests = {
  send(listingId, message) {
    const user = Auth.require();
    const listing = findById("listings", listingId);
    if (!listing) fail("Listing not found.");
    if (listing.status !== "Published") fail("This item is no longer available.");
    if (listing.ownerId === user.id) fail("You cannot request your own listing.");
    if (db.data.requests.some(r => r.listingId === listingId && r.fromId === user.id && r.status === "Pending")) {
      fail("You already sent a request for this item.");
    }
    db.data.requests.push({
      id: newId(), listingId, fromId: user.id, message: message.trim(),
      status: "Pending", createdAt: new Date().toISOString()
    });
    db.save(); // the owner sees the request on their listing ("notification")
  },

  forListing(listingId) {
    return db.data.requests.filter(r => r.listingId === listingId);
  },

  sentByMe() {
    const user = Auth.require();
    return db.data.requests
      .filter(r => r.fromId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  accept(requestId) {
    const req = findById("requests", requestId);
    if (!req) fail("Request not found.");
    const listing = ownListing(req.listingId);
    if (listing.status !== "Published") fail("This listing is already reserved or closed.");
    if (req.status !== "Pending") fail("This request is no longer pending.");
    req.status = "Accepted";
    listing.status = "Reserved";
    listing.reservedFor = req.fromId;
    db.save();
  },

  decline(requestId) {
    const req = findById("requests", requestId);
    if (!req) fail("Request not found.");
    ownListing(req.listingId);
    if (req.status !== "Pending") fail("This request is no longer pending.");
    req.status = "Declined";
    db.save();
  },

  cancel(requestId) {
    const user = Auth.require();
    const req = findById("requests", requestId);
    if (!req || req.fromId !== user.id) fail("Request not found.");
    if (req.status !== "Pending" && req.status !== "Accepted") fail("This request cannot be cancelled.");
    if (req.status === "Accepted") {
      const listing = findById("listings", req.listingId);
      listing.status = "Published";             // cancelled reservation reopens the listing
      delete listing.reservedFor;
    }
    req.status = "Cancelled";
    db.save();
  }
};

// ---------------------------------------------------------------------
// Recycling & Pickup module (FR8, FR9, NFR2)
// Pickup states: Requested -> Scheduled -> Collected, or Cancelled
// ---------------------------------------------------------------------

const Recycling = {
  points() {
    return db.data.points;
  },

  requestPickup({ device, category, address, slot }) {
    const user = Auth.require();
    if (!device.trim()) fail("Enter the device you want collected.");
    if (!CATEGORIES.includes(category)) fail("Choose a category.");
    if (!address.trim()) fail("Enter the pickup address.");
    if (!slot) fail("Choose a preferred date and time.");
    if (new Date(slot) <= new Date()) fail("The pickup time must be in the future.");
    db.data.pickups.push({
      id: newId(), userId: user.id, device: device.trim(), category,
      address: address.trim(), slot, status: "Requested", createdAt: new Date().toISOString()
    });
    db.save();
  },

  mine() {
    const user = Auth.require();
    return db.data.pickups.filter(p => p.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  cancel(id) {
    const user = Auth.require();
    const p = findById("pickups", id);
    if (!p || p.userId !== user.id) fail("Pickup not found.");
    if (p.status !== "Requested" && p.status !== "Scheduled") fail("This pickup can no longer be cancelled.");
    p.status = "Cancelled";
    db.save();
  }
};

// ---------------------------------------------------------------------
// Impact Tracking module (FR10)
// Only confirmed handoffs and collected pickups create impact records.
// ---------------------------------------------------------------------

const Impact = {
  summary(records) {
    const reused = records.filter(r => r.action === "Reused").length;
    const recycled = records.filter(r => r.action === "Recycled").length;
    const kg = records.reduce((sum, r) => sum + (WEIGHT_KG[r.category] || 0), 0);
    return { reused, recycled, kg };
  },

  mine() {
    const user = Auth.require();
    return db.data.impact
      .filter(r => r.ownerId === user.id || r.receiverId === user.id)
      .sort((a, b) => b.at.localeCompare(a.at));
  },

  campus() {
    return db.data.impact;
  }
};

// ---------------------------------------------------------------------
// Admin module (FR11)
// ---------------------------------------------------------------------

const Admin = {
  reported() {
    Auth.requireAdmin();
    return db.data.listings.filter(l => l.reports.length > 0 && l.status !== "Removed");
  },

  dismissReports(listingId) {
    Auth.requireAdmin();
    findById("listings", listingId).reports = [];
    db.save();
  },

  pickups() {
    Auth.requireAdmin();
    return db.data.pickups.slice().sort((a, b) => a.slot.localeCompare(b.slot));
  },

  schedulePickup(id) {
    Auth.requireAdmin();
    const p = findById("pickups", id);
    if (p.status !== "Requested") fail("Only new requests can be scheduled.");
    p.status = "Scheduled";
    db.save();
  },

  // a pickup only counts as recycled once someone has actually collected it
  completePickup(id) {
    Auth.requireAdmin();
    const p = findById("pickups", id);
    if (p.status !== "Scheduled") fail("Schedule the pickup before marking it collected.");
    p.status = "Collected";
    db.data.impact.push({
      id: newId(), action: "Recycled", category: p.category, title: p.device,
      ownerId: p.userId, at: new Date().toISOString()
    });
    db.save();
  },

  cancelPickup(id) {
    Auth.requireAdmin();
    const p = findById("pickups", id);
    if (p.status === "Collected") fail("A collected pickup cannot be cancelled.");
    p.status = "Cancelled";
    db.save();
  }
};
