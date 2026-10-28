const API_BASE_URL = "https://apps.leeuwenhof.co.za/api";
const HOUSES = {
  houseA: { displayName: "Eerhof", logo: "house-a-logo.png" },
  houseB: { displayName: "Edelhof", logo: "house-b-logo.png" },
};

const $ = (id) => document.getElementById(id);
let authToken = sessionStorage.getItem("accessToken");
let currentProfile = null;

function showSection(sectionId) {
  ["authSection", "learnerDashboard", "teacherDashboard"].forEach((id) => {
    const section = $(id);
    if (section) section.classList.toggle("hidden", id !== sectionId);
  });
}

function showAuthForm(which) {
  $("loginForm").classList.toggle("hidden", which !== "login");
  $("learnerRegisterForm").classList.toggle("hidden", which !== "learner");
  $("showLogin").classList.toggle("is-active", which === "login");
  $("showLogin").setAttribute("aria-pressed", String(which === "login"));
  $("showLearnerRegister").classList.toggle("is-active", which === "learner");
  $("showLearnerRegister").setAttribute("aria-pressed", String(which === "learner"));
}

function clearSession() {
  authToken = null;
  currentProfile = null;
  sessionStorage.removeItem("accessToken");
  $("headerUserInfo").textContent = "";
  showSection("authSection");
  showAuthForm("login");
}

async function api(path, { method = "GET", body, authenticated = true } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authenticated && authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  let payload = null;
  if (response.status !== 204) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      payload = { error: "The API returned an unexpected response." };
    }
  }

  if (!response.ok) {
    if (response.status === 401 && authenticated && authToken) {
      clearSession();
      $("loginError").textContent = "Your session expired. Please log in again.";
    }
    throw new Error(payload?.error || "The request could not be completed.");
  }
  return payload;
}

function setSession(result) {
  authToken = result.token;
  sessionStorage.setItem("accessToken", authToken);
  currentProfile = result.user;
}

function addCell(row, value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value == null ? "" : String(value);
  if (className) cell.className = className;
  row.appendChild(cell);
  return cell;
}

function setTableMessage(tbody, message, columnCount) {
  tbody.replaceChildren();
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = columnCount;
  cell.textContent = message;
  row.appendChild(cell);
  tbody.appendChild(row);
}

function houseInfo(houseCode) {
  return HOUSES[houseCode] || {
    displayName: "House",
    logo: "house-a-logo.png",
  };
}

async function showUserDashboard() {
  $("headerUserInfo").textContent =
    `${currentProfile.name} ${currentProfile.surname} (${currentProfile.role})`;

  if (currentProfile.role === "learner") {
    showSection("learnerDashboard");
    await loadLearnerDashboard();
  } else if (currentProfile.role === "teacher") {
    showSection("teacherDashboard");
    initTeacherDashboard();
  } else {
    clearSession();
    throw new Error("This account has an unsupported role.");
  }
}

async function restoreSession() {
  if (!authToken) {
    showSection("authSection");
    showAuthForm("login");
    return;
  }

  try {
    const result = await api("/auth/me");
    currentProfile = result.user;
    await showUserDashboard();
  } catch (error) {
    if (!authToken) return;
    showSection("authSection");
    showAuthForm("login");
    $("loginError").textContent = `Could not connect to the app API: ${error.message}`;
  }
}

window.addEventListener("load", () => {
  $("showLogin").addEventListener("click", () => showAuthForm("login"));
  $("showLearnerRegister").addEventListener("click", () => showAuthForm("learner"));
  $("loginForm").addEventListener("submit", handleLogin);
  $("learnerRegisterForm").addEventListener("submit", handleLearnerRegister);

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
  $("learnerLogoutButton").addEventListener("click", handleLogout);
  $("logoutButton").addEventListener("click", handleLogout);
  $("createEventForm").addEventListener("submit", handleCreateEvent);

  $("filterGrade").addEventListener("input", loadLearnersForCheckIn);
  $("filterHouse").addEventListener("change", loadLearnersForCheckIn);
  $("checkInEventSelect").addEventListener("change", loadLearnersForCheckIn);
  $("filterName").addEventListener("input", loadLearnersForCheckIn);

  restoreSession();
});

function showTeacherPanel(which) {
  $("teacherEventsPanel").classList.toggle("hidden", which !== "events");
  $("teacherCheckInPanel").classList.toggle("hidden", which !== "checkin");
  $("teacherPointsPanel").classList.toggle("hidden", which !== "points");
  const tabs = [
    ["events", "tabEvents"],
    ["checkin", "tabCheckIn"],
    ["points", "tabPoints"],
  ];
  tabs.forEach(([panel, buttonId]) => {
    $(buttonId).classList.toggle("is-active", panel === which);
    $(buttonId).setAttribute("aria-pressed", String(panel === which));
  });
}

