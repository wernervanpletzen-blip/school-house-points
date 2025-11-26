// === 1. FIREBASE CONFIG ===================================================

// TODO: replace with your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCTh8EPbEHbwj-dY2wClMUfuo551wZODgs",
  authDomain: "school-house-points-de0a0.firebaseapp.com",
  projectId: "school-house-points-de0a0",
  storageBucket: "school-house-points-de0a0.firebasestorage.app",
  messagingSenderId: "557412828404",
  appId: "1:557412828404:web:d7a8f300780df81b6f4aa1"
};

// Initialise Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// === HOUSE DEFINITIONS ====================================================
// These are your REAL house names and their logos.

const HOUSES = {
  houseA: {
    displayName: "Eerhof",
    logo: "house-a-logo.png", // must exist in repo root
  },
  houseB: {
    displayName: "Edelhof",
    logo: "house-b-logo.png", // must exist in repo root
  },
};

// Globals to track logged-in user + profile
let currentUser = null;
let currentProfile = null;

// === 2. SHOW/HIDE SECTIONS ================================================

function showSection(sectionId) {
  const sections = ["authSection", "learnerDashboard", "teacherDashboard"];
  sections.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === sectionId) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });
}

function showAuthForm(form) {
  const loginForm = document.getElementById("loginForm");
  const learnerForm = document.getElementById("learnerRegisterForm");
  const teacherForm = document.getElementById("teacherRegisterForm");

  [loginForm, learnerForm, teacherForm].forEach((f) =>
    f.classList.add("hidden")
  );
  if (form === "login") loginForm.classList.remove("hidden");
  if (form === "learner") learnerForm.classList.remove("hidden");
  if (form === "teacher") teacherForm.classList.remove("hidden");
}

// === 3. AUTH STATE ========================================================

auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  const headerInfoEl = document.getElementById("headerUserInfo");

  if (!user) {
    currentProfile = null;
    headerInfoEl.textContent = "";
    showSection("authSection");
    showAuthForm("login");
    return;
  }

  const docRef = db.collection("users").doc(user.uid);
  const snap = await docRef.get();
  if (!snap.exists) {
    await auth.signOut();
    return;
  }

  currentProfile = { id: snap.id, ...snap.data() };

  headerInfoEl.textContent = `${
    currentProfile.role === "teacher" ? "Teacher" : "Learner"
  }: ${currentProfile.name} ${currentProfile.surname}`;

  if (currentProfile.role === "learner") {
    showSection("learnerDashboard");
    loadLearnerDashboard();
  } else {
    showSection("teacherDashboard");
    initTeacherTabs();
    loadTeacherEvents();
    loadTeacherCheckIn();
    loadHousePoints();
  }
});

// === 4. EVENT LISTENERS ===================================================

window.addEventListener("load", () => {
  document
    .getElementById("showLogin")
    .addEventListener("click", () => showAuthForm("login"));
  document
    .getElementById("showLearnerRegister")
    .addEventListener("click", () => showAuthForm("learner"));
  document
    .getElementById("showTeacherRegister")
    .addEventListener("click", () => showAuthForm("teacher"));

  document
    .getElementById("loginForm")
    .addEventListener("submit", loginHandler);
  document
    .getElementById("learnerRegisterForm")
    .addEventListener("submit", learnerRegisterHandler);
  document
    .getElementById("teacherRegisterForm")
    .addEventListener("submit", teacherRegisterHandler);

  document
    .getElementById("tabEvents")
    .addEventListener("click", () => showTeacherPanel("events"));
  document
    .getElementById("tabCheckIn")
    .addEventListener("click", () => showTeacherPanel("checkin"));
  document
    .getElementById("tabPoints")
    .addEventListener("click", () => showTeacherPanel("points"));

  document
    .getElementById("logoutButton")
    .addEventListener("click", () => auth.signOut());

  document
    .getElementById("createEventForm")
    .addEventListener("submit", createEventHandler);
  document
    .getElementById("filterGrade")
    .addEventListener("input", loadTeacherCheckIn);
  document
    .getElementById("filterHouse")
    .addEventListener("change", loadTeacherCheckIn);
  document
    .getElementById("checkInEventSelect")
    .addEventListener("change", loadTeacherCheckIn);
});

// === 5. AUTH FUNCTIONS ====================================================

