import express from "express";
import fs from "fs";
import crypto from "crypto";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = "./database.json";

app.use(cors());
app.use(express.json());

// ---------- SAFE DATABASE ----------

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const fresh = { sessions: {}, keys: {}, pendingVerifications: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }

  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    // Ensure the new verification object exists
    if (!data.pendingVerifications) data.pendingVerifications = {};
    return data;
  } catch {
    const fresh = { sessions: {}, keys: {}, pendingVerifications: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---------- HEALTH CHECK ----------

app.get("/", (req, res) => {
  res.send("✅ OblivionX API is running");
});

// ---------- UTIL ----------

function rand() {
  return crypto.randomBytes(2).toString("hex").toUpperCase();
}

function generateKey() {
  return `Oblivion-${rand()}-${rand()}-${rand()}`;
}

// ---------- KEY SYSTEM VERIFICATION ----------

/**
 * This endpoint is called when the user returns from the key system.
 * It unlocks the ability to generate a key for that sessionId.
 */
app.post("/api/verify-link", (req, res) => {
  const { sessionId } = req.body;
  const db = loadDB();

  if (!sessionId) return res.status(400).json({ success: false, message: "Missing sessionId" });

  // Mark this session as having completed the link
  db.pendingVerifications[sessionId] = {
    verified: true,
    timestamp: Date.now()
  };

  saveDB(db);
  res.json({ success: true, message: "Link completion recorded" });
});

// ---------- GENERATE KEY ----------

app.post("/api/generate-key", (req, res) => {
  const { sessionId, system } = req.body;
  const db = loadDB();

  if (!sessionId)
    return res.status(400).json({ success: false, message: "Missing sessionId" });

  // 1. If they already have a valid key, return it immediately
  if (db.keys[sessionId]) {
    return res.json({ success: true, key: db.keys[sessionId].key });
  }

  // 2. CHECK VERIFICATION: Has the link been completed?
  const verification = db.pendingVerifications[sessionId];
  
  if (!verification || !verification.verified) {
    return res.status(403).json({ 
      success: false, 
      message: "Please complete the key system link before generating a key." 
    });
  }

  // 3. Generate the key
  const hours = system === "lootlabs" ? 72 : 24;
  const expiresAt = Date.now() + hours * 60 * 60 * 1000;
  const key = generateKey();

  db.keys[sessionId] = {
    key,
    expiresAt,
    hwid: null
  };

  // 4. Consume the verification so it can't be used again for a new key
  delete db.pendingVerifications[sessionId];

  saveDB(db);

  res.json({ success: true, key });
});

// ---------- CHECK EXISTING KEY ----------

app.post("/api/check-key", (req, res) => {
  const { sessionId } = req.body;
  const db = loadDB();

  const entry = db.keys[sessionId];
  if (!entry)
    return res.json({ hasKey: false });

  if (Date.now() > entry.expiresAt)
    return res.json({ hasKey: false, expired: true });

  res.json({
    hasKey: true,
    key: entry.key,
    expired: false,
    expiresIn: Math.floor((entry.expiresAt - Date.now()) / 3600000)
  });
});

// ---------- VALIDATE KEY (FOR EXECUTOR) ----------

app.post("/api/validate-key", (req, res) => {
  const { key, hwid } = req.body;
  const db = loadDB();

  const entry = Object.values(db.keys).find(k => k.key === key);
  if (!entry)
    return res.json({ isValid: false, message: "Invalid key" });

  if (Date.now() > entry.expiresAt)
    return res.json({ isValid: false, message: "Key expired" });

  if (!entry.hwid || entry.hwid !== hwid) {
    entry.hwid = hwid;
    saveDB(db);
  }

  res.json({
    isValid: true,
    expiresAt: new Date(entry.expiresAt).toISOString()
  });
});

// ---------- START ----------

app.listen(PORT, () => {
  console.log(`✅ OblivionX API running on port ${PORT}`);
});
