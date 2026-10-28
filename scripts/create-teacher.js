require("dotenv").config();

const readline = require("node:readline");
const { stdin, stdout } = require("node:process");
const { StringDecoder } = require("node:string_decoder");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const { randomUUID } = require("node:crypto");

function ask(question) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

function askPassword(question) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal so the password can be hidden.");
  }
  return new Promise((resolve, reject) => {
    stdout.write(question);
    let password = "";
    const decoder = new StringDecoder("utf8");
    const finish = (error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
      if (error) reject(error);
      else resolve(password);
    };
    const onData = (input) => {
      for (const character of decoder.write(input)) {
        const code = character.codePointAt(0);
        if (code === 3) return finish(new Error("Cancelled."));
        if (code === 13 || code === 10) return finish();
        if (code === 8 || code === 127) password = [...password].slice(0, -1).join("");
        else if (code >= 32) password += character;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function main() {
  for (const key of ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"]) {
    if (!process.env[key]) throw new Error(`Missing ${key}; set it in the API .env file.`);
  }

  const name = await ask("First name: ");
  const surname = await ask("Surname: ");
  const email = (await ask("Email: ")).toLowerCase();
  const password = await askPassword("Password (8-72 characters): ");
  if (!name || name.length > 100 || !surname || surname.length > 100) {
    throw new Error("Name and surname are required and must be at most 100 characters.");
  }
  if (password.length < 8 || password.length > 72 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Password must be between 8 and 72 characters.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("Enter a valid email address.");
  }

  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    charset: "utf8mb4",
  });
  try {
    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.execute(
      `INSERT INTO users (user_id, role, name, surname, email, password_hash, grade, house_code)
       VALUES (?, 'teacher', ?, ?, ?, ?, NULL, NULL)`,
      [userId, name, surname, email, passwordHash],
    );
    console.log(`Teacher account created for ${email}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.code === "ER_DUP_ENTRY" ? "An account with that email already exists." : error.message);
  process.exitCode = 1;
});
