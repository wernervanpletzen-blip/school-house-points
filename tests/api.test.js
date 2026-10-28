const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

process.env.FRONTEND_ORIGIN = "https://rexxar4-wq.github.io";
process.env.DB_HOST = "127.0.0.1";
process.env.DB_NAME = "school_house_points_test";
process.env.DB_USER = "test";
process.env.DB_PASSWORD = "test";

const { app, pool, validatePassword } = require("../api/server");
let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await pool.end();
});

test("allows browser preflight from the configured GitHub Pages origin", async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://rexxar4-wq.github.io",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://rexxar4-wq.github.io");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("rejects requests from a different browser origin", async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: "https://unexpected.example" },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Origin is not allowed." });
});

test("returns a JSON validation error without querying the database", async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      Origin: "https://rexxar4-wq.github.io",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: "not-an-email", password: "example" }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Enter your email and password." });
});

test("rejects learner registration with an empty grade", async () => {
  const response = await fetch(`${baseUrl}/api/auth/register-learner`, {
    method: "POST",
    headers: {
      Origin: "https://rexxar4-wq.github.io",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Alex",
      surname: "Example",
      email: "alex@example.com",
      password: "A-strong-example-password",
      grade: "",
      house: "houseA",
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Grade must be a whole number from 0 to 12." });
});

test("accepts passwords from 8 through 72 characters", () => {
  assert.doesNotThrow(() => validatePassword("12345678"));
  assert.doesNotThrow(() => validatePassword("a".repeat(72)));
  assert.throws(() => validatePassword("1234567"), {
    status: 400,
    message: "Password must be between 8 and 72 characters.",
  });
  assert.throws(() => validatePassword("é".repeat(37)), {
    status: 400,
    message: "Password must be between 8 and 72 characters.",
  });
});
