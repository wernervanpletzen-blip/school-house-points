require("dotenv").config();

const { createHash, randomBytes, randomUUID } = require("node:crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

const app = express();
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
  dateStrings: true,
});

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://rexxar4-wq.github.io";
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const SESSION_TTL_MS = SESSION_HOURS * 60 * 60 * 1000;
const HOUSE_CODES = new Set(["houseA", "houseB"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const origin = req.get("origin");
  if (origin && origin !== FRONTEND_ORIGIN) {
    return res.status(403).json({ error: "Origin is not allowed." });
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "32kb" }));

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

function apiError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizedEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requiredText(value, label, maxLength) {
  if (typeof value !== "string") throw apiError(400, `${label} is required.`);
  const text = value.trim();
  if (!text || text.length > maxLength) throw apiError(400, `${label} is invalid.`);
  return text;
}

function validatePassword(password) {
  if (
    typeof password !== "string"
    || password.length < 8
    || password.length > 72
    || Buffer.byteLength(password, "utf8") > 72
  ) {
    throw apiError(400, "Password must be between 8 and 72 characters.");
  }
}

function publicUser(row) {
  return {
    id: row.user_id,
    role: row.role,
    name: row.name,
    surname: row.surname,
    email: row.email,
    grade: row.grade,
    house: row.house_code,
  };
}

async function createSession(userId, executor = pool) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    .toISOString()
    .slice(0, 23)
    .replace("T", " ");
  await executor.execute("DELETE FROM auth_sessions WHERE expires_at <= UTC_TIMESTAMP(3)");
  await executor.execute(
    "INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    [tokenHash, userId, expiresAt],
  );
  return token;
}

async function requireAuth(req, res, next) {
  try {
    const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.get("authorization") || "");
    if (!match) throw apiError(401, "Please log in.");

    const tokenHash = createHash("sha256").update(match[1]).digest("hex");
    const [rows] = await pool.execute(
      `SELECT u.user_id, u.role, u.name, u.surname, u.email, u.grade, u.house_code
       FROM auth_sessions AS s
       JOIN users AS u ON u.user_id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3)`,
      [tokenHash],
    );
    if (rows.length !== 1) throw apiError(401, "Your session has expired. Please log in again.");
    req.user = publicUser(rows[0]);
    req.tokenHash = tokenHash;
    next();
  } catch (error) {
    next(error);
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return next(apiError(403, "You are not allowed to perform this action."));
    next();
  };
}

async function registerLearner(req, res) {
  const body = req.body || {};
  const name = requiredText(body.name, "Name", 100);
  const surname = requiredText(body.surname, "Surname", 100);
  const email = normalizedEmail(body.email);
  const password = body.password;
  const house = body.house;
  const gradeValue = body.grade;
  const grade = typeof gradeValue === "number"
    ? gradeValue
    : typeof gradeValue === "string" && /^\d+$/.test(gradeValue.trim())
      ? Number(gradeValue.trim())
      : Number.NaN;
  if (!validEmail(email)) throw apiError(400, "Enter a valid email address.");
  validatePassword(password);
  if (!Number.isInteger(grade) || grade < 0 || grade > 12) {
    throw apiError(400, "Grade must be a whole number from 0 to 12.");
  }
  if (!HOUSE_CODES.has(house)) throw apiError(400, "Choose a valid house.");
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let token;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    await connection.execute(
      `INSERT INTO users (user_id, role, name, surname, email, password_hash, grade, house_code)
       VALUES (?, 'learner', ?, ?, ?, ?, ?, ?)`,
      [userId, name, surname, email, passwordHash, grade, house],
    );
    token = await createSession(userId, connection);
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") throw apiError(409, "An account with that email already exists.");
    throw error;
  } finally {
    connection.release();
  }

  const user = { id: userId, role: "learner", name, surname, email, grade, house };
  res.status(201).json({ user, token });
}

async function login(req, res) {
  const body = req.body || {};
  const email = normalizedEmail(body.email);
  const password = body.password;
  if (
    !validEmail(email)
    || typeof password !== "string"
    || Buffer.byteLength(password, "utf8") > 72
  ) {
    throw apiError(400, "Enter your email and password.");
  }

  const [rows] = await pool.execute(
    `SELECT user_id, role, name, surname, email, password_hash, grade, house_code
     FROM users WHERE email = ?`,
    [email],
  );
  if (rows.length !== 1 || !(await bcrypt.compare(password, rows[0].password_hash))) {
    throw apiError(401, "Email or password is incorrect.");
  }

  const user = publicUser(rows[0]);
  const token = await createSession(user.id);
  res.json({ user, token });
}

app.get("/api/health", async (req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
});

