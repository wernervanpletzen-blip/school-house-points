/* ============================================================
   FIREBASE SETUP
   ============================================================ */
const firebaseConfig = {
    apiKey: "AIzaSyCTh8EPbEHbwj-dY2wClMUfuo551wZODgs",
    authDomain: "school-house-points-de0a0.firebaseapp.com",
    projectId: "school-house-points-de0a0",
    storageBucket: "school-house-points-de0a0.firebasestorage.app",
    messagingSenderId: "557412828404",
    appId: "1:557412828404:web:d7a8f300780df81b6f4aa1"
  };

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* ============================================================
   HOUSES
   ============================================================ */
const HOUSES = {
  houseA: { displayName: "Eerhof", logo: "house-a-logo.png" },
  houseB: { displayName: "Edelhof", logo: "house-b-logo.png" },
};

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentProfile = null;

/* ============================================================
   SHOW / HIDE SECTIONS
   ============================================================ */
function showSection(sectionId) {
  ["authSection", "learnerDashboard", "teacherDashboard"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    if (id === sectionId) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });
}

function showTeacherPanel(which) {
  const eventsPanel = $("teacherEventsPanel");
  const checkInPanel = $("teacherCheckInPanel");
  const pointsPanel = $("teacherPointsPanel");

  eventsPanel.classList.add("hidden");
  checkInPanel.classList.add("hidden");
  pointsPanel.classList.add("hidden");

  if (which === "events") eventsPanel.classList.remove("hidden");
  if (which === "checkin") checkInPanel.classList.remove("hidden");
  if (which === "points") pointsPanel.classList.remove("hidden");
}

/* ============================================================
   AUTH STATE
   ============================================================ */
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

  if (currentProfile.role === "learner") {
    showSection("learnerDashboard");
    await loadLearnerDashboard();
  } else if (currentProfile.role === "teacher") {
    showSection("teacherDashboard");
    initTeacherDashboard();
  }
});

/* ============================================================
   INIT LISTENERS
   ============================================================ */
window.addEventListener("load", () => {
  // Auth tab buttons
  $("showLogin").addEventListener("click", () => showAuthForm("login"));
  $("showLearnerRegister").addEventListener("click", () => showAuthForm("learner"));
  $("showTeacherRegister").addEventListener("click", () => showAuthForm("teacher"));

  // Auth forms
  $("loginForm").addEventListener("submit", handleLogin);
  $("learnerRegisterForm").addEventListener("submit", handleLearnerRegister);
  $("teacherRegisterForm").addEventListener("submit", handleTeacherRegister);

  // Teacher tabs
  $("tabEvents").addEventListener("click", () => {
    showTeacherPanel("events");
    loadTeacherEvents();
  });
  $("tabCheckIn").addEventListener("click", () => {
    showTeacherPanel("checkin");
    loadCheckInEventSelect();
  });
  $("tabPoints").addEventListener("click", () => {
    showTeacherPanel("points");
    loadHousePoints();
  });

  // Logout
  $("logoutButton").addEventListener("click", () => auth.signOut());

  // Events
  $("createEventForm").addEventListener("submit", handleCreateEvent);

  // Check-in filters
  $("filterGrade").addEventListener("input", loadLearnersForCheckIn);
  $("filterHouse").addEventListener("change", loadLearnersForCheckIn);
  $("checkInEventSelect").addEventListener("change", loadLearnersForCheckIn);
});

function showAuthForm(which) {
  $("loginForm").classList.add("hidden");
  $("learnerRegisterForm").classList.add("hidden");
  $("teacherRegisterForm").classList.add("hidden");

  if (which === "login") $("loginForm").classList.remove("hidden");
  if (which === "learner") $("learnerRegisterForm").classList.remove("hidden");
  if (which === "teacher") $("teacherRegisterForm").classList.remove("hidden");
}

function initTeacherDashboard() {
  showTeacherPanel("events");
  loadTeacherEvents();
  loadCheckInEventSelect();
  loadHousePoints();
}

