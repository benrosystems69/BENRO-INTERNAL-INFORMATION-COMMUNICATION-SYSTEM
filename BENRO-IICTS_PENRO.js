const googleSheetsUrl =
  "https://script.google.com/macros/s/AKfycbwuPxSN-bsYhgAM5UmvmFnImZlLC-EqpWKr5vpjGSb4pRI16vDPaAwHr0FtzIs-qgYP/exec";

const personnelUrl =
  "https://script.google.com/macros/s/AKfycbzAxaoxDBHLfN9Dqu6FNzW_p7XNfbZSdnLtfAJmC53YEGr1lfgW0kGrHQLizY3Eg99j/exec";

const loggedInDivision = (localStorage.getItem("benroDivision") || "").trim().toUpperCase();

const AUTO_REFRESH_INTERVAL = 2000;

const tableBody = document.querySelector("#dataGrid tbody");
const searchBox = document.getElementById("searchBox");
const searchBtn = document.getElementById("searchBtn");

const outcomeInput = document.getElementById("OUTCOME");
const personnelInput = document.getElementById("PERSONNEL");
const documentInput = document.getElementById("DOCUMENT");  
const rowIndexInput = document.getElementById("rowIndex");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");

const clientSource = document.getElementById("clientSource");
const documentSource = document.getElementById("documentSource");

const personnelDisplay = document.getElementById("personnelDisplay");
const personnelHidden = document.getElementById("PERSONNEL");
const actionTakenInput = document.getElementById("ACTION_TAKEN") || { value: "" }; 

console.log("tableBody =", tableBody);
console.log("googleSheetsUrl =", googleSheetsUrl);

let allPersonnelNames = [];
let selectedPersonnel = [];
let allRows = [];
let isSearching = false;
let isClearing = false;
let currentInstructionRecipient = "";
let instructionStore = JSON.parse(localStorage.getItem("instructionStore") || "{}");
let instructionInitialState = {
  personnel: "",
  documentClassification: "",
  message: ""
};

let isInstructionDirty = false;
let isTypingSearch = false;
let searchIdleTimer = null;

let isLoadingData = false;
let autoUpdateTimer = null;
let latestNewDataIds = [];
const RING_ON_FIRST_LOAD = false; 




/* ==============================
   STARTUP LOADER
============================== */
function showStartupLoader() {
  const loader = document.getElementById("startupLoader");
  if (!loader) return;

  const title = loader.querySelector(".loader-title");
  const subtitle = loader.querySelector(".loader-subtitle");

  if (title) title.textContent = "LOADING DATA";
  if (subtitle) subtitle.textContent = "Please wait while records are being loaded...";

  loader.classList.add("show");
}

function hideStartupLoader() {
  const loader = document.getElementById("startupLoader");
  if (loader) {
    loader.classList.remove("show");
  }
}


function showLogoutLoader() {
  const loader = document.getElementById("startupLoader");
  if (!loader) return;

  const title = loader.querySelector(".loader-title");
  const subtitle = loader.querySelector(".loader-subtitle");

  if (title) title.textContent = "LOGGING OUT";
  if (subtitle) subtitle.textContent = "Please wait while your session is ending...";

  loader.classList.add("show");
}















/* ==============================
   INSTRUCTION HELPERS
============================== */
function saveInstructionsToLocal() {
  localStorage.setItem("instructionStore", JSON.stringify(instructionStore));
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function renderSavedInstructionBlock(name) {
  const saved = instructionStore[name];
  if (!saved || !saved.message) return "";

  return `
    <div class="saved-instruction-block">
      <div class="saved-instruction-message">${escapeHtml(saved.message)}</div>
      <div class="saved-instruction-doc">${escapeHtml(saved.documentClassification || "-")}</div>
    </div>
  `;
}

/* ==============================
   INSTRUCTION MODAL
============================== */
function openInstructionModal(name) {
  const modal = document.getElementById("instructionModal");
  const personnelField = document.getElementById("instructionPersonnel");
  const documentField = document.getElementById("instructionDocument");
  const messageField = document.getElementById("instructionMessage");
  const saveInstructionBtn = document.getElementById("sendInstructionBtn");
  const cancelBtn = document.getElementById("cancelInstructionBtn");

  currentInstructionRecipient = name || "";

  const saved = instructionStore[currentInstructionRecipient] || {};

  personnelField.value = currentInstructionRecipient;
  documentField.value =
    saved.documentClassification ||
    (documentInput?.value || "").trim() ||
    "-";
  messageField.value = saved.message || "";

  if (saveInstructionBtn) {
    saveInstructionBtn.textContent = saved.message ? "Update" : "Save";
  }

  if (cancelBtn) {
    cancelBtn.style.display = "inline-block";
  }

  modal.classList.add("show");

  // ✅ track original values
  setInstructionInitialState();
}

function closeInstructionModal(forceClose = false) {
  const modal = document.getElementById("instructionModal");
  if (!modal) return;

  if (!forceClose && !confirmDiscardInstructionChanges()) {
    return;
  }

  modal.classList.remove("show");
  isInstructionDirty = false;
}

function setupInstructionModal() {
  const modal = document.getElementById("instructionModal");
  const closeBtn = document.getElementById("closeInstructionModal");
  const cancelBtn = document.getElementById("cancelInstructionBtn");
  const saveInstructionBtn = document.getElementById("sendInstructionBtn");
  const documentField = document.getElementById("instructionDocument");
  const messageField = document.getElementById("instructionMessage");

  if (!modal || !closeBtn || !cancelBtn || !saveInstructionBtn) return;

  closeBtn.addEventListener("click", function () {
    closeInstructionModal(false);
  });

  cancelBtn.addEventListener("click", function () {
    closeInstructionModal(false);
  });

  modal.addEventListener("click", function (e) {
    if (e.target === modal) {
      closeInstructionModal(false);
    }
  });

  if (documentField) {
    documentField.addEventListener("input", checkInstructionDirty);
  }

  if (messageField) {
    messageField.addEventListener("input", checkInstructionDirty);
  }

  saveInstructionBtn.addEventListener("click", function () {
    const personnel = document.getElementById("instructionPersonnel").value.trim();
    const documentClass = document.getElementById("instructionDocument").value.trim() || "-";
    const message = document.getElementById("instructionMessage").value.trim();

    if (!personnel) {
      alert("No personnel selected.");
      return;
    }

    if (!message) {
      alert("Please type an instruction message.");
      return;
    }

    instructionStore[personnel] = {
      personnel: personnel,
      documentClassification: documentClass,
      message: message,
      savedAt: new Date().toLocaleString()
    };

    localStorage.setItem("instructionStore", JSON.stringify(instructionStore));

    updatePersonnelDisplay();

    // ✅ reset dirty state after save
    setInstructionInitialState();

    // ✅ close without discard prompt
    closeInstructionModal(true);
  });
}

/* ==============================
   PERSONNEL MULTISELECT
============================== */
async function loadPersonnelCheckboxList() {
  try {
    const res = await fetch(personnelUrl + "?action=getPersonnelList&t=" + Date.now());
    const names = await res.json();

    allPersonnelNames = Array.isArray(names) ? names : [];
    renderPersonnelOptions(allPersonnelNames);
    updatePersonnelDisplay();
  } catch (err) {
    console.error("Failed to load personnel list:", err);
  }
}

function renderPersonnelOptions(names) {
  const container = document.getElementById("personnelOptions");
  if (!container) return;

  container.innerHTML = "";

  names.forEach((name) => {
    const wrapper = document.createElement("label");
    wrapper.className = "multi-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = name;
    checkbox.checked = selectedPersonnel.includes(name);

    const span = document.createElement("span");
    span.textContent = name;

    checkbox.addEventListener("change", function () {
      if (this.checked) {
        if (!selectedPersonnel.includes(name)) {
          selectedPersonnel.push(name);
        }
      } else {
        selectedPersonnel = selectedPersonnel.filter((item) => item !== name);
      }

      personnelHidden.value = selectedPersonnel.join(" | ");
      updatePersonnelDisplay();
    });

    wrapper.appendChild(checkbox);
    wrapper.appendChild(span);
    container.appendChild(wrapper);
  });
}

function updatePersonnelDisplay() {
  personnelDisplay.innerHTML = "";

  if (selectedPersonnel.length === 0) {
    personnelDisplay.innerHTML =
      '<span class="placeholder-text">PERSONNEL IN-CHARGE</span>';
    personnelHidden.value = "";
    return;
  }

  selectedPersonnel.forEach((name) => {
    const saved = instructionStore[name] || {};
    const hasInstruction = !!saved.message;

    const tag = document.createElement("div");
    tag.className = "personnel-tag";

    const nameSpan = document.createElement("span");
    nameSpan.className = "personnel-name";
    nameSpan.title = name;
    nameSpan.textContent = name;

  
    

    const removeBtn = document.createElement("button");
    removeBtn.className = "personnel-btn remove";
    removeBtn.type = "button";
    removeBtn.innerHTML = "✖";
    removeBtn.title = "Remove Personnel";

   removeBtn.addEventListener("click", function (e) {
  e.stopPropagation();

  const instructionModal = document.getElementById("instructionModal");
  const modalIsOpen = instructionModal && instructionModal.classList.contains("show");

  if (modalIsOpen && !confirmDiscardInstructionChanges()) {
    return;
  }

  selectedPersonnel = selectedPersonnel.filter((p) => p !== name);

  delete instructionStore[name];
  saveInstructionsToLocal();

  personnelHidden.value = selectedPersonnel.join(" | ");
  updatePersonnelDisplay();
  renderPersonnelOptions(allPersonnelNames);
});

    const actionsWrap = document.createElement("div");
    actionsWrap.className = "personnel-tag-actions";
    actionsWrap.appendChild(actionBtn);
    actionsWrap.appendChild(removeBtn);

    tag.appendChild(nameSpan);
    tag.appendChild(actionsWrap);
    personnelDisplay.appendChild(tag);
  });

  personnelHidden.value = selectedPersonnel.join(" | ");
}

function setPersonnelFromString(value) {
  if (!value || value === "-") {
    selectedPersonnel = [];
    personnelHidden.value = "";
    updatePersonnelDisplay();
    renderPersonnelOptions(allPersonnelNames);
    return;
  }

  const raw = String(value).trim();

  if (raw.includes("|")) {
    selectedPersonnel = raw
      .split("|")
      .map(v => v.trim())
      .filter(v => v !== "");
  } else {
    selectedPersonnel = allPersonnelNames.filter(name =>
      raw.toLowerCase().includes(name.toLowerCase())
    );
  }

  personnelHidden.value = selectedPersonnel.join(" | ");
  updatePersonnelDisplay();
  renderPersonnelOptions(allPersonnelNames);
}

function clearPersonnelSelection() {
  selectedPersonnel = [];
  updatePersonnelDisplay();
  renderPersonnelOptions(allPersonnelNames);
}

function setupPersonnelDropdown() {
  const box = document.getElementById("personnelSelectBox");
  const dropdown = document.getElementById("personnelDropdown");
  const search = document.getElementById("personnelSearch");

  if (!box || !dropdown || !search) return;

  box.addEventListener("click", function (e) {
    e.stopPropagation();
    dropdown.classList.toggle("show");

    if (dropdown.classList.contains("show")) {
      search.focus();
    }
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".multi-select-wrapper")) {
      dropdown.classList.remove("show");
    }
  });

  search.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  search.addEventListener("input", function () {
    const keyword = this.value.toLowerCase().trim();

    const filtered = allPersonnelNames.filter((name) =>
      name.toLowerCase().includes(keyword)
    );

    renderPersonnelOptions(filtered);
  });
}