async function handleLogin(event) {
  event.preventDefault();
  const errorEl = $("loginError");
  errorEl.textContent = "";
  try {
    const result = await api(
      "/auth/login",
      {
        method: "POST",
        body: {
          email: $("loginEmail").value.trim(),
          password: $("loginPassword").value,
        },
        authenticated: false,
      },
    );
    setSession(result);
    await showUserDashboard();
  } catch (error) {
    errorEl.textContent = error.message || "Login failed.";
  }
}

async function handleLearnerRegister(event) {
  event.preventDefault();
  const errorEl = $("learnerRegisterError");
  errorEl.textContent = "";
  try {
    const result = await api(
      "/auth/register-learner",
      {
        method: "POST",
        body: {
          name: $("learnerName").value.trim(),
          surname: $("learnerSurname").value.trim(),
          grade: $("learnerGrade").value,
          house: $("learnerHouse").value,
          email: $("learnerEmail").value.trim(),
          password: $("learnerPassword").value,
        },
        authenticated: false,
      },
    );
    setSession(result);
    await showUserDashboard();
  } catch (error) {
    errorEl.textContent = error.message || "Could not register learner.";
  }
}

async function handleLogout() {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch (error) {
    console.error("Could not end the server session:", error);
  } finally {
    clearSession();
  }
}

function initTeacherDashboard() {
  showTeacherPanel("events");
  loadTeacherEvents();
  loadCheckInEventSelect();
  loadHousePoints();
}

async function loadLearnerDashboard() {
  if (!currentProfile) return;
  const info = $("learnerInfo");
  const house = houseInfo(currentProfile.house);
  info.replaceChildren();

  const header = document.createElement("div");
  header.className = "learner-header";
  const logo = document.createElement("img");
  logo.src = house.logo;
  logo.alt = `${house.displayName} logo`;
  logo.className = "house-logo-small";
  const details = document.createElement("div");
  const name = document.createElement("div");
  name.className = "learner-name";
  name.textContent = `${currentProfile.name} ${currentProfile.surname}`;
  const meta = document.createElement("div");
  meta.className = "learner-meta";
  meta.textContent = `Grade ${currentProfile.grade} – ${house.displayName}`;
  details.append(name, meta);
  header.append(logo, details);
  info.appendChild(header);

  await loadLearnerEvents();
}

async function loadLearnerEvents() {
  const tbody = document.querySelector("#learnerEventsTable tbody");
  setTableMessage(tbody, "Loading events...", 3);
  try {
    const { events } = await api("/learner/events");
    if (!events.length) return setTableMessage(tbody, "No events yet.", 3);
    tbody.replaceChildren();
    events.forEach((event) => {
      const row = document.createElement("tr");
      addCell(row, event.name);
      addCell(row, event.date);
      addCell(row, event.checkedIn ? "Checked in" : "Not checked in");
      tbody.appendChild(row);
    });
  } catch (error) {
    setTableMessage(tbody, `Error loading events: ${error.message}`, 3);
  }
}

async function handleCreateEvent(event) {
  event.preventDefault();
  const errorEl = $("createEventError");
  errorEl.textContent = "";
  const name = $("eventName").value.trim();
  const date = $("eventDate").value;
  try {
    await api("/events", { method: "POST", body: { name, date } });
    $("eventName").value = "";
    $("eventDate").value = "";
    await Promise.all([loadTeacherEvents(), loadCheckInEventSelect()]);
  } catch (error) {
    errorEl.textContent = error.message || "Could not create event.";
  }
}

async function loadTeacherEvents() {
  const tbody = document.querySelector("#teacherEventsTable tbody");
  setTableMessage(tbody, "Loading events...", 4);
  try {
    const { events } = await api("/events");
    if (!events.length) return setTableMessage(tbody, "No events yet.", 4);
    tbody.replaceChildren();
    events.forEach((event) => {
      const row = document.createElement("tr");
      addCell(row, event.name);
      addCell(row, event.date);
      addCell(row, event.active ? "Active" : "Closed");
      const actions = document.createElement("td");
      const toggleButton = document.createElement("button");
      toggleButton.className = "btn btn-primary btn-sm";
      toggleButton.textContent = event.active ? "Close" : "Open";
      toggleButton.addEventListener("click", () => toggleEvent(event.id, !event.active));
      const deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-ghost btn-sm";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => deleteEvent(event.id));
      actions.append(toggleButton, deleteButton);
      row.appendChild(actions);
      tbody.appendChild(row);
    });
  } catch (error) {
    setTableMessage(tbody, `Error loading events: ${error.message}`, 4);
  }
}

