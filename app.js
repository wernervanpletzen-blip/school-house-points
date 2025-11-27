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

/* ============================================================
   SHOW / HIDE PANELS
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
    authSection.classList.remove("hidden");
    learnerDashboard.classList.add("hidden");
    teacherDashboard.classList.add("hidden");
    headerUserInfo.innerHTML = "";
    return;
  }

  const userDoc = await db.collection("users").doc(user.uid).get();
  const userData = userDoc.data();

  headerUserInfo.innerHTML = `${userData.name} ${userData.surname} (${userData.role})`;

  // ROLE LOGIC
  if (userData.role === "learner") {
    authSection.classList.add("hidden");
    teacherDashboard.classList.add("hidden");
    learnerDashboard.classList.remove("hidden");
    loadLearnerProfile(user.uid);
    loadLearnerEvents(user.uid);
  }

  if (userData.role === "teacher") {
    authSection.classList.add("hidden");
    learnerDashboard.classList.add("hidden");
    teacherDashboard.classList.remove("hidden");

    tabPoints.classList.add("hidden"); // teacher cannot see house points

    showPanel(teacherEventsPanel);
    loadTeacherEvents();
    loadCheckInEventList();
  }

  if (userData.role === "admin") {
    authSection.classList.add("hidden");
    learnerDashboard.classList.add("hidden");
    teacherDashboard.classList.remove("hidden");

    tabPoints.classList.remove("hidden"); // ONLY admin can see this

    showPanel(teacherEventsPanel);
    loadTeacherEvents();
    loadCheckInEventList();
    loadHousePoints();
  }
});

/* ============================================================
   LOGIN FORM
   ============================================================ */
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = loginEmail.value;
  const password = loginPassword.value;

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    loginError.innerText = err.message;
  }
});

/* ============================================================
   LEARNER REGISTRATION
   ============================================================ */
document.getElementById("learnerRegisterForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = learnerName.value;
  const surname = learnerSurname.value;
  const grade = learnerGrade.value;
  const house = learnerHouse.value;
  const phone = learnerPhone.value;
  const email = learnerEmail.value;
  const password = learnerPassword.value;

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);

    await db.collection("users").doc(cred.user.uid).set({
      name,
      surname,
      email,
      grade,
      phone,
      house,
      role: "learner"
    });

  } catch (err) {
    learnerRegisterError.innerText = err.message;
  }
});

/* ============================================================
   TEACHER REGISTRATION
   ============================================================ */
document.getElementById("teacherRegisterForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = teacherName.value;
  const surname = teacherSurname.value;
  const email = teacherEmail.value;
  const password = teacherPassword.value;

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);

    await db.collection("users").doc(cred.user.uid).set({
      name,
      surname,
      email,
      role: "teacher"
    });

  } catch (err) {
    teacherRegisterError.innerText = err.message;
  }
});

/* ============================================================
   LOGOUT
   ============================================================ */
if (document.getElementById("logoutButton")) {
  logoutButton.addEventListener("click", () => auth.signOut());
}

/* ============================================================
   LEARNER DASHBOARD LOAD
   ============================================================ */