/* ==============================
   RELEASE STATUS FILTER
   Only show rows declared RELEASED
============================== */
function normalizeReleaseValue(value) {
  return String(value || "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toUpperCase();
}

function getReleaseStatus(row) {
  if (!row) return "";

  // ✅ Common header names from spreadsheet / Apps Script
  const possibleKeys = [
    "RELEASE STATUS",
    "STATUS",
    "RELEASED STATUS",
    "RELEASE_STATUS",
    "releaseStatus",
    "release_status"
  ];

  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }

  // ✅ Extra safety: search keys even if there are spaces
  for (const key in row) {
    const cleanKey = String(key || "").trim().toUpperCase();

    if (
      cleanKey === "RELEASE STATUS" ||
      cleanKey === "STATUS" ||
      cleanKey.includes("RELEASE")
    ) {
      return row[key];
    }
  }

  return "";
}

function isReleasedRow(row) {
  return normalizeReleaseValue(getReleaseStatus(row)) === "RELEASED";
}

/* ==============================
   LOGIN FILTER HELPERS
   Fix: rowMatchesLoggedInDivision is not defined
============================== */
function normalizeText(value) {
  return String(value || "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function isPenroUser() {
  const role = normalizeText(localStorage.getItem("benroRole"));
  const position = normalizeText(localStorage.getItem("benroPosition"));
  const division = normalizeText(localStorage.getItem("benroDivision"));

  return (
    role.includes("PENRO") ||
    position.includes("PENRO") ||
    division.includes("PENRO")
  );
}

function rowMatchesLoggedInDivision(rowDivisionText) {
  // ✅ PENRO can see all released records
  if (isPenroUser()) return true;

  const loggedDivision = normalizeText(localStorage.getItem("benroDivision"));

  // ✅ If no division saved, do not block loading
  if (!loggedDivision) return true;

  const allowedDivisions = loggedDivision
    .split(/\||\/|,/)
    .map(div => normalizeText(div))
    .filter(div => div !== "");

  const rowDivision = normalizeText(rowDivisionText);

  return allowedDivisions.some(div =>
    rowDivision === div ||
    rowDivision.startsWith(div) ||
    rowDivision.includes(div)
  );
}

function rowMatchesLoggedInEmployee(personnelText) {
  // ✅ PENRO can see all released records
  if (isPenroUser()) return true;

  const loggedEmployee = normalizeText(
    localStorage.getItem("benroEmployee") ||
    document.getElementById("sidebarEmployeeName")?.textContent ||
    ""
  );

  // ✅ If no employee saved, do not block loading
  if (!loggedEmployee) return true;

  if (!personnelText || personnelText === "-") return false;

  const personnelNames = String(personnelText)
    .split(/\s*\|\s*|\n|;/)
    .map(name => normalizeText(name))
    .filter(name => name !== "");

  return personnelNames.includes(loggedEmployee);
}


/* ==============================
   DATA LOAD
============================== */
/* ==============================
   DATA LOAD
============================== */
async function loadDataFromSheet(showAlert = false, showLoader = false) {
  // ✅ Prevent double loading / overlapping auto-refresh
  if (isLoadingData) return;

  isLoadingData = true;

  if (showLoader) {
    showStartupLoader();
  }

  try {
    const url = googleSheetsUrl + "?t=" + Date.now();
    console.log("Fetching from:", url);

    const res = await fetch(url, {
      method: "GET"
    });

    if (!res.ok) {
      throw new Error("HTTP " + res.status + " " + res.statusText);
    }

    const rawText = await res.text();
    console.log("Raw sheet response:", rawText);

    if (!rawText || rawText.trim() === "") {
      throw new Error("Empty response from Apps Script.");
    }

    let rows = JSON.parse(rawText);

    if (!Array.isArray(rows)) {
      throw new Error("Response is not an array.");
    }

    if (rows.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="16" style="text-align:center; padding:20px;">
            No records found.
          </td>
        </tr>
      `;
      allRows = [];
      return;
    }

    allRows = rows.map((row, i) => ({
      ...row,
      __rowIndex: i + 2
    }));

    let filteredRows = allRows.filter(row => {
      const matchesDivision = rowMatchesLoggedInDivision(row["DIVISION"]);
      const matchesEmployee = rowMatchesLoggedInEmployee(row["PERSONNEL IN-CHARGE"]);

      return matchesDivision && matchesEmployee;
    });

    if (filteredRows.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="16" style="text-align:center; padding:20px;">
            No assigned records found for your account.
          </td>
        </tr>
      `;
      return;
    }

    filteredRows.sort(
      (a, b) => parseDate(b["DATE RECEIVED OD"]) - parseDate(a["DATE RECEIVED OD"])
    );

    // ✅ Check visible released rows only
   const visibleReleasedRows = filteredRows.filter(row => isReleasedRow(row));

// ✅ Update PENRO notification bell/list
updatePenroNotifications(visibleReleasedRows);

// ✅ Detect new records and play ringtone
checkNewDataAndRing(visibleReleasedRows);

// ✅ Automatically display latest data in table
renderTable(filteredRows);

  } catch (error) {
    console.error("Failed to load data:", error);

    if (showAlert) {
      alert("Failed to load data:\n" + error.message);
    }
  } finally {
    isLoadingData = false;

    if (showLoader) {
      hideStartupLoader();
    }
  }
}

/* ==============================
   RENDER TABLE
============================== */
function formatPersonnelForTable(value) {
  if (!value || value === "-") return "-";

  if (value.includes("|")) {
    return value
      .split("|")
      .map(name => name.trim())
      .filter(name => name !== "")
      .join("<br>");
  }

  return value.replace(/\.,\s*/g, ".,<br>");
}



function checkPersonnelHasInstruction(personnelName, instructionsText) {
  if (!personnelName || !instructionsText || instructionsText === "-") {
    return false;
  }

  const cleanPersonnel = String(personnelName).trim().toUpperCase();
  const cleanInstructions = String(instructionsText).toUpperCase();

  // Checks if instruction block contains: - Cabrera, Jolly Anne D.
  return cleanInstructions.includes("- " + cleanPersonnel);
}


function renderPersonnelInChargeCell(personnelText, rowIndex, instructionsText = "") {
  if (!personnelText || personnelText === "-") {
    return "-";
  }

  const names = String(personnelText)
    .split(/\s*\|\s*|\n|;/) // do not split by comma
    .map(name => name.trim())
    .filter(name => name !== "");

  return `
    <div class="personnel-cell">
      ${names.map(name => {
        const hasInstruction = checkPersonnelHasInstruction(name, instructionsText);

        return `
          <div class="personnel-item">
            <span class="personnel-name">${name}</span>

            
           
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderTable(rows) {
  tableBody.innerHTML = "";

  // ✅ Final safety: only render RELEASED rows
  rows = rows.filter(row => isReleasedRow(row));

  if (rows.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="20" style="text-align:center; font-weight:600;">
          NO RELEASED DATA FOUND
        </td>
      </tr>
    `;
    return;
  }

  rows.forEach((d, index) => {
   const tr = document.createElement("tr");
tr.dataset.rowIndex = d.__rowIndex;

// ✅ Highlight newly arrived data
const thisRowId = getRowSoundId(d);

if (latestNewDataIds.includes(thisRowId)) {
  tr.classList.add("new-data-row");

  setTimeout(() => {
    tr.classList.remove("new-data-row");
  }, 6000);
}
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>
        ${
          d["SERIAL NUMBER"] && d["SERIAL NUMBER"] !== "-"
            ? `<a href="#" class="serial-link" data-row-index="${d.__rowIndex}">${d["SERIAL NUMBER"]}</a>`
            : "-"
        }
      </td>
      <td>${d["CLIENT"] || "-"}</td>
      <td>${d["GENDER"] || "-"}</td>
      <td>${d["TYPE OF DOCUMENT"] || "-"}</td>
      <td>${d["DOCUMENT"] || "-"}</td>
    
      <td style="text-align:center; vertical-align:middle;">
        ${
          d["FILE URL"]
            ? `<a href="#" 
                 class="action-view-link"
                 data-url="${d["FILE URL"]}"
                 data-action="${encodeURIComponent(d["OUTCOME"] || "")}"
                 style="display:inline-block; color:#007bff; font-weight:600; text-decoration:underline;">
                View
              </a>`
            : ""
        }
      </td>

      <td>
        ${renderPersonnelInChargeCell(
          d["PERSONNEL IN-CHARGE"],
          d.__rowIndex,
          d["INSTRUCTIONS"]
        )}
      </td>

      <td>${d["DOCUMENT CLASSIFICATION"] || d["DOCUMENT CLASSIFICATION "] || "-"}</td>
      <td>${formatDateTime(d["DATE RECEIVED OD"])}</td>
      <td>${formatDateTime(d["DATE ROUTED TO PENRO"])}</td>
      <td>${formatDateTime(d["DATE RELEASED PENRO"])}</td>
      <td>${d["DIVISION"] || "-"}</td>
      <td>${formatDateTime(d["DATE RELEASED"])}</td>
      <td>${d["FILE URL"] || "-"}</td>
      <td>
  ${
    d["FILE URL"] && d["FILE URL"] !== "-"
      ? `<button class="open-btn" data-file="${d["FILE URL"]}">Open</button>`
      : "-"
  }
</td>
    `;

    tr.addEventListener("click", function (e) {
      if (e.target.closest(".open-btn")) return;
      if (e.target.closest(".serial-link")) return;
      if (e.target.closest(".action-view-link")) return;

      e.stopPropagation();

      document.querySelectorAll("#dataGrid tbody tr").forEach((row) => {
        row.classList.remove("selected-row");
      });

      this.classList.add("selected-row");

      clientSource.textContent = d["CLIENT"] || "-";
      documentSource.textContent = d["DOCUMENT"] || "-";

      rowIndexInput.value = d.__rowIndex;

      setPersonnelFromString(
        d["PERSONNEL IN-CHARGE"] && d["PERSONNEL IN-CHARGE"] !== "-"
          ? d["PERSONNEL IN-CHARGE"]
          : ""
      );

      documentInput.value =
        d["DOCUMENT CLASSIFICATION"] ||
        d["DOCUMENT CLASSIFICATION "] ||
        "";

      // ✅ Clear old instruction state first
      instructionStore = {};

      const savedInstruction =
        d["INSTRUCTIONS"] && d["INSTRUCTIONS"] !== "-"
          ? String(d["INSTRUCTIONS"]).trim()
          : "";

      instructionStore = parseInstructionCellText(savedInstruction);

      saveInstructionsToLocal();
      updatePersonnelDisplay();

      // ✅ Also load the clicked row instruction into modal fields
      loadInstructionFromRowToModal(d);
    });

    tableBody.appendChild(tr);
  });

  setupOpenButtons();

  if (typeof setupActionTakenViewLinks === "function") {
    setupActionTakenViewLinks();
  }

  if (typeof setupSerialLinks === "function") {
    setupSerialLinks();
  }
}



function openPersonnelInstructionFromTable(event) {
  event.preventDefault();
  event.stopPropagation();

  const btn = event.currentTarget;
  const rowIndex = btn.dataset.rowIndex;
  const personnel = btn.dataset.personnel;

  // ✅ This makes row data appear below
  showRowDataBelowFromButton(rowIndex);

  // ✅ Then open instruction modal for that personnel
  if (typeof openInstructionModal === "function") {
    openInstructionModal(personnel);
  }
}


function removePersonnelFromTable(event) {
  event.preventDefault();
  event.stopPropagation();

  const btn = event.currentTarget;
  const rowIndex = btn.dataset.rowIndex;
  const personnel = btn.dataset.personnel;

  // ✅ This makes row data appear below
  showRowDataBelowFromButton(rowIndex);

  // ✅ Then remove if confirmed
  if (!confirm(`Remove ${personnel}?`)) return;

  selectedPersonnel = selectedPersonnel.filter(p => p !== personnel);

  delete instructionStore[personnel];
  saveInstructionsToLocal();

  personnelHidden.value = selectedPersonnel.join(" | ");
  updatePersonnelDisplay();
  renderPersonnelOptions(allPersonnelNames);
}
/* ==============================
   OPEN FILE
============================== */
function setupOpenButtons() {
  document.querySelectorAll(".open-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      const fileIdOrUrl = e.target.dataset.file;
      if (!fileIdOrUrl || fileIdOrUrl === "-") {
        alert("No file available for this record.");
        return;
      }

      const url = fileIdOrUrl.startsWith("http")
        ? fileIdOrUrl
        : `https://drive.google.com/file/d/${fileIdOrUrl}/view`;

      window.open(url, "_blank");
    });
  });
}