async function toggleEvent(id, active) {
  try {
    await api(`/events/${encodeURIComponent(id)}`, { method: "PATCH", body: { active } });
    await Promise.all([loadTeacherEvents(), loadCheckInEventSelect()]);
  } catch (error) {
    window.alert(`Could not update event: ${error.message}`);
  }
}

async function deleteEvent(id) {
  if (!window.confirm("Delete this event and its attendance?")) return;
  try {
    await api(`/events/${encodeURIComponent(id)}`, { method: "DELETE" });
    await Promise.all([loadTeacherEvents(), loadCheckInEventSelect(), loadHousePoints()]);
  } catch (error) {
    window.alert(`Could not delete event: ${error.message}`);
  }
}

async function loadCheckInEventSelect() {
  const select = $("checkInEventSelect");
  const tbody = document.querySelector("#checkInLearnersTable tbody");
  select.replaceChildren();
  try {
    const { events } = await api("/events");
    const activeEvents = events.filter((event) => event.active);
    if (!activeEvents.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No active events";
      select.appendChild(option);
      setTableMessage(tbody, "No active events available.", 4);
      return;
    }
    activeEvents.forEach((event) => {
      const option = document.createElement("option");
      option.value = event.id;
      option.textContent = `${event.name} (${event.date})`;
      select.appendChild(option);
    });
    await loadLearnersForCheckIn();
  } catch (error) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Error loading events";
    select.appendChild(option);
    setTableMessage(tbody, `Error loading events: ${error.message}`, 4);
  }
}

async function loadLearnersForCheckIn() {
  const eventId = $("checkInEventSelect").value;
  const tbody = document.querySelector("#checkInLearnersTable tbody");
  if (!eventId) return setTableMessage(tbody, "No active event selected.", 4);

  const query = new URLSearchParams({ eventId });
  const grade = $("filterGrade").value.trim();
  const house = $("filterHouse").value;
  const name = $("filterName").value.trim();
  if (grade) query.set("grade", grade);
  if (house) query.set("house", house);
  if (name) query.set("name", name);

  setTableMessage(tbody, "Loading learners...", 4);
  try {
    const { learners } = await api(`/learners?${query.toString()}`);
    if (!learners.length) return setTableMessage(tbody, "No learners found.", 4);
    tbody.replaceChildren();
    learners.forEach((learner) => {
      const row = document.createElement("tr");
      addCell(row, `${learner.name} ${learner.surname}`);
      addCell(row, learner.grade);
      const houseCell = document.createElement("td");
      houseCell.className = "house-cell";
      const house = houseInfo(learner.house);
      const logo = document.createElement("img");
      logo.src = house.logo;
      logo.alt = "";
      logo.className = "house-logo-small";
      houseCell.append(logo, document.createTextNode(house.displayName));
      row.appendChild(houseCell);

      const status = document.createElement("td");
      if (learner.checkedIn) {
        const chip = document.createElement("span");
        chip.className = "chip-status chip-ok";
        chip.textContent = "Checked in";
        status.appendChild(chip);
      } else {
        const button = document.createElement("button");
        button.className = "btn btn-primary btn-sm";
        button.textContent = "Check in";
        button.addEventListener("click", () => checkIn(learner.id, eventId));
        status.appendChild(button);
      }
      row.appendChild(status);
      tbody.appendChild(row);
    });
  } catch (error) {
    setTableMessage(tbody, `Error loading learners: ${error.message}`, 4);
  }
}

async function checkIn(learnerId, eventId) {
  try {
    await api("/attendance", { method: "POST", body: { learnerId, eventId } });
    await Promise.all([loadLearnersForCheckIn(), loadHousePoints()]);
  } catch (error) {
    window.alert(`Could not check in learner: ${error.message}`);
  }
}

async function loadHousePoints() {
  try {
    const { points } = await api("/house-points");
    const totals = new Map(points.map((point) => [point.house, point.total]));
    $("houseAPoints").textContent = String(totals.get("houseA") || 0);
    $("houseBPoints").textContent = String(totals.get("houseB") || 0);
  } catch (error) {
    $("houseAPoints").textContent = "—";
    $("houseBPoints").textContent = "—";
    console.error("Could not load house points:", error);
  }
}
