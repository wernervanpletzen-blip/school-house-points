/* ============================================================
   FIREBASE SETUP
   Replace this config with YOUR Firebase project config
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
   HOUSE DEFINITIONS
   ============================================================ */
const HOUSES = {
  houseA: { displayName: "Eerhof", logo: "house-a-logo.png" },
  houseB: { displayName: "Edelhof", logo: "house-b-logo.png" }
};

/* ============================================================
   DOM ELEMENTS
   ============================================================ */
const authSection = document.getElementById("authSection");
const learnerDashboard = document.getElementById("learnerDashboard");
const teacherDashboard = document.getElementById("teacherDashboard");
const headerUserInfo = document.getElementById("headerUserInfo");

const tabEvents = document.getElementById("tabEvents");
const tabCheckIn = document.getElementById("tabCheckIn");
const tabPoints = document.getElementById("tabPoints");
const teacherEventsPanel = document.getElementById("teacherEventsPanel");
const teacherCheckInPanel = document.getElementById("teacherCheckInPanel");
const teacherPointsPanel = document.getElementById("teacherPointsPanel");

/* Small helpers to grab elements by id */
const $ = (id) => document.getElementById(id);

/* ============================================================
   SHOW / HIDE TEACHER/ADMIN PANELS
   ============================================================ */
function showPanel(panel) {
  teacherEventsPanel.classList.add("hidden");
  teacherCheckInPanel.classList.add("hidden");
  teacherPointsPanel.classList.add("hidden");
  panel.classList.remove("hidden");
}

/* ============================================================
   AUTH STATE LISTENER
   ============================================================ */
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    // Not logged in
    authSection.classList.remove("hidden");
    learnerDashboard.classList.add("hidden");
    teacherDashboard.classList.add("hidden");
    headerUserInfo.innerHTML = "";
    return;
  }

  const userDoc = await db.collection("users").doc(user.uid).get();
  if (!userDoc.exists) {
    // No profile – log out to avoid weird state
    await auth.signOut();
    return;
  }

  const userData = userDoc.data();
  headerUserInfo.innerHTML = `${userData.name} ${userData.surname} (${userData.role})`;

  // ROLE LOGIC
  if (userData.role === "learner") {
    authSection.classList.add("hidden");
    teacherDashboard.classList.add("hidden");
    learnerDashboard.classList.remove("hidden");

    await loadLearnerProfile(user.uid);
    await loadLearnerEvents(user.uid);
  }

  if (userData.role === "teacher") {
    authSection.classList.add("hidden");
    learnerDashboard.classList.add("hidden");
    teacherDashboard.classList.remove("hidden");

    tabPoints.classList.add("hidden"); // teacher cannot see house points

    showPanel(teacherEventsPanel);
    await loadTeacherEvents();
    await loadCheckInEventList();
  }

  if (userData.role === "admin") {
    authSection.classList.add("hidden");
    learnerDashboard.classList.add("hidden");
    teacherDashboard.classList.remove("hidden");

    tabPoints.classList.remove("hidden"); // ONLY admin can see house points

    showPanel(teacherEventsPanel);
    await loadTeacherEvents();
    await loadCheckInEventList();
    await loadHousePoints();
  }
});

/* ============================================================
   AUTH: LOGIN
   ============================================================ */
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;

  try {
    await auth.signInWithEmailAndPassword(email, password);
    $("loginError").innerText = "";
  } catch (err) {
    console.error(err);
    $("loginError").innerText = "Kon nie inlog nie. Kontroleer jou besonderhede.";
  }
});

/* ============================================================
   LEARNER REGISTRATION
   ============================================================ */
$("learnerRegisterForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = $("learnerName").value.trim();
  const surname = $("learnerSurname").value.trim();
  const grade = $("learnerGrade").value.trim();
  const house = $("learnerHouse").value;
  const phone = $("learnerPhone").value.trim();
  const email = $("learnerEmail").value.trim();
  const password = $("learnerPassword").value;

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);

    await db.collection("users").doc(cred.user.uid).set({
      name,
      surname,
      email,
      grade,
      phone,
      house,          // "houseA" or "houseB"
      role: "learner"
    });

    $("learnerRegisterError").innerText = "";
  } catch (err) {
    console.error(err);
    $("learnerRegisterError").innerText = "Kon nie leerder registreer nie.";
  }
});