app.post("/api/auth/register-learner", authRateLimit, registerLearner);
app.post("/api/auth/login", authRateLimit, login);

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  await pool.execute("DELETE FROM auth_sessions WHERE token_hash = ?", [req.tokenHash]);
  res.sendStatus(204);
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/learner/events", requireAuth, requireRole("learner"), async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT e.event_id, e.event_name, e.event_date, e.active,
            (a.learner_id IS NOT NULL) AS checked_in
     FROM events AS e
     LEFT JOIN attendance AS a
       ON a.event_id = e.event_id AND a.learner_id = ?
     ORDER BY e.event_date, e.event_name`,
    [req.user.id],
  );
  res.json({
    events: rows.map((row) => ({
      id: row.event_id,
      name: row.event_name,
      date: row.event_date,
      active: Boolean(row.active),
      checkedIn: Boolean(row.checked_in),
    })),
  });
});

app.get("/api/events", requireAuth, async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT event_id, event_name, event_date, active FROM events ORDER BY event_date, event_name",
  );
  res.json({
    events: rows.map((row) => ({
      id: row.event_id,
      name: row.event_name,
      date: row.event_date,
      active: Boolean(row.active),
    })),
  });
});

app.post("/api/events", requireAuth, requireRole("teacher"), async (req, res) => {
  const name = requiredText(req.body?.name, "Event name", 200);
  const date = req.body?.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw apiError(400, "Enter a valid event date.");
  }
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw apiError(400, "Enter a valid event date.");
  }

  const id = randomUUID();
  await pool.execute(
    "INSERT INTO events (event_id, event_name, event_date) VALUES (?, ?, ?)",
    [id, name, date],
  );
  res.status(201).json({ event: { id, name, date, active: true } });
});

app.patch("/api/events/:id", requireAuth, requireRole("teacher"), async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) throw apiError(400, "Invalid event ID.");
  if (typeof req.body?.active !== "boolean") throw apiError(400, "Event status is required.");
  const [result] = await pool.execute(
    "UPDATE events SET active = ? WHERE event_id = ?",
    [req.body.active, req.params.id],
  );
  if (!result.affectedRows) throw apiError(404, "Event was not found.");
  res.sendStatus(204);
});

app.delete("/api/events/:id", requireAuth, requireRole("teacher"), async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) throw apiError(400, "Invalid event ID.");
  const [result] = await pool.execute("DELETE FROM events WHERE event_id = ?", [req.params.id]);
  if (!result.affectedRows) throw apiError(404, "Event was not found.");
  res.sendStatus(204);
});

app.get("/api/learners", requireAuth, requireRole("teacher"), async (req, res) => {
  const eventId = req.query.eventId;
  if (typeof eventId !== "string" || !UUID_PATTERN.test(eventId)) {
    throw apiError(400, "Select a valid event.");
  }
  const values = [eventId];
  const conditions = ["u.role = 'learner'"];
  if (req.query.grade) {
    const grade = Number(req.query.grade);
    if (!Number.isInteger(grade) || grade < 0 || grade > 12) throw apiError(400, "Invalid grade filter.");
    conditions.push("u.grade = ?");
    values.push(grade);
  }
  if (req.query.house) {
    if (!HOUSE_CODES.has(req.query.house)) throw apiError(400, "Invalid house filter.");
    conditions.push("u.house_code = ?");
    values.push(req.query.house);
  }
  const search = typeof req.query.name === "string" ? req.query.name.trim().slice(0, 100) : "";
  if (search) {
    conditions.push(
      "(u.name LIKE ? OR u.surname LIKE ? OR CONCAT(u.name, ' ', u.surname) LIKE ?)",
    );
    values.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const [rows] = await pool.execute(
    `SELECT u.user_id, u.name, u.surname, u.grade, u.house_code,
            (a.learner_id IS NOT NULL) AS checked_in
     FROM users AS u
     LEFT JOIN attendance AS a
       ON a.event_id = ? AND a.learner_id = u.user_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY u.surname, u.name`,
    values,
  );
  res.json({
    learners: rows.map((row) => ({
      id: row.user_id,
      name: row.name,
      surname: row.surname,
      grade: row.grade,
      house: row.house_code,
      checkedIn: Boolean(row.checked_in),
    })),
  });
});

app.post("/api/attendance", requireAuth, requireRole("teacher"), async (req, res) => {
  const eventId = req.body?.eventId;
  const learnerId = req.body?.learnerId;
  if (typeof eventId !== "string" || !UUID_PATTERN.test(eventId)) throw apiError(400, "Invalid event.");
  if (typeof learnerId !== "string" || !UUID_PATTERN.test(learnerId)) throw apiError(400, "Invalid learner.");

  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [events] = await connection.execute(
      "SELECT event_id FROM events WHERE event_id = ? AND active = TRUE FOR UPDATE",
      [eventId],
    );
    if (!events.length) throw apiError(409, "This event is closed or no longer exists.");
    const [learners] = await connection.execute(
      "SELECT user_id, house_code FROM users WHERE user_id = ? AND role = 'learner' FOR UPDATE",
      [learnerId],
    );
    if (!learners.length) throw apiError(404, "Learner was not found.");
    await connection.execute(
      "INSERT INTO attendance (event_id, learner_id, house_code) VALUES (?, ?, ?)",
      [eventId, learnerId, learners[0].house_code],
    );
    await connection.commit();
    transactionStarted = false;
    res.status(201).json({ checkedIn: true });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") throw apiError(409, "This learner is already checked in.");
    throw error;
  } finally {
    connection.release();
  }
});

app.get("/api/house-points", requireAuth, requireRole("teacher"), async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT house_code, house_name, total_points FROM house_points ORDER BY house_code",
  );
  res.json({
    points: rows.map((row) => ({
      house: row.house_code,
      name: row.house_name,
      total: Number(row.total_points),
    })),
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error("API request failed:", error);
  res.status(status).json({
    error: status >= 500 ? "The request could not be completed." : error.message,
  });
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

if (require.main === module) {
  if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_PASSWORD) {
    console.error("Set DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD before starting the API.");
    process.exitCode = 1;
  } else if (!Number.isInteger(SESSION_HOURS) || SESSION_HOURS < 1 || SESSION_HOURS > 24) {
    console.error("SESSION_HOURS must be an integer from 1 to 24.");
    process.exitCode = 1;
  } else {
    app.listen(port, host, () => {
      console.log(`School House Points API listening on http://${host}:${port}`);
    });
  }
}

module.exports = { app, pool, validatePassword };