/* ============================================================
   AUTH HANDLERS
   ============================================================ */
async function handleLogin(e) {
  e.preventDefault();
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  const errorEl = $("loginError");
  errorEl.textContent = "";

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Login failed. Please check your details.";
  }
}

async function handleLearnerRegister(e) {
  e.preventDefault();

  const name = $("learnerName").value.trim();
  const surname = $("learnerSurname").value.trim();
  const grade = $("learnerGrade").value.trim();
  const phone = $("learnerPhone").value.trim();
  const house = $("learnerHouse").value;
  const email = $("learnerEmail").value.trim();
  const password = $("learnerPassword").value;
  const errorEl = $("learnerRegisterError");
  errorEl.textContent = "";

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection("users").doc(cred.user.uid).set({
      name,
      surname,
      email,
      grade,
      phone,
      house, // houseA / houseB
      role: "learner",
    });
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Could not register learner.";
  }
}

async function handleTeacherRegister(e) {
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
      email,
      role: "teacher",
    });
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Could not register teacher.";
  }
}

/* ============================================================
   LEARNER DASHBOARD
   ============================================================ */
async function loadLearnerDashboard() {
  if (!currentProfile) return;

  const houseInfo = HOUSES[currentProfile.house] || {
    displayName: "House",
    logo: "house-a-logo.png",
  };

  $("learnerInfo").innerHTML = `
    <div class="learner-header">
      <img src="${houseInfo.logo}" class="house-logo-small" />
      <div>
        <div class="learner-name">${currentProfile.name} ${currentProfile.surname}</div>
        <div class="learner-meta">Grade ${currentProfile.grade} – ${houseInfo.displayName}</div>
      </div>
    </div>
  `;

  await loadLearnerEvents();
}

