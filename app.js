// ================== 1. FIREBASE CONFIG ==================
// Replace with YOUR actual Firebase config from the console
const firebaseConfig = {
    apiKey: "AIzaSyCTh8EPbEHbwj-dY2wClMUfuo551wZODgs",
    authDomain: "school-house-points-de0a0.firebaseapp.com",
    projectId: "school-house-points-de0a0",
    storageBucket: "school-house-points-de0a0.firebasestorage.app",
    messagingSenderId: "557412828404",
    appId: "1:557412828404:web:d7a8f300780df81b6f4aa1"
  };

// Init Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ================== 2. GLOBALS & HOUSE SETUP ==================

const HOUSES = {
  houseA: {
    displayName: "Eerhof",
    logo: "house-a-logo.png",
  },
  houseB: {
    displayName: "Edelhof",
    logo: "house-b-logo.png",
  },
};

let currentUser = null;
let currentProfile = null;

// Helper
const $ = (id) => document.getElementById(id);

// ================== 3. SECTION HELPERS ==================

function showSection(sectionId) {
  const sections = ["authSection", "learnerDashboard", "teacherDashboard"];
  sections.forEach((id) => {
    const el = $(id);
    if (!el) return;
    if (id === sectionId) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });
}

function showTeacherPanel(panelKey) {
  const eventsPanel = $("teacherEventsPanel");
  const checkInPanel = $("teacherCheckInPanel");
  const pointsPanel = $("teacherPointsPanel");

  eventsPanel.classList.add("hidden");
  checkInPanel.classList.add("hidden");
  pointsPanel.classList.add("hidden");

  if (panelKey === "events") eventsPanel.classList.remove("hidden");
  if (panelKey === "checkin") checkInPanel.classList.remove("hidden");
  if (panelKey === "points") pointsPanel.classList.remove("hidden");
}

// ================== 4. AUTH STATE ==================

auth.onAuthStateChanged(async (user) => {
  currentUser = user;

  if (!user) {
    currentProfile = null;
    $("headerUserInfo").textContent = "";
    showSection("authSection");
    return;
  }

  const docRef = db.collection("users").doc(user.uid);
  const snap = await docRef.get();
  if (!snap.exists) {
    await auth.signOut();
    return;
  }

  currentProfile = { id: snap.id, ...snap.data() };

  $("headerUserInfo").textContent = `${currentProfile.name} ${currentProfile.surname} (${currentProfile.role})`;

  const role = currentProfile.role;

  if (role === "learner") {
    showSection("learnerDashboard");
    await loadLearnerDashboard();
  } else if (role === "teacher") {
    showSection("teacherDashboard");
    // keep points tab hidden for teachers
    $("tabPoints").classList.add("hidden");
    initTeacherTabs();
  } else if (role === "admin") {
    showSection("teacherDashboard");
    // admin may see house points
    $("tabPoints").classList.remove("hidden");
    initTeacherTabs();
    await loadHousePoints();
  }
});

// ================== 5. INIT EVENT LISTENERS ==================

window.addEventListener("load", () => {
  // Auth tab buttons
  $("showLogin").addEventListener("click", () => showAuthForm("login"));
  $("showLearnerRegister").addEventListener("click", () => showAuthForm("learner"));
  $("showTeacherRegister").addEventListener("click", () => showAuthForm("teacher"));

  // Auth forms
  $("loginForm").addEventListener("submit", loginHandler);
  $("learnerRegisterForm").addEventListener("submit", learnerRegisterHandler);
  $("teacherRegisterForm").addEventListener("submit", teacherRegisterHandler);

  // Teacher tabs
  $("tabEvents").addEventListener("click", () => {
    showTeacherPanel("events");
    loadTeacherEvents();
  });
  $("tabCheckIn").addEventListener("click", () => {
    showTeacherPanel("checkin");
    loadTeacherCheckIn();
  });
  $("tabPoints").addEventListener("click", () => {
    // Only admin should see this tab at all
    if (currentProfile && currentProfile.role === "admin") {
      showTeacherPanel("points");
      loadHousePoints();
    }
  });

  // Logout
  $("logoutButton").addEventListener("click", () => auth.signOut());

  // Event creation
  $("createEventForm").addEventListener("submit", createEventHandler);

  // Check-in filters
  $("filterGrade").addEventListener("input", loadTeacherCheckIn);
  $("filterHouse").addEventListener("change", loadTeacherCheckIn);
  $("checkInEventSelect").addEventListener("change", loadTeacherCheckIn);
});