/* ==============================
   CLEAR
============================== */
function clearAllFields(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const instructionModal = document.getElementById("instructionModal");
  const modalIsOpen = instructionModal && instructionModal.classList.contains("show");

  if (modalIsOpen && !confirmDiscardInstructionChanges()) {
    return;
  }

  isClearing = true;

  rowIndexInput.value = "";
  outcomeInput.value = "";
  documentInput.value = "";

  selectedPersonnel = [];
  personnelInput.value = "";

  instructionStore = {};
  localStorage.removeItem("instructionStore");

  updatePersonnelDisplay();
  renderPersonnelOptions(allPersonnelNames);

  clientSource.textContent = "-";
  documentSource.textContent = "-";

  document.querySelectorAll("#dataGrid tbody tr").forEach(row => {
    row.classList.remove("selected-row");
  });

  const personnelSearch = document.getElementById("personnelSearch");
  const personnelDropdown = document.getElementById("personnelDropdown");
  if (personnelSearch) personnelSearch.value = "";
  if (personnelDropdown) personnelDropdown.classList.remove("show");

  if (instructionModal) {
    instructionModal.classList.remove("show");
  }

  isInstructionDirty = false;

  setTimeout(() => {
    isClearing = false;
  }, 200);
}

/* ==============================
   UPDATE RECORD
============================== */
async function updateRecord() {
  const rowIndex = rowIndexInput.value.trim();

  if (!rowIndex) {
    alert("⚠️ Please click/select a row first.");
    return;
  }

 const outcome = outcomeInput.value.trim();
const personnel = personnelHidden.value.trim();
const documentClassification = documentInput.value.trim();
const instructions = buildInstructionCellText();

/* ✅ GET LOGGED-IN ACCOUNT NAME */
const actionTakenBy =
  localStorage.getItem("benroEmployee") ||
  localStorage.getItem("benroUsername") ||
  "UNKNOWN USER";

  

  if (!personnel) {
    alert("⚠️ Please select PERSONNEL IN-CHARGE.");
    return;
  }

  if (!documentClassification) {
    alert("⚠️ Please enter DOCUMENT CLASSIFICATION.");
    documentInput.focus();
    return;
  }

 const payload = {
  action: "UPDATE_FIELDS",
  rowIndex: Number(rowIndex),

  OUTCOME: outcome,
  "PERSONNEL IN-CHARGE": personnel,
  "DOCUMENT CLASSIFICATION": documentClassification,
  INSTRUCTIONS: instructions,

  outcome: outcome,
  personnelInCharge: personnel,
  documentClassification: documentClassification,
  instructionMessage: instructions,

  /* ✅ SEND ACCOUNT NAME TO APPS SCRIPT */
  actionTakenBy: actionTakenBy,
  updatedBy: actionTakenBy
};

  console.log("UPDATE PAYLOAD:", payload);

  const originalText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = "UPDATING...";
  saveBtn.style.opacity = "0.6";

  try {
    const res = await fetch(googleSheetsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    console.log("UPDATE RESPONSE:", text);

    let result = {};
    if (text && text.trim() !== "") {
      result = JSON.parse(text);
    }

    if (result.success === false) {
      throw new Error(result.message || result.error || "Update failed.");
    }

    showUpdateSuccess();

    setTimeout(() => {
      hideUpdateSuccess();
      clearAllFields();
      loadDataFromSheet(false);
    }, 1200);

  } catch (err) {
    console.error("UPDATE ERROR:", err);
    alert("❌ Update failed:\n" + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
    saveBtn.style.opacity = "1";
  }
}
/* ==============================
   SEARCH
============================== */
function filterTable() {
  const searchValue = searchBox.value.toLowerCase().trim();
  const rows = tableBody.rows;

  // ✅ Keep search mode active while there is text
  isSearching = searchValue.length > 0;
  isTypingSearch = searchValue.length > 0;

  let visibleIndex = 1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cells = row.cells;

    const searchText = Array.from(cells)
      .map(cell => cell.textContent || "")
      .join(" ")
      .toLowerCase();

    const match = searchValue === "" || searchText.includes(searchValue);

    row.style.display = match ? "" : "none";

    if (match) {
      cells[0].textContent = visibleIndex++;
    }
  }
}

/* ==============================
   AUTO REFRESH
============================== */
function startAutoUpdate() {
  if (autoUpdateTimer) {
    clearInterval(autoUpdateTimer);
  }

  autoUpdateTimer = setInterval(() => {
    const searchValue = searchBox ? searchBox.value.trim() : "";

    const instructionModal = document.getElementById("instructionModal");
    const rowModal = document.getElementById("rowModal");
    const actionTakenModal = document.getElementById("actionTakenModal");

    const modalIsOpen =
      instructionModal?.classList.contains("show") ||
      rowModal?.classList.contains("show") ||
      actionTakenModal?.classList.contains("show");

    // ✅ Do not refresh only when searching, typing search, modal open, or updating
    if (
      searchValue !== "" ||
      isSearching ||
      isTypingSearch ||
      modalIsOpen ||
      saveBtn?.disabled
    ) {
      console.log("Auto-refresh paused.");
      return;
    }

    // ✅ Auto refresh without startup loader
    loadDataFromSheet(false, false);

  }, AUTO_REFRESH_INTERVAL);
}

/* ==============================
   DATE HELPERS
============================== */
function parseDate(value) {
  if (!value) return new Date(0);

  const parsed = new Date(value);
  if (!isNaN(parsed)) return parsed;

  const parts = String(value).match(/(\d+)/g);
  if (!parts) return new Date(0);

  const [month, day, year, hour = 0, min = 0] = parts;
  return new Date(year, month - 1, day, hour, min);
}

function formatDateTime(value) {
  if (!value || value === "-") return "-";

  const date = new Date(value);
  if (isNaN(date)) return value;

  let month = String(date.getMonth() + 1).padStart(2, "0");
  let day = String(date.getDate()).padStart(2, "0");
  let year = date.getFullYear();

  let hours = date.getHours();
  let minutes = String(date.getMinutes()).padStart(2, "0");
  let ampm = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  hours = hours ? hours : 12;
  hours = String(hours).padStart(2, "0");

  return `${month}/${day}/${year} ${hours}:${minutes} ${ampm}`;
}




function setupSerialLinks() {
  const rowModal = document.getElementById("rowModal");
  const rowDataContainer = document.getElementById("rowDataContainer");
  const closeRowModalBtn = document.getElementById("closeRowModalBtn");

  if (!rowModal || !rowDataContainer || !closeRowModalBtn) return;

  document.querySelectorAll(".serial-link").forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();

      const rowIndex = this.dataset.rowIndex;
      const record = allRows.find(
        (r) => String(r.__rowIndex) === String(rowIndex)
      );

      if (!record) return;

      rowDataContainer.innerHTML = `
        <p><strong>SERIAL NUMBER:</strong> ${record["SERIAL NUMBER"] || "-"}</p>
        <p><strong>CLIENT:</strong> ${record["CLIENT"] || "-"}</p>
        <p><strong>GENDER:</strong> ${record["GENDER"] || "-"}</p>
        <p><strong>TYPE OF DOCUMENT:</strong> ${record["TYPE OF DOCUMENT"] || "-"}</p>
        <p><strong>DOCUMENT:</strong> ${record["DOCUMENT"] || "-"}</p>
        
        <p><strong>PERSONNEL IN-CHARGE:</strong> ${record["PERSONNEL IN-CHARGE"] || "-"}</p>
        <p><strong>DOCUMENT CLASSIFICATION:</strong> ${record["DOCUMENT CLASSIFICATION"] || record["DOCUMENT CLASSIFICATION "] || "-"}</p>
        <p><strong>DATE RECEIVED OD:</strong> ${formatDateTime(record["DATE RECEIVED OD"])}</p>
        <p><strong>DATE ROUTED TO PENRO:</strong> ${formatDateTime(record["DATE ROUTED TO PENRO"])}</p>
        <p><strong>DATE RELEASED PENRO:</strong> ${formatDateTime(record["DATE RELEASED PENRO"])}</p>
        <p><strong>DIVISION:</strong> ${record["DIVISION"] || "-"}</p>
        <p><strong>DATE RELEASED:</strong> ${formatDateTime(record["DATE RELEASED"])}</p>
        <p><strong>FILE URL:</strong> ${record["FILE URL"] || "-"}</p>
     
      `;

      rowModal.classList.add("show");
    });
  });

  closeRowModalBtn.onclick = function () {
    rowModal.classList.remove("show");
  };

  rowModal.onclick = function (e) {
    if (e.target === rowModal) {
      rowModal.classList.remove("show");
    }
  };
}