async function loadLearnerProfile(uid) {
  const userDoc = await db.collection("users").doc(uid).get();
  const user = userDoc.data();

  const houseInfo = HOUSES[user.house];

  learnerInfo.innerHTML = `
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
  const eventsSnap = await db.collection("events").get();
  const tbody = document.querySelector("#learnerEventsTable tbody");
  tbody.innerHTML = "";

  for (let doc of eventsSnap.docs) {
    const event = doc.data();

    const attendanceDoc = await db.collection("attendance")
      .doc(`${uid}_${doc.id}`)
      .get();

    const status = attendanceDoc.exists ? "GemerK" : "Nie gemerk nie";

    const tr = `
      <tr>
        <td>${event.name}</td>
        <td>${event.date}</td>
        <td>${status}</td>
      </tr>
    `;

    tbody.innerHTML += tr;
  }
}

/* ============================================================
   TEACHER / ADMIN — EVENTS
   ============================================================ */
document.getElementById("createEventForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = eventName.value;
  const date = eventDate.value;

  await db.collection("events").add({
    name,
    date,
    active: true
  });

  eventName.value = "";
  eventDate.value = "";

  loadTeacherEvents();
});

async function loadTeacherEvents() {
  const tbody = document.querySelector("#teacherEventsTable tbody");
  tbody.innerHTML = "";

  const snap = await db.collection("events").get();

  snap.forEach((doc) => {
    const event = doc.data();

    const tr = `
      <tr>
        <td>${event.name}</td>
        <td>${event.date}</td>
        <td>${event.active ? "Aktief" : "Gesluit"}</td>
        <td>
          <button class="btn btn-primary" onclick="toggleEvent('${doc.id}', ${event.active})">
            ${event.active ? "Sluit" : "Open"}
          </button>
          <button class="btn btn-ghost" onclick="deleteEvent('${doc.id}')">Verwyder</button>
        </td>
      </tr>
    `;

    tbody.innerHTML += tr;
  });
}

async function toggleEvent(id, isActive) {
  await db.collection("events").doc(id).update({
    active: !isActive
  });

  loadTeacherEvents();
}

async function deleteEvent(id) {
  await db.collection("events").doc(id).delete();
  loadTeacherEvents();
}

/* ============================================================
   TEACHER / ADMIN — CHECK-IN
   ============================================================ */
async function loadCheckInEventList() {
  const snap = await db.collection("events").where("active", "==", true).get();
  const select = document.getElementById("checkInEventSelect");

  select.innerHTML = "";

  snap.forEach((doc) => {
    const event = doc.data();
    const option = document.createElement("option");
    option.value = doc.id;
    option.textContent = event.name;
    select.appendChild(option);
  });

  loadLearnerListForCheckIn();
}

document.getElementById("checkInEventSelect").addEventListener("change", loadLearnerListForCheckIn);
document.getElementById("filterHouse").addEventListener("change", loadLearnerListForCheckIn);
document.getElementById("filterGrade").addEventListener("input", loadLearnerListForCheckIn);

async function loadLearnerListForCheckIn() {
  const eventID = document.getElementById("checkInEventSelect").value;
  const filterHouse = document.getElementById("filterHouse").value;
  const filterGrade = document.getElementById("filterGrade").value;

  const usersSnap = await db.collection("users")
    .where("role", "==", "learner")
    .get();

  const tbody = document.querySelector("#checkInLearnersTable tbody");
  tbody.innerHTML = "";

  for (let doc of usersSnap.docs) {
    const user = doc.data();

    if (filterHouse && user.house !== filterHouse) continue;
    if (filterGrade && user.grade != filterGrade) continue;

    const attDoc = await db.collection("attendance")
      .doc(`${doc.id}_${eventID}`)
      .get();

    const status = attDoc.exists ? "✔️" : `<button onclick="checkIn('${doc.id}', '${eventID}')">Merk</button>`;
    const houseInfo = HOUSES[user.house];

    const tr = `
      <tr>
        <td>${user.name} ${user.surname}</td>
        <td>${user.grade}</td>
        <td class="house-cell">
          <img src="${houseInfo.logo}" class="house-logo-small" />
          ${houseInfo.displayName}
        </td>
        <td>${status}</td>
      </tr>
    `;

    tbody.innerHTML += tr;
  }
}

async function checkIn(uid, eventID) {
  const userDoc = await db.collection("users").doc(uid).get();
  const user = userDoc.data();

  await db.collection("attendance").doc(`${uid}_${eventID}`).set({
    learnerName: user.name,
    learnerSurname: user.surname,
    learnerHouse: user.house,
    learnerGrade: user.grade,
    eventID,
    timestamp: new Date()
  });

  await db.collection("points").doc(user.house).set({
    total: firebase.firestore.FieldValue.increment(1)
  }, { merge: true });

  loadLearnerListForCheckIn();
}

/* ============================================================
   ADMIN ONLY — LOAD HOUSE POINTS
   ============================================================ */
async function loadHousePoints() {
  const aDoc = await db.collection("points").doc("houseA").get();
  const bDoc = await db.collection("points").doc("houseB").get();

  document.getElementById("houseAPoints").innerText = aDoc.exists ? aDoc.data().total : 0;
  document.getElementById("houseBPoints").innerText = bDoc.exists ? bDoc.data().total : 0;
}

/* ============================================================
   TABS FOR TEACHER/ADMIN
   ============================================================ */
tabEvents.addEventListener("click", () => showPanel(teacherEventsPanel));
tabCheckIn.addEventListener("click", () => showPanel(teacherCheckInPanel));
tabPoints.addEventListener("click", () => showPanel(teacherPointsPanel));

/* ============================================================
   AUTH TABS
   ============================================================ */
showLogin.addEventListener("click", () => {
  loginForm.classList.remove("hidden");
  learnerRegisterForm.classList.add("hidden");
  teacherRegisterForm.classList.add("hidden");
});

showLearnerRegister.addEventListener("click", () => {
  loginForm.classList.add("hidden");
  learnerRegisterForm.classList.remove("hidden");
  teacherRegisterForm.classList.add("hidden");
});

showTeacherRegister.addEventListener("click", () => {
  loginForm.classList.add("hidden");
  learnerRegisterForm.classList.add("hidden");
  teacherRegisterForm.classList.remove("hidden");
});