async function loginHandler(e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch {
    errorEl.textContent = "Login failed.";
  }
}

async function learnerRegisterHandler(e) {
  e.preventDefault();
  const name = document.getElementById("learnerName").value.trim();
  const surname = document.getElementById("learnerSurname").value.trim();
  const grade = document.getElementById("learnerGrade").value.trim();
  const phone = document.getElementById("learnerPhone").value.trim();
  const houseId = document.getElementById("learnerHouse").value;
  const email = document.getElementById("learnerEmail").value.trim();
  const password = document.getElementById("learnerPassword").value;

  const errorEl = document.getElementById("learnerRegisterError");
  errorEl.textContent = "";

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection("users").doc(cred.user.uid).set({
      name,
      surname,
      grade,
      phone,
      houseId, // Eerhof (houseA) or Edelhof (houseB)
      role: "learner",
    });
  } catch {
    errorEl.textContent = "Could not register learner.";
  }
}

async function teacherRegisterHandler(e) {
  e.preventDefault();
  const name = document.getElementById("teacherName").value.trim();
  const surname = document.getElementById("teacherSurname").value.trim();
  const email = document.getElementById("teacherEmail").value.trim();
  const password = document.getElementById("teacherPassword").value;

  const errorEl = document.getElementById("teacherRegisterError");
  errorEl.textContent = "";

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection("users").doc(cred.user.uid).set({
      name,
      surname,
      role: "teacher",
    });
  } catch {
    errorEl.textContent = "Could not register teacher.";
  }
}

// === 6. LEARNER DASHBOARD =================================================

async function loadLearnerDashboard() {
  if (!currentProfile) return;

  const infoEl = document.getElementById("learnerInfo");
  const house = HOUSES[currentProfile.houseId];

  infoEl.innerHTML = `
    <div class="learner-header">
      <img src="${house.logo}" class="house-logo" />
      <div class="learner-header-text">
        <div class="learner-name">
          ${currentProfile.name} ${currentProfile.surname}
        </div>
        <div class="learner-meta">
          Grade ${currentProfile.grade} • ${house.displayName}
        </div>
      </div>
    </div>
  `;

  const eventsSnap = await db
    .collection("events")
    .where("status", "==", "active")
    .get();
  const events = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const attSnap = await db
    .collection("attendance")
    .where("learnerId", "==", currentProfile.id)
    .get();
  const attendance = attSnap.docs.map((d) => d.data());

  const tbody = document.querySelector("#learnerEventsTable tbody");
  tbody.innerHTML = "";

  events.forEach((ev) => {
    const checked = attendance.some((a) => a.eventId === ev.id);
    tbody.innerHTML += `
      <tr>
        <td>${ev.name}</td>
        <td>${ev.date}</td>
        <td>
          ${
            checked
              ? '<span class="chip-status chip-ok">Checked in ✅</span>'
              : '<span class="chip-status chip-pending">Not checked in</span>'
          }
        </td>
      </tr>
    `;
  });
}

// === 7. TEACHER TABS ======================================================

function initTeacherTabs() {
  showTeacherPanel("events");
}

function showTeacherPanel(panel) {
  document.getElementById("teacherEventsPanel").classList.add("hidden");
  document.getElementById("teacherCheckInPanel").classList.add("hidden");
  document.getElementById("teacherPointsPanel").classList.add("hidden");

  if (panel === "events") document.getElementById("teacherEventsPanel").classList.remove("hidden");
  if (panel === "checkin") document.getElementById("teacherCheckInPanel").classList.remove("hidden");
  if (panel === "points") document.getElementById("teacherPointsPanel").classList.remove("hidden");

  if (panel === "events") loadTeacherEvents();
  if (panel === "checkin") loadTeacherCheckIn();
  if (panel === "points") loadHousePoints();
}

// === 8. TEACHER: EVENTS ===================================================

async function createEventHandler(e) {
  e.preventDefault();
  const name = document.getElementById("eventName").value.trim();
  const date = document.getElementById("eventDate").value;

  await db.collection("events").add({
    name,
    date,
    status: "draft",
  });

  loadTeacherEvents();
}