function showAuthForm(which) {
  $("loginForm").classList.add("hidden");
  $("learnerRegisterForm").classList.add("hidden");
  $("teacherRegisterForm").classList.add("hidden");

  if (which === "login") $("loginForm").classList.remove("hidden");
  if (which === "learner") $("learnerRegisterForm").classList.remove("hidden");
  if (which === "teacher") $("teacherRegisterForm").classList.remove("hidden");
}

function initTeacherTabs() {
  showTeacherPanel("events");
  loadTeacherEvents();
  populateCheckInEventSelect();
}

// ================== 6. AUTH HANDLERS ==================

async function loginHandler(e) {
  e.preventDefault();
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  const errorEl = $("loginError");
  errorEl.textContent = "";

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Kon nie inlog nie. Kontroleer jou besonderhede.";
  }
}

async function learnerRegisterHandler(e) {
  e.preventDefault();

  const name = $("learnerName").value.trim();
  const surname = $("learnerSurname").value.trim();
  const grade = $("learnerGrade").value.trim();
  const phone = $("learnerPhone").value.trim();
  const houseId = $("learnerHouse").value;
  const email = $("learnerEmail").value.trim();
  const password = $("learnerPassword").value;
  const errorEl = $("learnerRegisterError");
  errorEl.textContent = "";

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection("users").doc(cred.user.uid).set({
      name,
      surname,
      grade,
      phone,
      houseId,   // Eerhof / Edelhof key
      role: "learner",
    });
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Kon nie leerder registreer nie.";
  }
}

async function teacherRegisterHandler(e) {
  e.preventDefault();

  const name = $("teacherName").value.trim();
  const surname = $("teacherSurname").value.trim();
  const email = $("teacherEmail").value.trim();
  const password = $("teacherPassword").value;
  const errorEl = $("teacherRegisterError");
  errorEl.textContent = "";

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection("users").doc(cred.user.uid).set({
      name,
      surname,
      role: "teacher",
      email,
    });
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Kon nie onderwyser registreer nie.";
  }
}

// ================== 7. LEARNER DASHBOARD ==================

async function loadLearnerDashboard() {
  if (!currentProfile) return;

  // Header with learner + house
  const house = HOUSES[currentProfile.houseId] || {
    displayName: "Huis",
    logo: "house-a-logo.png",
  };

  $("learnerInfo").innerHTML = `
    <div class="learner-header">
      <img src="${house.logo}" class="house-logo-small" />
      <div>
        <div class="learner-name">${currentProfile.name} ${currentProfile.surname}</div>
        <div class="learner-meta">Graad ${currentProfile.grade} – ${house.displayName}</div>
      </div>
    </div>
  `;

  await loadLearnerEvents();
}