/* ==============================
   START
============================== */
document.addEventListener("DOMContentLoaded", () => {
  setupInstructionModal();
  setupPersonnelDropdown();
  loadPersonnelCheckboxList();
  loadDataFromSheet(true, true);
  startAutoUpdate();

  if (searchBtn) {
  searchBtn.addEventListener("click", function () {
    filterTable();
  });
}

if (searchBox) {
  searchBox.addEventListener("input", function () {
    const value = this.value.trim();

    clearTimeout(searchIdleTimer);

    // ✅ If search box is empty after backspace, refresh full table
    if (value === "") {
      isSearching = false;
      isTypingSearch = false;

      searchIdleTimer = setTimeout(() => {
        loadDataFromSheet(false); // reload all records
      }, 300);

      return;
    }

    // ✅ If user is typing/searching, stop auto refresh
    isSearching = true;
    isTypingSearch = true;

    searchIdleTimer = setTimeout(() => {
      isTypingSearch = false;
    }, 500);
  });

  searchBox.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      filterTable();
    }
  });
}
  if (saveBtn) {
    saveBtn.addEventListener("click", updateRecord);
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", clearAllFields);
  }
});





window.addEventListener("load", () => {
  newDataAudio = new Audio(NEW_DATA_RINGTONE_SRC);

  newDataAudio.load();

  newDataAudio.play()
    .then(() => {
      newDataAudio.pause();
      newDataAudio.currentTime = 0;
      notificationSoundReady = true;
      console.log("Sound initialized.");
    })
    .catch(() => {
      console.log("Waiting for first user click.");
    });
});