async function loadTeacherEvents() {
  const eventsSnap = await db.collection("events").orderBy("date").get();
  const events = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const tbody = document.querySelector("#teacherEventsTable tbody");
  tbody.innerHTML = "";

  events.forEach((ev) => {
    tbody.innerHTML += `
      <tr>
        <td>${ev.name}</td>
        <td>${ev.date}</td>
        <td>${ev.status}</td>
        <td>
          ${
            ev.status === "draft"
              ? `<button onclick="updateEventStatus('${ev.id}','active')" class="btn btn-primary btn-sm">Release</button>`
              : ""
          }
          ${
            ev.status === "active"
              ? `<button onclick="updateEventStatus('${ev.id}','closed')" class="btn btn-ghost btn-sm">Close</button>`
              : ""
          }
          <button onclick="deleteEvent('${ev.id}')" class="btn btn-ghost btn-sm">Delete</button>
        </td>
      </tr>
    `;
  });

  populateCheckInEventSelect();
}

async function updateEventStatus(id, status) {
  await db.collection("events").doc(id).update({ status });
  loadTeacherEvents();
}
window.updateEventStatus = updateEventStatus;

async function deleteEvent(id) {
  if (!confirm("Delete this event?")) return;
  await db.collection("events").doc(id).delete();
  loadTeacherEvents();
}
window.deleteEvent = deleteEvent;

// === 9. TEACHER: CHECK-IN =================================================

async function populateCheckInEventSelect() {
  const select = document.getElementById("checkInEventSelect");
  const eventsSnap = await db
    .collection("events")
    .where("status", "==", "active")
    .get();
  const events = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  select.innerHTML = "";
  events.forEach((ev) => {
    const opt = document.createElement("option");
    opt.value = ev.id;
    opt.textContent = `${ev.name} (${ev.date})`;
    select.appendChild(opt);
  });
}

async function loadTeacherCheckIn() {
  const eventId = document.getElementById("checkInEventSelect").value;
  const tbody = document.querySelector("#checkInLearnersTable tbody");

  if (!eventId) {
    tbody.innerHTML = "<tr><td colspan='4'>No active events.</td></tr>";
    return;
  }

  const filterGrade = document.getElementById("filterGrade").value.trim();
  const filterHouse = document.getElementById("filterHouse").value;

  const learnersSnap = await db
    .collection("users")
    .where("role", "==", "learner")
    .get();
  let learners = learnersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (filterGrade) learners = learners.filter((l) => String(l.grade) === filterGrade);
  if (filterHouse) learners = learners.filter((l) => l.houseId === filterHouse);

  const attSnap = await db
    .collection("attendance")
    .where("eventId", "==", eventId)
    .get();
  const attendance = attSnap.docs.map((d) => d.data());

  tbody.innerHTML = "";

  learners.forEach((l) => {
    const checked = attendance.some((a) => a.learnerId === l.id);
    const house = HOUSES[l.houseId];

    tbody.innerHTML += `
      <tr>
        <td>${l.name} ${l.surname}</td>
        <td>${l.grade}</td>
        <td>
          <span class="house-cell">
            <img src="${house.logo}" class="house-logo-small" />
            ${house.displayName}
          </span>
        </td>
        <td>
          ${
            checked
              ? '<span class="chip-status chip-ok">Checked in</span>'
              : `<button class="btn btn-primary btn-sm" onclick="checkInLearner('${l.id}','${eventId}','${l.houseId}')">Check in</button>`
          }
        </td>
      </tr>
    `;
  });
}

async function checkInLearner(learnerId, eventId, houseId) {
  await db
    .collection("attendance")
    .doc(`${eventId}_${learnerId}`)
    .set({
      learnerId,
      eventId,
      houseId,
      timestamp: new Date().toISOString(),
    });

  loadTeacherCheckIn();
}
window.checkInLearner = checkInLearner;

// === 10. TEACHER: HOUSE POINTS ===========================================

async function loadHousePoints() {
  const ap = document.getElementById("houseAPoints");
  const bp = document.getElementById("houseBPoints");

  ap.textContent = "...";
  bp.textContent = "...";

  const attSnap = await db.collection("attendance").get();
  let houseA = 0;
  let houseB = 0;

  attSnap.forEach((doc) => {
    const data = doc.data();
    if (data.houseId === "houseA") houseA++;
    if (data.houseId === "houseB") houseB++;
  });

  ap.textContent = houseA;
  bp.textContent = houseB;
}