async function loadLearnerEvents() {
  const tbody = document.querySelector("#learnerEventsTable tbody");
  tbody.innerHTML = "";

  try {
    // Load all events
    const eventsSnap = await db.collection("events").orderBy("date").get();

    if (eventsSnap.empty) {
      tbody.innerHTML = `<tr><td colspan="3">No events yet.</td></tr>`;
      return;
    }

    // Load all attendance docs for THIS learner once
    const attSnap = await db
      .collection("attendance")
      .where("learnerID", "==", currentProfile.id)
      .get();

    const attendedEventIds = new Set();
    attSnap.forEach((doc) => {
      const data = doc.data();
      if (data.eventID) attendedEventIds.add(data.eventID);
    });

    // Build table rows
    eventsSnap.forEach((doc) => {
      const ev = doc.data();
      const hasAttendance = attendedEventIds.has(doc.id);
      const status = hasAttendance ? "Checked in" : "Not checked in";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${ev.name}</td>
        <td>${ev.date || ""}</td>
        <td>${status}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Error loading learner events:", err);
    tbody.innerHTML = `<tr><td colspan="3">Error loading events.</td></tr>`;
  }
}

/* ============================================================
   TEACHER – EVENTS
   ============================================================ */
async function handleCreateEvent(e) {
  e.preventDefault();
  const name = $("eventName").value.trim();
  const date = $("eventDate").value;

  if (!name || !date) return;

  await db.collection("events").add({
    name,
    date,
    active: true,
  });

  $("eventName").value = "";
  $("eventDate").value = "";

  loadTeacherEvents();
  loadCheckInEventSelect();
}

async function loadTeacherEvents() {
  const tbody = document.querySelector("#teacherEventsTable tbody");
  tbody.innerHTML = "";

  const snap = await db.collection("events").orderBy("date").get();

  snap.forEach((doc) => {
    const ev = doc.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${ev.name}</td>
      <td>${ev.date}</td>
      <td>${ev.active ? "Active" : "Closed"}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="toggleEvent('${doc.id}', ${ev.active})">
          ${ev.active ? "Close" : "Open"}
        </button>
        <button class="btn btn-ghost btn-sm" onclick="deleteEvent('${doc.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function toggleEvent(id, isActive) {
  await db.collection("events").doc(id).update({ active: !isActive });
  loadTeacherEvents();
  loadCheckInEventSelect();
}
window.toggleEvent = toggleEvent;

async function deleteEvent(id) {
  if (!confirm("Delete this event?")) return;
  await db.collection("events").doc(id).delete();
  loadTeacherEvents();
  loadCheckInEventSelect();
}
window.deleteEvent = deleteEvent;

/* ============================================================
   TEACHER – CHECK-IN
   ============================================================ */
async function loadCheckInEventSelect() {
  const select = $("checkInEventSelect");
  if (!select) return;

  const snap = await db
    .collection("events")
    .where("active", "==", true)
    .orderBy("date")
    .get();

  select.innerHTML = "";
  snap.forEach((doc) => {
    const ev = doc.data();
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = `${ev.name} (${ev.date})`;
    select.appendChild(opt);
  });

  loadLearnersForCheckIn();
}

async function loadLearnersForCheckIn() {
  const eventID = $("checkInEventSelect").value;
  const tbody = document.querySelector("#checkInLearnersTable tbody");
  tbody.innerHTML = "";

  if (!eventID) {
    tbody.innerHTML = `<tr><td colspan="4">No active events.</td></tr>`;
    return;
  }

  const filterGrade = $("filterGrade").value.trim();
  const filterHouse = $("filterHouse").value;

  try {
    const usersSnap = await db
      .collection("users")
      .where("role", "==", "learner")
      .get();

    let learners = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (filterGrade) learners = learners.filter((l) => String(l.grade) === filterGrade);
    if (filterHouse) learners = learners.filter((l) => l.house === filterHouse);

    const attSnap = await db
      .collection("attendance")
      .where("eventID", "==", eventID)
      .get();
    const attendance = attSnap.docs.map((d) => d.data());

    if (!learners.length) {
      tbody.innerHTML = `<tr><td colspan="4">No learners found.</td></tr>`;
      return;
    }

    learners.forEach((l) => {
      const checked = attendance.some((a) => a.learnerID === l.id);
      const houseInfo = HOUSES[l.house] || { displayName: "House", logo: "house-a-logo.png" };

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${l.name} ${l.surname}</td>
        <td>${l.grade}</td>
        <td class="house-cell">
          <img src="${houseInfo.logo}" class="house-logo-small" />
          ${houseInfo.displayName}
        </td>
        <td>
          ${
            checked
              ? '<span class="chip-status chip-ok">Checked in</span>'
              : `<button class="btn btn-primary btn-sm" onclick="checkIn('${l.id}','${eventID}')">Check in</button>`
          }
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Error loading learners for check-in:", err);
    tbody.innerHTML = `<tr><td colspan="4">Error loading learners.</td></tr>`;
  }
}

async function checkIn(uid, eventID) {
  const userDoc = await db.collection("users").doc(uid).get();
  const user = userDoc.data();

  // Record attendance
  await db.collection("attendance").doc(`${uid}_${eventID}`).set({
    learnerID: uid,
    eventID,
    learnerName: user.name,
    learnerSurname: user.surname,
    house: user.house,
    grade: user.grade,
    timestamp: new Date().toISOString(),
  });

  // Update points per house
  await db
    .collection("points")
    .doc(user.house)
    .set(
      {
        total: firebase.firestore.FieldValue.increment(1),
      },
      { merge: true }
    );

  loadLearnersForCheckIn();
}
window.checkIn = checkIn;

/* ============================================================
   TEACHER – HOUSE POINTS
   ============================================================ */
async function loadHousePoints() {
  const aDoc = await db.collection("points").doc("houseA").get();
  const bDoc = await db.collection("points").doc("houseB").get();

  $("houseAPoints").innerText = aDoc.exists ? aDoc.data().total : 0;
  $("houseBPoints").innerText = bDoc.exists ? bDoc.data().total : 0;
}
