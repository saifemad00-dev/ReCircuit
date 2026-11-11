// =====================================================================
// DATA LAYER
// Stores users, listings, requests, pickups, drop-off points and impact
// records. In the real system this would be a cloud database (e.g.
// Firebase). In the prototype everything is saved in localStorage so the
// app works by just opening index.html.
// =====================================================================

const DB_KEY = "recircuit-data-v1";
const CAMPUS_DOMAIN = "campus.ac.ae"; // only emails ending with this can register

const CATEGORIES = ["Phone", "Laptop", "Tablet", "Charger & cables", "Accessory", "Other"];
const CONDITIONS = ["Like new", "Good", "Fair", "For parts"];
const TYPES = ["Sell", "Swap", "Donate"];

// Rough average weight per category, used for the "kept out of landfill" estimate
const WEIGHT_KG = {
  "Phone": 0.2, "Laptop": 2.0, "Tablet": 0.5,
  "Charger & cables": 0.15, "Accessory": 0.1, "Other": 0.5
};

// FR7: backup and secure-wipe checklist for each device category
const WIPE_GUIDES = {
  "Phone": [
    "Back up photos, contacts and chats (Google account or iCloud).",
    "Sign out of your Google account, or turn off Find My iPhone.",
    "Take out the SIM card and any memory card.",
    "Factory reset: Settings > System > Reset (Android) or Settings > General > Transfer or Reset iPhone > Erase All Content and Settings.",
    "Check that the phone restarts on the first setup screen."
  ],
  "Laptop": [
    "Copy your files to cloud storage or an external drive.",
    "Sign out of your Microsoft account or Apple ID, and of browser sync.",
    "Turn off Find My Device and save your BitLocker recovery key if you use it.",
    "Reset: Settings > System > Recovery > Reset this PC > Remove everything (Windows) or Erase All Content and Settings (Mac).",
    "Remove stickers or labels with your name or student ID."
  ],
  "Tablet": [
    "Back up photos, notes and app data.",
    "Sign out of your Google account or Apple ID.",
    "Remove any memory card.",
    "Factory reset the tablet from Settings.",
    "Check that it restarts on the first setup screen."
  ],
  "Charger & cables": [
    "Chargers and cables hold no personal data.",
    "Check for damage. Frayed cables or swollen adapters should be recycled, not reused."
  ],
  "Accessory": [
    "Unpair the device from your phone or laptop (Bluetooth settings).",
    "Reset smartwatches, earbuds or keyboards that store pairing data.",
    "Remove batteries if they come out, and recycle them separately."
  ],
  "Other": [
    "Remove any storage: USB drives, SD cards or hard drives.",
    "If the device has a factory reset option, use it.",
    "Remove labels with your name or contact details."
  ]
};

// ---------------------------------------------------------------------
// Small helpers used by every layer
// ---------------------------------------------------------------------

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// NFR1: passwords are stored as a salted SHA-256 hash, never as plain text
async function hashPassword(password, salt) {
  const text = salt + ":" + password;
  if (!window.crypto || !crypto.subtle) {
    // fallback for old browsers: simple (not secure) hash, prototype only
    let h = 0;
    for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h.toString(16);
  }
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

// ---------------------------------------------------------------------
// Sample data loaded the first time the prototype runs
// ---------------------------------------------------------------------

async function makeUser(name, email, password, role) {
  const salt = newId();
  return {
    id: newId(), name, email, role, verified: true,
    salt, passwordHash: await hashPassword(password, salt)
  };
}

async function createSampleData() {
  const layla = await makeUser("Layla Hassan", "layla@" + CAMPUS_DOMAIN, "demo1234", "student");
  const omar  = await makeUser("Omar Khalid", "omar@" + CAMPUS_DOMAIN, "demo1234", "student");
  const noor  = await makeUser("Noor Al Mansoori", "noor@" + CAMPUS_DOMAIN, "demo1234", "staff");
  const admin = await makeUser("Campus Admin", "admin@" + CAMPUS_DOMAIN, "admin1234", "admin");

  const listing = (owner, title, category, condition, type, price, description, days) => ({
    id: newId(), ownerId: owner.id, title, category, condition, type, price,
    description, status: "Published", reports: [], createdAt: daysAgo(days)
  });

  const listings = [
    listing(omar, "Dell Latitude 5490, 8 GB RAM, 256 GB SSD", "Laptop", "Good", "Sell", 650,
      "Used for two years of coursework. Battery holds about 4 hours. Charger included.", 2),
    listing(noor, "Samsung Galaxy A52, 128 GB", "Phone", "Fair", "Swap", 0,
      "Small crack in the corner of the screen, works fine. Looking to swap for a tablet.", 5),
    listing(omar, "USB-C 65 W charger", "Charger & cables", "Like new", "Donate", 0,
      "Came with a laptop I no longer have. Free to anyone who needs it.", 1),
    listing(noor, "iPad (6th generation), 32 GB", "Tablet", "Good", "Sell", 400,
      "Good for reading and notes. Comes with a case.", 9),
    listing(layla, "Logitech M185 wireless mouse", "Accessory", "Good", "Donate", 0,
      "Works well, I switched to a trackpad.", 3),
    listing(omar, "Casio fx-991EX calculator", "Other", "Like new", "Sell", 45,
      "Used for one semester of engineering maths.", 12)
  ];

  // one listing has a report, so the admin screen has something to review
  listings[5].reports.push({ by: layla.id, reason: "Not an electronic device that needs recycling?", at: daysAgo(1) });

  const points = [
    { id: newId(), name: "Library collection box", location: "Main library, ground floor by the entrance",
      accepts: "Phones, chargers, cables, small batteries", hours: "Sun to Thu, 8:00 to 20:00" },
    { id: newId(), name: "Engineering building drop-off", location: "Building C, ground floor next to the IT help desk",
      accepts: "Laptops, tablets, monitors, keyboards", hours: "Sun to Thu, 9:00 to 17:00" },
    { id: newId(), name: "Student services desk", location: "Student centre, first floor",
      accepts: "All small electronics", hours: "Sun to Thu, 9:00 to 16:00" }
  ];

  const impact = [
    { id: newId(), action: "Reused", category: "Laptop", title: "Lenovo ThinkPad T470",
      ownerId: noor.id, receiverId: layla.id, at: daysAgo(20) }
  ];

  return { users: [layla, omar, noor, admin], listings, requests: [], pickups: [], points, impact, session: null };
}

// ---------------------------------------------------------------------
// The database object the application layer talks to
// ---------------------------------------------------------------------

const db = {
  data: null,

  async load() {
    const saved = localStorage.getItem(DB_KEY);
    if (saved) {
      this.data = JSON.parse(saved);
    } else {
      this.data = await createSampleData();
      this.save();
    }
  },

  save() {
    localStorage.setItem(DB_KEY, JSON.stringify(this.data));
  },

  reset() {
    localStorage.removeItem(DB_KEY);
    location.hash = "";
    location.reload();
  }
};