/* ============================================================
   TEACHER REGISTRATION
   ============================================================ */
$("teacherRegisterForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = $("teacherName").value.trim();
  const surname = $("teacherSurname").value.trim();
  const email = $("teacherEmail").value.trim();
  const password = $("teacherPassword").value;

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);

    await db.collection("users").doc(cred.user.uid).set({
      name,
      surname,
      email,
      role: "teacher"
    });

    $("teacherRegisterError").innerText = "";
  } catch (err) {
    console.error(err);
    $("teacherRegisterError").innerText = "Kon nie onderwyser registreer nie.";
  }
});

/* ============================================================
   LOGOUT
   ============================================================ */
if ($("logoutButton")) {
  $("logoutButton").addEventListener("click", () => auth.signOut());
}

/* ============================================================
   LEARNER DASHBOARD
   ============================================================ */
async function loadLearnerProfile(uid) {
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) return;
  const user = userDoc.data();

  const houseInfo = HOUSES[user.house] || { displayName: "Huis", logo: "house-a-logo.png" };

  $("learnerInfo").innerHTML = `
    <div class="learner-header">
      <img src="${houseInfo.logo}" class="house-logo-small" />
      <div>
        <div class="learner-name">${user.name} ${user.surname}</div>
        <div class="learner-meta">Graad ${user.grade} – ${houseInfo.displayName}</div>
      </div>
    </div>
  `;
}