function loadInstructionFromRowToModal(rowData) {
  const personnelField = document.getElementById("instructionPersonnel");
  const documentField = document.getElementById("instructionDocument");
  const messageField = document.getElementById("instructionMessage");
  const saveInstructionBtn = document.getElementById("sendInstructionBtn");

  if (!personnelField || !documentField || !messageField) return;

  const firstPersonnel = selectedPersonnel.length > 0 ? selectedPersonnel[0] : "";

  const savedInstruction =
    rowData["INSTRUCTIONS"] && rowData["INSTRUCTIONS"] !== "-"
      ? String(rowData["INSTRUCTIONS"]).trim()
      : "";

  const docClass =
    rowData["DOCUMENT CLASSIFICATION"] ||
    rowData["DOCUMENT CLASSIFICATION "] ||
    "-";

  personnelField.value = firstPersonnel || "";
  documentField.value = docClass;
  messageField.value = savedInstruction;

  currentInstructionRecipient = firstPersonnel || "";

  if (saveInstructionBtn) {
    saveInstructionBtn.textContent = savedInstruction ? "Update" : "Save";
  }
}


function getInstructionModalState() {
  const personnelField = document.getElementById("instructionPersonnel");
  const documentField = document.getElementById("instructionDocument");
  const messageField = document.getElementById("instructionMessage");

  return {
    personnel: personnelField ? personnelField.value.trim() : "",
    documentClassification: documentField ? documentField.value.trim() : "",
    message: messageField ? messageField.value.trim() : ""
  };
}

function setInstructionInitialState() {
  instructionInitialState = getInstructionModalState();
  isInstructionDirty = false;
}

function checkInstructionDirty() {
  const current = getInstructionModalState();

  isInstructionDirty =
    current.personnel !== instructionInitialState.personnel ||
    current.documentClassification !== instructionInitialState.documentClassification ||
    current.message !== instructionInitialState.message;

  return isInstructionDirty;
}

function confirmDiscardInstructionChanges() {
  if (!checkInstructionDirty()) return true;

  return confirm("You have unsaved instruction changes. Discard them?");
}



function showUpdateSuccess() {
  const overlay = document.getElementById("updateSuccessOverlay");
  if (!overlay) return;
  overlay.classList.add("show");
}

function hideUpdateSuccess() {
  const overlay = document.getElementById("updateSuccessOverlay");
  if (!overlay) return;
  overlay.classList.remove("show");
}




function buildInstructionCellText() {
  let blocks = [];

  selectedPersonnel.forEach((name) => {
    const saved = instructionStore[name];

    if (saved && saved.message && saved.message.trim() !== "") {
      blocks.push(
`${saved.message.trim()}
- ${name}`
      );
    }
  });

  return blocks.join("\n\n--------------------------------------------------------------------------------------------------------------\n\n");
}

function parseInstructionCellText(rawText) {
  const parsed = {};

  if (!rawText || rawText === "-") return parsed;

  const blocks = String(rawText)
    .split(/-{20,}/)
    .map(b => b.trim())
    .filter(Boolean);

  blocks.forEach(block => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    const lastLine = lines[lines.length - 1];

    if (lastLine && lastLine.startsWith("- ")) {
      const name = lastLine.replace("- ", "").trim();
      const message = lines.slice(0, -1).join("\n").trim();

      parsed[name] = {
        personnel: name,
        documentClassification: documentInput?.value || "",
        message: message,
        savedAt: new Date().toLocaleString()
      };
    }
  });

  return parsed;
}


function setupActionTakenViewLinks() {
   let modal = document.getElementById("actionTakenModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "actionTakenModal";
    modal.className = "modal-notification";

    modal.innerHTML = `
      <div class="modal-content">
        <h2>ACTION TAKEN</h2>
        <div id="actionTakenContent"></div>
        <button id="closeActionTakenModal">Close</button>
      </div>
    `;

    document.body.appendChild(modal);
  }

  const content = document.getElementById("actionTakenContent");
  const closeBtn = document.getElementById("closeActionTakenModal");

  document.querySelectorAll(".action-view-link").forEach(link => {
    link.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();

      const actionText = decodeURIComponent(this.dataset.action || "");

      if (!actionText) {
        content.innerHTML = "<i>No action taken available</i>";
        modal.classList.add("show");
        return;
      }

      // ✅ removes lines ONLY in modal display
      // ✅ spreadsheet data is NOT changed
      const entries = actionText
        .split(/-{20,}/g)
        .map(item => item.trim())
        .filter(item => item !== "");

      content.innerHTML = entries.map((entry, index) => `
        <div class="action-entry">
          <span class="action-number">${index + 1}.</span>
          <div class="action-text">${entry.replace(/\n/g, "<br>")}</div>
        </div>
      `).join("");

      modal.classList.add("show");
    };
  });

  closeBtn.onclick = function () {
    modal.classList.remove("show");
  };

  modal.onclick = function (e) {
    if (e.target === modal) {
      modal.classList.remove("show");
    }
  };
}

