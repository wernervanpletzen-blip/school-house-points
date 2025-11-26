// === 1. FIREBASE CONFIG ===================================================

// TODO: replace with your Firebase config
// (from Firebase console → Project settings → Your apps → Web app)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_AUTH_DOMAIN_HERE",
  projectId: "YOUR_PROJECT_ID_HERE",
  // You can include storageBucket, messagingSenderId, appId as given by Firebase
  // storageBucket: "...",
  // messagingSenderId: "...",
  // appId: "..."
};

// Initialise Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// House metadata: change displayName to your real house names
// and make sure logos exist with those file names in your repo.
const HOUSES = {
  houseA: {
    displayName: "House 1",       // e.g. "Lions"
    logo: "house-a-logo.png",
  },
  houseB: {
    displayName: "House 2",       // e.g. "Eagles"
    logo: "house-b-logo.png",
  },
};

// Globals to track logged-in user profile
let currentUser = null;      // Firebase auth user
let currentProfile = null;   // Firestore user document (role, house, etc.)

// === 2. HELPER: SHOW / HIDE SECTIONS =======================================

function showSection(sectionId) {
  const sections = ["authSection", "learnerDashboard", "teacherDashboard"];
  sections.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === sectionId) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });
}

// Switch between auth forms
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

// === 3. AUTH STATE HANDLER =================================================

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

  // Load profile from Firestore
  const docRef = db.collection("users").doc(user.uid);
  const snap = await docRef.get();
  if (!snap.exists) {
    // No profile -> log out
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
  } else if (currentProfile.role === "teacher") {
    showSection("teacherDashboard");
    initTeacherTabs();
    loadTeacherEvents();
    loadTeacherCheckIn();
    loadHousePoints();
  }
});

// === 4. DOM READY: SET UP LISTENERS =======================================