async function loadLearnerEvents(uid) {
  const tbody = document.querySelector("#learnerEventsTable tbody");
  tbody.innerHTML = "";

  try {
    // Only show ACTIVE events
    const eventsSnap = await db.collection("events")
      .where("active", "==", true)
      .get();

    if (eventsSnap.empty) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3">Geen aktiewe gebeure op die oomblik nie.</td>
        </tr>
      `;
      return;
    }

    for (const doc of eventsSnap.docs) {
      const event = doc.data();
      let statusText = "Nie gemerk nie";

      // Try to read attendance doc for this learner & event
      try {
        const attendanceDoc = await db
          .collection("attendance")
          .doc(`${uid}_${doc.id}`)
          .get();

        if (attendanceDoc.exists) {
          statusText = "GemerK";
        }
      } catch (err) {
        // If rules block it or something else goes wrong, just show "Nie gemerk nie"
        console.warn("Attendance read failed for learner view:", err);
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${event.name}</td>
        <td>${event.date || ""}</td>
        <td>${statusText}</td>
      `;
      tbody.appendChild(tr);
    }
  } catch (err) {
    console.error("Error loading learner events:", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="3">Kon nie gebeure laai nie.</td>
      </tr>
    `;
  }
}

/* ============================================================
   TEACHER / ADMIN — EVENTS
   ============================================================ */
$("createEventForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = $("eventName").value.trim();
  const date = $("eventDate").value;

  if (!name || !date) return;

  await db.collection("events").add({
    name,
    date,
    active: true
  });

  $("eventName").value = "";
  $("eventDate").value = "";

  loadTeacherEvents();
});

async function loadTeacherEvents() {
  const tbody = document.querySelector("#teacherEventsTable tbody");
  tbody.innerHTML = "";

  const snap = await db.collection("events").orderBy("date").get();

  snap.forEach((doc) => {
    const event = doc.data();

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${event.name}</td>
      <td>${event.date}</td>
      <td>${event.active ? "Aktief" : "Gesluit"}</td>
      <td>
        <button class="btn btn-primary" onclick="toggleEvent('${doc.id}', ${event.active})">
          ${event.active ? "Sluit" : "Open"}
        </button>
        <button class="btn btn-ghost" onclick="deleteEvent('${doc.id}')">Verwyder</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function toggleEvent(id, isActive) {
  await db.collection("events").doc(id).update({
    active: !isActive
  });

  loadTeacherEvents();
  loadCheckInEventList();
}

async function deleteEvent(id) {
  await db.collection("events").doc(id).delete();
  loadTeacherEvents();
  loadCheckInEventList();
}

window.toggleEvent = toggleEvent;
window.deleteEvent = deleteEvent;

/* ============================================================
   TEACHER / ADMIN — CHECK-IN
   ============================================================ */
async function loadCheckInEventList() {
  const select = $("checkInEventSelect");
  if (!select) return;

  const snap = await db.collection("events")
    .where("active", "==", true)
    .orderBy("date")
    .get();

  select.innerHTML = "";

  snap.forEach((doc) => {
    const event = doc.data();
    const option = document.createElement("option");
    option.value = doc.id;
    option.textContent = `${event.name} (${event.date})`;
    select.appendChild(option);
  });

  await loadLearnerListForCheckIn();
}

$("checkInEventSelect").addEventListener("change", loadLearnerListForCheckIn);
$("filterHouse").addEventListener("change", loadLearnerListForCheckIn);
$("filterGrade").addEventListener("input", loadLearnerListForCheckIn);

async function loadLearnerListForCheckIn() {
  const eventID = $("checkInEventSelect").value;
  const filterHouse = $("filterHouse").value;
  const filterGrade = $("filterGrade").value.trim();

  const tbody = document.querySelector("#checkInLearnersTable tbody");
  tbody.innerHTML = "";

  if (!eventID) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4">Geen aktiewe gebeure nie.</td>
      </tr>
    `;
    return;
  }

  const usersSnap = await db.collection("users")
    .where("role", "==", "learner")
    .get();

  for (const doc of usersSnap.docs) {
    const user = doc.data();

    if (filterHouse && user.house !== filterHouse) continue;
    if (filterGrade && String(user.grade) !== filterGrade) continue;

    const attDoc = await db.collection("attendance")
      .doc(`${doc.id}_${eventID}`)
      .get();

    const isCheckedIn = attDoc.exists;

    const houseInfo = HOUSES[user.house] || { displayName: "Huis", logo: "house-a-logo.png" };

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${user.name} ${user.surname}</td>
      <td>${user.grade}</td>
      <td class="house-cell">
        <img src="${houseInfo.logo}" class="house-logo-small" />
        ${houseInfo.displayName}
      </td>
      <td>
        ${
          isCheckedIn
            ? "✔️"
            : `<button class="btn btn-primary" onclick="checkIn('${doc.id}', '${eventID}')">Merk</button>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  }
}

async function checkIn(uid, eventID) {
  const userDoc = await db.collection("users").doc(uid).get();
  const user = userDoc.data();

  // Attendance doc ID pattern: uid_eventID
  await db.collection("attendance").doc(`${uid}_${eventID}`).set({
    learnerName: user.name,
    learnerSurname: user.surname,
    learnerHouse: user.house,
    learnerGrade: user.grade,
    eventID,
    timestamp: new Date().toISOString()
  });

  // Increment house points in "points" collection (for admin view)
  await db.collection("points").doc(user.house).set(
    {
      total: firebase.firestore.FieldValue.increment(1)
    },
    { merge: true }
  );

  await loadLearnerListForCheckIn();
}

window.checkIn = checkIn;

/* ============================================================
   ADMIN ONLY — LOAD HOUSE POINTS
   ============================================================ */
async function loadHousePoints() {
  const aDoc = await db.collection("points").doc("houseA").get();
  const bDoc = await db.collection("points").doc("houseB").get();

  $("houseAPoints").innerText = aDoc.exists ? aDoc.data().total : 0;
  $("houseBPoints").innerText = bDoc.exists ? bDoc.data().total : 0;
}

/* ============================================================
   TEACHER/ADMIN TABS
   ============================================================ */
tabEvents.addEventListener("click", () => showPanel(teacherEventsPanel));
tabCheckIn.addEventListener("click", () => showPanel(teacherCheckInPanel));
tabPoints.addEventListener("click", () => {
  showPanel(teacherPointsPanel);
  loadHousePoints();
});

/* ============================================================
   AUTH TABS (Login / Register)
   ============================================================ */
$("showLogin").addEventListener("click", () => {
  $("loginForm").classList.remove("hidden");
  $("learnerRegisterForm").classList.add("hidden");
  $("teacherRegisterForm").classList.add("hidden");
});

$("showLearnerRegister").addEventListener("click", () => {
  $("loginForm").classList.add("hidden");
  $("learnerRegisterForm").classList.remove("hidden");
  $("teacherRegisterForm").classList.add("hidden");
});

$("showTeacherRegister").addEventListener("click", () => {
  $("loginForm").classList.add("hidden");
  $("learnerRegisterForm").classList.add("hidden");
  $("teacherRegisterForm").classList.remove("hidden");
});