const toggleBtn = document.getElementById("sidebarToggle");
const sidebar = document.getElementById("sidebar");
const mainContent = document.querySelector(".main-content");

function closeSidebar() {
  sidebar.classList.remove("show");
  mainContent.classList.remove("shift");
}

function openSidebar() {
  sidebar.classList.add("show");
  mainContent.classList.add("shift");
}

/* ALWAYS HIDDEN WHEN PAGE OPENS AFTER LOGIN */
document.addEventListener("DOMContentLoaded", closeSidebar);

toggleBtn.addEventListener("click", function (e) {
  e.stopPropagation();

  if (sidebar.classList.contains("show")) {
    closeSidebar();
  } else {
    openSidebar();
  }
});

sidebar.addEventListener("click", function (e) {
  e.stopPropagation();
});

document.addEventListener("click", closeSidebar);





document.getElementById("logoutBtn").addEventListener("click", function (e) {
  e.preventDefault();
  e.stopPropagation();

  const confirmLogout = confirm("Are you sure you want to log out?");

  if (!confirmLogout) {
    return;
  }

  showLogoutLoader();

  setTimeout(function () {
    localStorage.removeItem("benroDivision");
    localStorage.removeItem("benroEmployee");
    localStorage.removeItem("benroRole");
    localStorage.removeItem("benroPosition");
    localStorage.removeItem("benroUsername");
    localStorage.removeItem("benroProfile");
    localStorage.removeItem("instructionStore");

    window.location.href = "BENRO-IICTS_LOGIN.html";
  }, 900);
});




/* ==================================================
   ACTION TAKEN VIEW LINK INSIDE COMMUNICATION DETAILS
================================================== */

function escapeHTML(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatActionTakenForModal(actionText) {
  if (!actionText || actionText === "-") {
    return "<i>No action taken available</i>";
  }

  const entries = String(actionText)
    .split(/-{20,}/g)
    .map(e => e.trim())
    .filter(e => e !== "");

  if (entries.length === 0) {
    return "<i>No action taken available</i>";
  }

  return entries.map((entry, index) => `
    <div class="action-entry">
      <span class="action-number">${index + 1}.</span>
      <div class="action-text">${escapeHTML(entry).replace(/\n/g, "<br>")}</div>
    </div>
  `).join("");
}

document.addEventListener("click", function (e) {
  const viewLink = e.target.closest(".view-action-taken-link");
  if (!viewLink) return;

  e.preventDefault();
  e.stopPropagation();

  const actionText = decodeURIComponent(viewLink.dataset.action || "");

  const modal = document.getElementById("actionTakenModal");
  const content = document.getElementById("actionTakenContent");

  content.innerHTML = formatActionTakenForModal(actionText);
  modal.classList.add("show");
});

document.getElementById("closeActionTakenModal")?.addEventListener("click", function () {
  document.getElementById("actionTakenModal").classList.remove("show");
});




function loadLoggedInUserToSidebar() {
  const employeeName = localStorage.getItem("benroEmployee") || "ADMIN USER";
  const position = localStorage.getItem("benroPosition") || "Division Head";

  const nameDisplay = document.getElementById("sidebarEmployeeName");
  const positionDisplay = document.getElementById("sidebarUserPosition");

  if (nameDisplay) {
    nameDisplay.textContent = employeeName;
  }

  if (positionDisplay) {
    positionDisplay.textContent = position;
  }
}

document.addEventListener("DOMContentLoaded", function () {
  loadLoggedInUserToSidebar();
});



function convertDriveLinkToImageUrl(value) {
  if (!value || value.trim() === "") {
    return "photos/logopgb.png";
  }

  let text = value.trim();

  // If user pasted only the Google Drive file ID
  if (!text.includes("http")) {
    return "https://drive.google.com/uc?export=view&id=" + text;
  }

  // If user pasted full Google Drive link
  const match = text.match(/\/d\/([^/]+)/);

  if (match && match[1]) {
    return "https://drive.google.com/uc?export=view&id=" + match[1];
  }

  return text;
}

function loadLoggedInUserToSidebar() {
  const employeeName = localStorage.getItem("benroEmployee") || "ADMIN USER";
  const position = localStorage.getItem("benroPosition") || "Division Head";
  const profile = localStorage.getItem("benroProfile") || "";

  const nameDisplay = document.getElementById("sidebarEmployeeName");
  const positionDisplay = document.getElementById("sidebarUserPosition");
  const profilePic = document.getElementById("sidebarProfilePic");

  if (nameDisplay) {
    nameDisplay.textContent = employeeName;
  }

  if (positionDisplay) {
    positionDisplay.textContent = position;
  }

  if (profilePic) {
    profilePic.src = convertDriveLinkToImageUrl(profile);

    profilePic.onerror = function () {
      this.src = "photos/logopgb.png";
    };
  }
}

document.addEventListener("DOMContentLoaded", function () {
  loadLoggedInUserToSidebar();
});




function getGoogleDriveImageUrl(value) {
  if (!value || String(value).trim() === "") {
    return "photos/logopgb.png";
  }

  const text = String(value).trim();

  // If column G contains only the file ID
  if (!text.includes("http")) {
    return `https://drive.google.com/thumbnail?id=${text}&sz=w300`;
  }

  // If column G contains full Google Drive link
  const match = text.match(/\/d\/([^/]+)/);

  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w300`;
  }

  return text;
}

function loadLoggedInUserToSidebar() {
  const employeeName = localStorage.getItem("benroEmployee") || "ADMIN USER";
  const position = localStorage.getItem("benroPosition") || "Division Head";
  const profile = localStorage.getItem("benroProfile") || "";

  const nameDisplay = document.getElementById("sidebarEmployeeName");
  const positionDisplay = document.getElementById("sidebarUserPosition");
  const profilePic = document.getElementById("sidebarProfilePic");

  if (nameDisplay) {
    nameDisplay.textContent = employeeName;
  }

  if (positionDisplay) {
    positionDisplay.textContent = position;
  }

  if (profilePic) {
    const finalProfileUrl = getGoogleDriveImageUrl(profile);
    console.log("Profile from localStorage:", profile);
    console.log("Final profile image URL:", finalProfileUrl);

    profilePic.src = finalProfileUrl;

    profilePic.onerror = function () {
      console.warn("Profile image failed to load. Using default logo.");
      this.src = "photos/logopgb.png";
    };
  }
}

document.addEventListener("DOMContentLoaded", function () {
  loadLoggedInUserToSidebar();
});




function showRowDataBelowFromButton(rowIndex) {
  // ✅ FIXED: your array is allRows, not allData
  const rowData = allRows.find(item => String(item.__rowIndex) === String(rowIndex));

  if (!rowData) {
    console.warn("Row data not found for rowIndex:", rowIndex);
    return;
  }

  // ✅ Save selected row to hidden input used by updateRecord()
  rowIndexInput.value = rowData.__rowIndex;

  // ✅ Highlight selected row
  document.querySelectorAll("#dataGrid tbody tr").forEach(tr => {
    tr.classList.remove("selected-row");
  });

  const tr = document.querySelector(`#dataGrid tbody tr[data-row-index="${rowIndex}"]`);
  if (tr) {
    tr.classList.add("selected-row");
  }

  // ✅ FIXED: your labels are clientSource and documentSource
  clientSource.textContent = rowData["CLIENT"] || "-";
  documentSource.textContent = rowData["DOCUMENT"] || "-";

  // ✅ Clear ACTION TAKEN input
  if (outcomeInput) {
    outcomeInput.value = "";
  }

  // ✅ Fill DOCUMENT CLASSIFICATION
  documentInput.value =
    rowData["DOCUMENT CLASSIFICATION"] ||
    rowData["DOCUMENT CLASSIFICATION "] ||
    "";

  // ✅ Fill PERSONNEL IN-CHARGE below
  setPersonnelFromString(
    rowData["PERSONNEL IN-CHARGE"] && rowData["PERSONNEL IN-CHARGE"] !== "-"
      ? rowData["PERSONNEL IN-CHARGE"]
      : ""
  );

  // ✅ Load saved instructions for this row
  const savedInstruction =
    rowData["INSTRUCTIONS"] && rowData["INSTRUCTIONS"] !== "-"
      ? String(rowData["INSTRUCTIONS"]).trim()
      : "";

  instructionStore = parseInstructionCellText(savedInstruction);
  saveInstructionsToLocal();
  updatePersonnelDisplay();

  // ✅ Also prepare instruction modal data
  loadInstructionFromRowToModal(rowData);

  console.log("Button selected row:", rowData);
}



/* ==================================================
   CLEAR CLIENT + DOCUMENT + ROW HIGHLIGHT
   WHEN CLICKING EMPTY SPACE
================================================== */

function setupClearSelectionOnBlankClick() {
  document.addEventListener("click", function (e) {
    /*
      ✅ DO NOT CLEAR when clicking these areas:
      - data grid/table
      - search box/search button
      - update/clear button
      - bottom input row
      - personnel dropdown
      - modals
      - sidebar
    */
    if (
      e.target.closest("#dataGrid") ||
      e.target.closest(".table-container") ||
      e.target.closest("#searchBox") ||
      e.target.closest("#searchBtn") ||
      e.target.closest("#saveBtn") ||
      e.target.closest("#clearBtn") ||
      e.target.closest(".bottom-row") ||
      e.target.closest(".multi-select-wrapper") ||
      e.target.closest(".modal-notification") ||
      e.target.closest("#instructionModal") ||
      e.target.closest("#rowModal") ||
      e.target.closest("#actionTakenModal") ||
      e.target.closest("#sidebar") ||
      e.target.closest("#sidebarToggle") ||
      e.target.closest("button") ||
      e.target.closest("a")
    ) {
      return;
    }

    // ✅ Clear CLIENT and DOCUMENT display
    if (clientSource) {
      clientSource.textContent = "-";
    }

    if (documentSource) {
      documentSource.textContent = "-";
    }

    // ✅ Clear selected row index
    if (rowIndexInput) {
      rowIndexInput.value = "";
    }

    // ✅ Remove highlight from data grid
    document.querySelectorAll("#dataGrid tbody tr").forEach(function (row) {
      row.classList.remove("selected-row");
    });
  });
}


/* ==================================================
   RUN CLEAR-SELECTION FUNCTION WHEN PAGE LOADS
================================================== */

document.addEventListener("DOMContentLoaded", function () {
  setupClearSelectionOnBlankClick();
});




/* ==================================================
   DISABLE BROWSER BACK / FORWARD INSIDE WEB APP
   Browser only - not system settings
================================================== */

(function disableBrowserBackForward() {
  // Put the current page in browser history
  history.pushState(null, "", location.href);

  // When user clicks browser Back or Forward, keep them here
  window.addEventListener("popstate", function () {
    history.pushState(null, "", location.href);
  });

  // Block keyboard browser shortcuts
  document.addEventListener("keydown", function (e) {
    const activeElement = document.activeElement;
    const tagName = activeElement ? activeElement.tagName.toLowerCase() : "";

    const isTyping =
      tagName === "input" ||
      tagName === "textarea" ||
      activeElement?.isContentEditable;

    // Block ALT + LEFT and ALT + RIGHT
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Block BACKSPACE browser back only when not typing
    if (e.key === "Backspace" && !isTyping) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  });

  // Block browser swipe back/forward on phones/tablets
  let startX = 0;
  let startY = 0;

  document.addEventListener(
    "touchstart",
    function (e) {
      if (!e.touches || e.touches.length === 0) return;

      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    },
    { passive: false }
  );

  document.addEventListener(
    "touchmove",
    function (e) {
      if (!e.touches || e.touches.length === 0) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;

      const diffX = currentX - startX;
      const diffY = currentY - startY;

      // Mostly horizontal swipe
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 30) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // Block trackpad horizontal swipe back/forward
  document.addEventListener(
    "wheel",
    function (e) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 20) {
        e.preventDefault();
      }
    },
    { passive: false }
  );
})();