async function loadLearnerEvents() {
  const tbody = document.querySelector("#learnerEventsTable tbody");
  tbody.innerHTML = "";

  try {
    // Only active events
    const eventsSnap = await db
      .collection("events")
      .where("status", "==", "active")
      .orderBy("date")
      .get();

    if (eventsSnap.empty) {
      tbody.innerHTML = `
        <tr><td colspan="3">Geen aktiewe gebeure op die oomblik nie.</td></tr>
      `;
      return;
    }

    // Get all attendance for this learner once
    const attSnap = await db
      .collection("attendance")
      .where("learnerId", "==", currentProfile.id)
      .get();
    const attendance = attSnap.docs.map((d) => d.data());

    eventsSnap.forEach((doc) => {
      const ev = doc.data();
      const checked = attendance.some((a) => a.eventId === doc.id);
      const statusText = checked ? "GemerK" : "Nie gemerk nie";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${ev.name}</td>
        <td>${ev.date || ""}</td>
        <td>${statusText}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Error loading learner events:", err);
    tbody.innerHTML = `
      <tr><td colspan="3">Kon nie gebeure laai nie.</td></tr>
    `;
  }
}

// ================== 8. TEACHER / ADMIN — EVENTS ==================

async function createEventHandler(e) {
  e.preventDefault();
  const name = $("eventName").value.trim();
  const date = $("eventDate").value;

  if (!name || !date) return;

  await db.collection("events").add({
    name,
    date,
    status: "draft", // draft -> active -> closed
  });

  $("eventName").value = "";
  $("eventDate").value = "";

  loadTeacherEvents();
  populateCheckInEventSelect();
}

async function loadTeacherEvents() {
  const tbody = document.querySelector("#teacherEventsTable tbody");
  tbody.innerHTML = "";

  const eventsSnap = await db
    .collection("events")
    .orderBy("date")
    .get();

  eventsSnap.forEach((doc) => {
    const ev = doc.data();
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${ev.name}</td>
      <td>${ev.date}</td>
      <td>${ev.status}</td>
      <td>
        ${
          ev.status === "draft"
            ? `<button class="btn btn-primary btn-sm" onclick="updateEventStatus('${doc.id}','active')">Release</button>`
            : ""
        }
        ${
          ev.status === "active"
            ? `<button class="btn btn-ghost btn-sm" onclick="updateEventStatus('${doc.id}','closed')">Close</button>`
            : ""
        }
        <button class="btn btn-ghost btn-sm" onclick="deleteEvent('${doc.id}')">Delete</button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

async function updateEventStatus(id, status) {
  await db.collection("events").doc(id).update({ status });
  await loadTeacherEvents();
  await populateCheckInEventSelect();
}
window.updateEventStatus = updateEventStatus;

async function deleteEvent(id) {
  if (!confirm("Delete this event?")) return;
  await db.collection("events").doc(id).delete();
  await loadTeacherEvents();
  await populateCheckInEventSelect();
}
window.deleteEvent = deleteEvent;

// ================== 9. TEACHER / ADMIN — CHECK-IN ==================

async function populateCheckInEventSelect() {
  const select = $("checkInEventSelect");
  if (!select) return;

  const eventsSnap = await db
    .collection("events")
    .where("status", "==", "active")
    .orderBy("date")
    .get();

  select.innerHTML = "";
  eventsSnap.forEach((doc) => {
    const ev = doc.data();
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = `${ev.name} (${ev.date})`;
    select.appendChild(opt);
  });

  await loadTeacherCheckIn();
}

async function loadTeacherCheckIn() {
  const eventId = $("checkInEventSelect").value;
  const tbody = document.querySelector("#checkInLearnersTable tbody");
  tbody.innerHTML = "";

  if (!eventId) {
    tbody.innerHTML = `<tr><td colspan="4">Geen aktiewe gebeure nie.</td></tr>`;
    return;
  }

  const filterGrade = $("filterGrade").value.trim();
  const filterHouse = $("filterHouse").value;

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

  if (!learners.length) {
    tbody.innerHTML = `<tr><td colspan="4">Geen leerders gevind nie.</td></tr>`;
    return;
  }

  learners.forEach((l) => {
    const checked = attendance.some((a) => a.learnerId === l.id);
    const house = HOUSES[l.houseId] || {
      displayName: "Huis",
      logo: "house-a-logo.png",
    };

    const tr = document.createElement("tr");
    tr.innerHTML = `
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
            ? '<span class="chip-status chip-ok">GemerK</span>'
            : `<button class="btn btn-primary btn-sm" onclick="checkInLearner('${l.id}','${eventId}','${l.houseId}')">Merk</button>`
        }
      </td>
    `;
    tbody.appendChild(tr);
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

  await loadTeacherCheckIn();
}
window.checkInLearner = checkInLearner;

// ================== 10. HOUSE POINTS (ADMIN ONLY) ==================

async function loadHousePoints() {
  const ap = $("houseAPoints");
  const bp = $("houseBPoints");
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