window.addEventListener("load", () => {
  // Auth tab buttons
  document
    .getElementById("showLogin")
    .addEventListener("click", () => showAuthForm("login"));
  document
    .getElementById("showLearnerRegister")
    .addEventListener("click", () => showAuthForm("learner"));
  document
    .getElementById("showTeacherRegister")
    .addEventListener("click", () => showAuthForm("teacher"));

  // Forms
  document
    .getElementById("loginForm")
    .addEventListener("submit", loginHandler);
  document
    .getElementById("learnerRegisterForm")
    .addEventListener("submit", learnerRegisterHandler);
  document
    .getElementById("teacherRegisterForm")
    .addEventListener("submit", teacherRegisterHandler);

  // Teacher tabs
  document
    .getElementById("tabEvents")
    .addEventListener("click", () => showTeacherPanel("events"));
  document
    .getElementById("tabCheckIn")
    .addEventListener("click", () => showTeacherPanel("checkin"));
  document
    .getElementById("tabPoints")
    .addEventListener("click", () => showTeacherPanel("points"));

  // Logout
  document
    .getElementById("logoutButton")
    .addEventListener("click", () => auth.signOut());

  // Teacher event & check-in form listeners
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

// === 5. LOGIN & REGISTRATION ==============================================

async function loginHandler(e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Login failed. Please check your details.";
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
    const uid = cred.user.uid;
    await db.collection("users").doc(uid).set({
      name,
      surname,
      grade,
      phone,
      houseId,
      role: "learner",
    });
  } catch (err) {
    console.error(err);
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
    const uid = cred.user.uid;
    await db.collection("users").doc(uid).set({
      name,
      surname,
      role: "teacher",
    });
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Could not register teacher.";
  }
}

// === 6. LEARNER DASHBOARD =================================================

async function loadLearnerDashboard() {
  if (!currentProfile) return;

  const infoEl = document.getElementById("learnerInfo");
  const house = HOUSES[currentProfile.houseId] || HOUSES.houseA;

  // Header with house logo + learner name + grade + house name
  infoEl.innerHTML = `
    <div class="learner-header">
      <img
        src="${house.logo}"
        alt="${house.displayName} logo"
        class="house-logo"
      />
      <div class="learner-header-text">
        <div class="learner-name">
          ${currentProfile.name || ""} ${currentProfile.surname || ""}
        </div>
        <div class="learner-meta">
          Grade ${currentProfile.grade || "?"} • ${house.displayName}
        </div>
      </div>
    </div>
  `;

  // Get active events
  const eventsSnap = await db
    .collection("events")
    .where("status", "==", "active")
    .get();
  const events = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Get attendance for this learner
  const attSnap = await db
    .collection("attendance")
    .where("learnerId", "==", currentProfile.id)
    .get();
  const attendance = attSnap.docs.map((d) => d.data());

  const tbody = document.querySelector("#learnerEventsTable tbody");
  tbody.innerHTML = "";

  events.forEach((ev) => {
    const tr = document.createElement("tr");
    const checked = attendance.some((a) => a.eventId === ev.id);
    tr.innerHTML = `
      <td>${ev.name}</td>
      <td>${ev.date || ""}</td>
      <td>
        ${
          checked
            ? '<span class="chip-status chip-ok">Checked in ✅</span>'
            : '<span class="chip-status chip-pending">Not yet checked in</span>'
        }
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// === 7. TEACHER DASHBOARD: TABS ==========================================

function initTeacherTabs() {
  showTeacherPanel("events");
}

function showTeacherPanel(panel) {
  const eventsPanel = document.getElementById("teacherEventsPanel");
  const checkInPanel = document.getElementById("teacherCheckInPanel");
  const pointsPanel = document.getElementById("teacherPointsPanel");

  eventsPanel.classList.add("hidden");
  checkInPanel.classList.add("hidden");
  pointsPanel.classList.add("hidden");

  if (panel === "events") eventsPanel.classList.remove("hidden");
  if (panel === "checkin") checkInPanel.classList.remove("hidden");
  if (panel === "points") pointsPanel.classList.remove("hidden");

  if (panel === "events") loadTeacherEvents();
  if (panel === "checkin") loadTeacherCheckIn();
  if (panel === "points") loadHousePoints();
}

// === 8. TEACHER: EVENTS MANAGEMENT =======================================

async function createEventHandler(e) {
  e.preventDefault();
  const nameEl = document.getElementById("eventName");
  const dateEl = document.getElementById("eventDate");
  const name = nameEl.value.trim();
  const date = dateEl.value;

  if (!name || !date) return;

  await db.collection("events").add({
    name,
    date,
    status: "draft", // created as draft
  });

  nameEl.value = "";
  dateEl.value = "";
  await loadTeacherEvents();
}

async function loadTeacherEvents() {
  const eventsSnap = await db.collection("events").orderBy("date").get();
  const events = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const tbody = document.querySelector("#teacherEventsTable tbody");
  tbody.innerHTML = "";

  events.forEach((ev) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${ev.name}</td>
      <td>${ev.date || ""}</td>
      <td>${ev.status}</td>
      <td>
        ${
          ev.status === "draft"
            ? `<button class="btn btn-primary btn-sm" onclick="updateEventStatus('${ev.id}','active')">Release</button>`
            : ""
        }
        ${
          ev.status === "active"
            ? `<button class="btn btn-ghost btn-sm" onclick="updateEventStatus('${ev.id}','closed')">Close</button>`
            : ""
        }
        <button class="btn btn-ghost btn-sm" onclick="deleteEvent('${ev.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Also refresh the check-in event select
  await populateCheckInEventSelect();
}

async function updateEventStatus(id, status) {
  await db.collection("events").doc(id).update({ status });
  await loadTeacherEvents();
}

async function deleteEvent(id) {
  const ok = confirm("Delete this event?");
  if (!ok) return;
  await db.collection("events").doc(id).delete();
  await loadTeacherEvents();
}

// Make functions available for inline onclick
window.updateEventStatus = updateEventStatus;
window.deleteEvent = deleteEvent;

// === 9. TEACHER: CHECK-IN LEARNERS =======================================

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
    opt.textContent = `${ev.name} (${ev.date || ""})`;
    select.appendChild(opt);
  });
}

async function loadTeacherCheckIn() {
  if (!currentProfile) return;

  const eventSelect = document.getElementById("checkInEventSelect");
  if (!eventSelect.value) {
    await populateCheckInEventSelect();
  }
  const eventId = eventSelect.value;
  const tbody = document.querySelector("#checkInLearnersTable tbody");

  if (!eventId) {
    tbody.innerHTML =
      "<tr><td colspan='4'>No active events. Please release an event first.</td></tr>";
    return;
  }

  const filterGrade = document.getElementById("filterGrade").value.trim();
  const filterHouse = document.getElementById("filterHouse").value;

  // Load all learners
  const learnersSnap = await db
    .collection("users")
    .where("role", "==", "learner")
    .get();
  let learners = learnersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (filterGrade) {
    learners = learners.filter((l) => String(l.grade) === filterGrade);
  }
  if (filterHouse) {
    learners = learners.filter((l) => l.houseId === filterHouse);
  }

  // Load attendance for this event
  const attSnap = await db
    .collection("attendance")
    .where("eventId", "==", eventId)
    .get();
  const attendance = attSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  tbody.innerHTML = "";

  learners.forEach((l) => {
    const checked = attendance.some((a) => a.learnerId === l.id);
    const tr = document.createElement("tr");
    tr.classList.add("table-row-clickable");

    const house = HOUSES[l.houseId] || HOUSES.houseA;

    tr.innerHTML = `
      <td>${l.name} ${l.surname}</td>
      <td>${l.grade || ""}</td>
      <td>
        <span class="house-cell">
          <img
            src="${house.logo}"
            alt="${house.displayName} logo"
            class="house-logo-small"
          />
          <span>${house.displayName}</span>
        </span>
      </td>
      <td>
        ${
          checked
            ? '<span class="chip-status chip-ok">Checked in ✅</span>'
            : '<button class="btn btn-primary btn-sm" onclick="checkInLearner(\'' +
              l.id +
              "','" +
              eventId +
              "','" +
              l.houseId +
              "')\">Check in</button>"
        }
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function checkInLearner(learnerId, eventId, houseId) {
  // Use eventId_learnerId as doc ID so each learner is checked in once per event
  const docId = `${eventId}_${learnerId}`;
  await db
    .collection("attendance")
    .doc(docId)
    .set({
      learnerId,
      eventId,
      houseId,
      timestamp: new Date().toISOString(),
    });
  await loadTeacherCheckIn();
}

window.checkInLearner = checkInLearner;

// === 10. TEACHER: HOUSE POINTS ==========================================

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
    if (data.houseId === "houseA") houseA += 1;
    if (data.houseId === "houseB") houseB += 1;
  });

  ap.textContent = houseA;
  bp.textContent = houseB;
}