/* ==================================================
   MAKE BROWSER PREVIOUS / NEXT BUTTON NOT WORK
   Browser Back / Forward will stay on current page
================================================== */

(function blockBrowserPreviousNextButtons() {
  // ✅ Add fake history entries so browser Previous/Next has nowhere useful to go
  function lockHistory() {
    history.pushState({ pageLocked: true }, "", location.href);
    history.pushState({ pageLocked: true }, "", location.href);
  }

  lockHistory();

  // ✅ When user presses browser Previous or Next, return to the same page
  window.addEventListener("popstate", function () {
    setTimeout(function () {
      history.pushState({ pageLocked: true }, "", location.href);
    }, 0);
  });

  // ✅ Extra protection: keep current page locked when tab becomes active again
  window.addEventListener("pageshow", function () {
    setTimeout(function () {
      history.pushState({ pageLocked: true }, "", location.href);
    }, 0);
  });

  // ✅ Block keyboard browser previous/next shortcuts
  document.addEventListener("keydown", function (e) {
    const activeElement = document.activeElement;
    const tagName = activeElement ? activeElement.tagName.toLowerCase() : "";

    const isTyping =
      tagName === "input" ||
      tagName === "textarea" ||
      activeElement?.isContentEditable;

    // ALT + LEFT / ALT + RIGHT
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Backspace browser back, only when not typing
    if (e.key === "Backspace" && !isTyping) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  });
})();






/* ==============================
   NEW DATA MP3 RINGTONE
============================== */

const NEW_DATA_SOUND_KEY = "benroKnownVisibleReleasedRecords";

// ✅ Change this path to your MP3 file path
const NEW_DATA_RINGTONE_SRC = "RINGTONE/RINGTONE(2).mp3";

let newDataAudio = null;
let notificationSoundReady = false;
let pendingNewDataRing = false;
let notificationIsPlaying = false;

// ✅ Browser needs one click/keypress before sound can play
function initNotificationSound() {
  if (!newDataAudio) {
    newDataAudio = new Audio(NEW_DATA_RINGTONE_SRC);
    newDataAudio.preload = "auto";
    newDataAudio.volume = 1.0;
  }

  notificationSoundReady = true;

  if (pendingNewDataRing) {
    pendingNewDataRing = false;
    playNewDataRingtone();
  }
}

document.addEventListener("click", initNotificationSound, { once: true });
document.addEventListener("keydown", initNotificationSound, { once: true });

function requestNewDataRingtone() {
  if (!notificationSoundReady) {
    pendingNewDataRing = true;
    return;
  }

  playNewDataRingtone();
}

function playNewDataRingtone() {
 newDataAudio.onended = () => {
  notificationIsPlaying = false;
};

  if (!newDataAudio) {
    newDataAudio = new Audio(NEW_DATA_RINGTONE_SRC);
    newDataAudio.preload = "auto";
    newDataAudio.volume = 1.0;
  }

  notificationIsPlaying = true;

  newDataAudio.pause();
  newDataAudio.currentTime = 0;

  newDataAudio.play()
    .then(() => {
      console.log("New data ringtone played.");
    })
    .catch(err => {
      console.warn("Ringtone blocked or failed:", err);
      pendingNewDataRing = true;
    });

  
}

function getRowSoundId(row) {
  if (!row) return "";

  const serial = normalizeText(row["SERIAL NUMBER"]);

  if (serial) {
    return serial;
  }

  return normalizeText(
    (row["CLIENT"] || "") + "|" +
    (row["DOCUMENT"] || "") + "|" +
    (row["DATE RECEIVED OD"] || "") + "|" +
    (row["DIVISION"] || "")
  );
}

