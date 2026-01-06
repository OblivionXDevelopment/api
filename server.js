import express from "express";
import fs from "fs";
import crypto from "crypto";
import cors from "cors";

const app = express();
const PORT = 3000;
const DB_FILE = "./database.json";

app.use(cors());
app.use(express.json());

// ---------- DATABASE ----------

function loadDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---------- UTIL ----------

function generateKey() {
  return `Oblivion-${rand()}-${rand()}-${rand()}`;
}

function rand() {
  return crypto.randomBytes(2).toString("hex").toUpperCase();
}

// ---------- CHECKPOINT ----------

app.post("/api/check-completion", (req, res) => {
  const { sessionId } = req.body;
  const db = loadDB();

  // Simulated completion (Lootlabs / Workink redirect verification)
  if (!db.sessions[sessionId]) {
    db.sessions[sessionId] = { completed: false };
    saveDB(db);
    return res.json({ completed: false });
  }

  // Mark complete after first poll
  db.sessions[sessionId].completed = true;
  saveDB(db);

  res.json({ completed: true });
});

// ---------- GENERATE KEY ----------

app.post("/api/generate-key", (req, res) => {
  const { sessionId, system } = req.body;
  const db = loadDB();

  if (!db.sessions[sessionId]?.completed)
    return res.json({ success: false, message: "Checkpoint not completed" });

  if (db.keys[sessionId])
    return res.json({ success: true, key: db.keys[sessionId].key });

  const hours = system === "lootlabs" ? 72 : 24;
  const expiresAt = Date.now() + hours * 60 * 60 * 1000;

  const key = generateKey();

  db.keys[sessionId] = {
    key,
    expiresAt,
    hwid: null
  };

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

// ---------- VALIDATE KEY (EXECUTOR) ----------

app.post("/api/validate-key", (req, res) => {
  const { key, hwid } = req.body;
  const db = loadDB();

  const entry = Object.values(db.keys).find(k => k.key === key);
  if (!entry)
    return res.json({ isValid: false, message: "Invalid key" });

  if (Date.now() > entry.expiresAt)
    return res.json({ isValid: false, message: "Key expired" });

  if (!entry.hwid) {
    entry.hwid = hwid; // bind first time
    saveDB(db);
  }

  if (entry.hwid !== hwid)
    return res.json({ isValid: false, message: "HWID mismatch" });

  res.json({
    isValid: true,
    expiresAt: new Date(entry.expiresAt).toISOString()
  });
});

app.listen(PORT, () =>
  console.log(`✅ OblivionX API running on port ${PORT}`)
);