function checkNewDataAndRing(visibleReleasedRows) {
  const ids = [...new Set(
    visibleReleasedRows
      .map(row => getRowSoundId(row))
      .filter(id => id !== "")
  )];

  const firstCheck = sessionStorage.getItem(NEW_DATA_SOUND_KEY) === null;

  let oldIds = [];

  try {
    oldIds = JSON.parse(sessionStorage.getItem(NEW_DATA_SOUND_KEY) || "[]");
  } catch (err) {
    oldIds = [];
  }

  const newIds = ids.filter(id => !oldIds.includes(id));

  // ✅ Save new IDs for row highlight
  latestNewDataIds = firstCheck ? [] : newIds;

  // ✅ First load: just remember existing records, do not ring
  if (firstCheck) {
    sessionStorage.setItem(NEW_DATA_SOUND_KEY, JSON.stringify(ids));

    if (RING_ON_FIRST_LOAD && ids.length > 0) {
      requestNewDataRingtone();
    }

    return;
  }

  // ✅ Ring only when new data arrives after page already loaded
  if (newIds.length > 0) {
  console.log("NEW DATA FOUND");
  console.log(newIds);

  

  requestNewDataRingtone();
}

  sessionStorage.setItem(NEW_DATA_SOUND_KEY, JSON.stringify(ids));
}





/* ==================================================
   PENRO NOTIFICATION SYSTEM
   Same style as Division / Employee notification
================================================== */

const PENRO_NOTIFICATION_READ_KEY = "penroReadNotifications";
const PENRO_NOTIFICATION_KNOWN_KEY = "penroKnownNotifications";

let penroNotificationRows = [];

function getPenroNotificationId(row) {
  if (!row) return "";

  if (typeof getRowSoundId === "function") {
    return getRowSoundId(row);
  }

  return normalizeText(
    (row["SERIAL NUMBER"] || "") + "|" +
    (row["CLIENT"] || "") + "|" +
    (row["DOCUMENT"] || "") + "|" +
    (row["DATE RECEIVED OD"] || "") + "|" +
    (row["DIVISION"] || "")
  );
}

function getPenroReadNotificationIds() {
  try {
    return JSON.parse(localStorage.getItem(PENRO_NOTIFICATION_READ_KEY) || "[]");
  } catch (err) {
    return [];
  }
}

function savePenroReadNotificationIds(ids) {
  localStorage.setItem(
    PENRO_NOTIFICATION_READ_KEY,
    JSON.stringify([...new Set(ids)])
  );
}

function getPenroNotificationDate(row) {
  return (
    row["DATE RELEASED"] ||
    row["DATE RELEASED PENRO"] ||
    row["DATE RECEIVED OD"] ||
    ""
  );
}

function getPenroTimeAgo(value) {
  if (!value || value === "-") return "";

  const date = new Date(value);
  if (isNaN(date)) return "";

  const now = new Date();
  const diffMs = now - date;

  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return diffMin + " min ago";
  if (diffHr < 24) return diffHr + " hr ago";
  return diffDay + " day ago";
}

function updatePenroNotifications(rows) {
  if (!Array.isArray(rows)) return;

  const releasedRows = rows
    .filter(row => {
      if (typeof isReleasedRow === "function") {
        return isReleasedRow(row);
      }

      return true;
    })
    .sort((a, b) => {
      if (typeof parseDate === "function") {
        return parseDate(getPenroNotificationDate(b)) - parseDate(getPenroNotificationDate(a));
      }

      return new Date(getPenroNotificationDate(b)) - new Date(getPenroNotificationDate(a));
    });

  penroNotificationRows = releasedRows;

  const currentIds = releasedRows
    .map(row => getPenroNotificationId(row))
    .filter(id => id !== "");

  const firstCheck =
    sessionStorage.getItem(PENRO_NOTIFICATION_KNOWN_KEY) === null;

  let readIds = getPenroReadNotificationIds();

  /*
    First load:
    Existing records will not all become green.
    Only new records after page is open will become unread/green.
  */
  if (firstCheck && localStorage.getItem(PENRO_NOTIFICATION_READ_KEY) === null) {
    readIds = currentIds;
    savePenroReadNotificationIds(readIds);
  }

  sessionStorage.setItem(
    PENRO_NOTIFICATION_KNOWN_KEY,
    JSON.stringify(currentIds)
  );

  renderPenroNotificationList();
}

function renderPenroNotificationList() {
  const list = document.getElementById("penroNotificationList");
  const badge = document.getElementById("penroNotificationBadge");
  const bellBtn = document.getElementById("penroNotificationBtn");

  if (!list || !badge) return;

  const readIds = getPenroReadNotificationIds();

  const unreadRows = penroNotificationRows.filter(row => {
    const id = getPenroNotificationId(row);
    return id && !readIds.includes(id);
  });

  if (unreadRows.length > 0) {
    badge.textContent = unreadRows.length;
    badge.style.display = "flex";

    if (bellBtn) {
      bellBtn.classList.add("has-new");
    }
  } else {
    badge.textContent = "0";
    badge.style.display = "none";

    if (bellBtn) {
      bellBtn.classList.remove("has-new");
    }
  }

  if (penroNotificationRows.length === 0) {
    list.innerHTML = `
      <div class="penro-empty-notification">
        No notifications yet.
      </div>
    `;
    return;
  }

  list.innerHTML = penroNotificationRows.map(row => {
    const id = getPenroNotificationId(row);
    const unread = !readIds.includes(id);

    const type = row["TYPE OF DOCUMENT"] || "COMMUNICATION INCOMING";
    const client = row["CLIENT"] || "-";
    const documentName = row["DOCUMENT"] || "-";

    const dateValue = getPenroNotificationDate(row);
    const timeAgo = getPenroTimeAgo(dateValue);

    return `
      <div class="penro-notification-item ${unread ? "unread" : ""}"
           data-notification-id="${id}"
           data-row-index="${row.__rowIndex}">
        
        <div class="penro-notification-top">
          <div class="penro-notification-type">${type}</div>
          <div class="penro-notification-time">${timeAgo}</div>
        </div>

        <div class="penro-notification-client">
          ${client}
        </div>

        <div class="penro-notification-document">
          ${documentName}
        </div>
      </div>
    `;
  }).join("");

  setupPenroNotificationItemClicks();
}

function setupPenroNotificationItemClicks() {
  document.querySelectorAll(".penro-notification-item").forEach(item => {
    item.addEventListener("click", function () {
      const id = this.dataset.notificationId;
      const rowIndex = this.dataset.rowIndex;

      let readIds = getPenroReadNotificationIds();

      if (id && !readIds.includes(id)) {
        readIds.push(id);
        savePenroReadNotificationIds(readIds);
      }

      renderPenroNotificationList();

      const panel = document.getElementById("penroNotificationPanel");
      if (panel) {
        panel.classList.remove("show");
      }

      document.querySelectorAll("#dataGrid tbody tr").forEach(row => {
        row.classList.remove("selected-row");
      });

      const targetRow = document.querySelector(
        `#dataGrid tbody tr[data-row-index="${rowIndex}"]`
      );

      if (targetRow) {
        targetRow.classList.add("selected-row");
        targetRow.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }

      if (typeof showRowDataBelowFromButton === "function") {
        showRowDataBelowFromButton(rowIndex);
      }
    });
  });
}

function setupPenroNotificationButton() {
  const btn = document.getElementById("penroNotificationBtn");
  const panel = document.getElementById("penroNotificationPanel");

  if (!btn || !panel) return;

  btn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();

    panel.classList.toggle("show");
  });

  panel.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".penro-notification-wrapper")) {
      panel.classList.remove("show");
    }
  });
}

document.addEventListener("DOMContentLoaded", function () {
  setupPenroNotificationButton();
});