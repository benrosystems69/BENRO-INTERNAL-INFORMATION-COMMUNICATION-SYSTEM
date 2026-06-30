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

const notificationAudio = new Audio("RINGTONE/RINGTONE(2).mp3");
notificationAudio.preload = "auto";

let previousAssignedKeys = [];
let firstNotificationLoad = true;
let ringtoneTimer = null;



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
  // ✅ Prevent null error if personnelDisplay does not exist in this page
  if (!personnelDisplay) {
    if (personnelHidden) {
      personnelHidden.value = selectedPersonnel.join(" | ");
    }
    return;
  }

  personnelDisplay.innerHTML = "";

  if (selectedPersonnel.length === 0) {
    personnelDisplay.innerHTML =
      '<span class="placeholder-text">PERSONNEL IN-CHARGE</span>';

    if (personnelHidden) {
      personnelHidden.value = "";
    }

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

    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = hasInstruction
      ? "personnel-btn edit-btn"
      : "personnel-btn add-btn";
    actionBtn.textContent = hasInstruction ? "✎" : "✉";
    actionBtn.title = hasInstruction ? "Edit Instruction" : "Add Instruction";

    actionBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      openInstructionModal(name);
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "personnel-btn remove";
    removeBtn.type = "button";
    removeBtn.innerHTML = "✖";
    removeBtn.title = "Remove Personnel";

    removeBtn.addEventListener("click", function (e) {
      e.stopPropagation();

      const instructionModal = document.getElementById("instructionModal");
      const modalIsOpen =
        instructionModal && instructionModal.classList.contains("show");

      if (modalIsOpen && !confirmDiscardInstructionChanges()) {
        return;
      }

      selectedPersonnel = selectedPersonnel.filter((p) => p !== name);

      delete instructionStore[name];
      saveInstructionsToLocal();

      if (personnelHidden) {
        personnelHidden.value = selectedPersonnel.join(" | ");
      }

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

  if (personnelHidden) {
    personnelHidden.value = selectedPersonnel.join(" | ");
  }
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
   DATA LOAD
============================== */


function normalizeText(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function rowMatchesLoggedInDivision(rowDivisionText) {
  const loggedDivision = normalizeText(localStorage.getItem("benroDivision"));

  if (!loggedDivision) return true; // if no division saved, do not block

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
  const loggedEmployee = normalizeText(
    localStorage.getItem("benroEmployee") ||
    document.getElementById("sidebarEmployeeName")?.textContent ||
    ""
  );

  if (!loggedEmployee) return false;
  if (!personnelText || personnelText === "-") return false;

  const personnelNames = String(personnelText)
    .split(/\s*\|\s*|\n|;/)
    .map(name => normalizeText(name))
    .filter(name => name !== "");

  // exact name match
  return personnelNames.includes(loggedEmployee);
}


async function loadDataFromSheet(showAlert = false, showLoader = false) {
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

      if (typeof updateNotificationBell === "function") {
        updateNotificationBell([]);
      }

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

      if (typeof updateNotificationBell === "function") {
        updateNotificationBell([]);
      }

      return;
    }

   /* ==========================================
   EMPLOYEE ASSIGNMENT DETECTION
========================================== */

const loggedEmployee =
  (localStorage.getItem("benroEmployee") || "")
    .trim()
    .toUpperCase();

const currentAssignedKeys = [];

filteredRows.forEach(row => {
  const serial = String(row["SERIAL NUMBER"] || "").trim();

  const personnel = String(
    row["PERSONNEL IN-CHARGE"] || ""
  ).toUpperCase();

  if (
    serial &&
    personnel.includes(loggedEmployee)
  ) {
    currentAssignedKeys.push(serial);
  }
});

if (firstNotificationLoad) {
  previousAssignedKeys = [...currentAssignedKeys];
  firstNotificationLoad = false;
}
else {
  const newAssignments =
    currentAssignedKeys.filter(
      key => !previousAssignedKeys.includes(key)
    );

  if (newAssignments.length > 0) {
    console.log(
      "🔔 New assignment received:",
      newAssignments
    );

    startNotificationRingtone();
  }

  previousAssignedKeys =
    [...currentAssignedKeys];
}
    /* ========================================================= */

    filteredRows.sort(
      (a, b) => parseDate(b["DATE RECEIVED OD"]) - parseDate(a["DATE RECEIVED OD"])
    );

    renderTable(filteredRows);

    // ✅ Load same rows into notification bell
    if (typeof updateNotificationBell === "function") {
      updateNotificationBell(filteredRows);
    }

  } catch (error) {
    console.error("Failed to load data:", error);

    if (showAlert) {
      alert("Failed to load data:\n" + error.message);
    }
  } finally {
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

  const loggedEmployee = normalizeText(
    localStorage.getItem("benroEmployee") ||
    document.getElementById("sidebarEmployeeName")?.textContent ||
    ""
  );

  const names = String(personnelText)
    .split(/\s*\|\s*|\n|;/) // do not split by comma
    .map(name => name.trim())
    .filter(name => name !== "");

  return `
    <div class="personnel-cell">
      ${names.map(name => {
        const isLoggedEmployee = normalizeText(name) === loggedEmployee;

        return `
          <div class="personnel-item no-buttons">
            <span class="personnel-name ${isLoggedEmployee ? "highlight-personnel-name" : ""}">
              ${name}
            </span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderTable(rows) {
  tableBody.innerHTML = "";

  rows.forEach((d, index) => {
   const tr = document.createElement("tr");
tr.dataset.rowIndex = d.__rowIndex;

// ✅ Add this so hover can read the INSTRUCTIONS column
tr.dataset.instructions =
  d["INSTRUCTIONS"] && d["INSTRUCTIONS"] !== "-"
    ? d["INSTRUCTIONS"]
    : "";

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
        <button class="open-btn" data-file="${d["FILE URL"] || ""}">Open</button>
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

  // ✅ clear old instruction state first
  instructionStore = {};

const savedInstruction =
  d["INSTRUCTIONS"] && d["INSTRUCTIONS"] !== "-"
    ? String(d["INSTRUCTIONS"]).trim()
    : "";

instructionStore = parseInstructionCellText(savedInstruction);

  saveInstructionsToLocal();
  updatePersonnelDisplay();

  // ✅ also load the clicked row instruction into modal fields
  loadInstructionFromRowToModal(d);
});

tr.addEventListener("mouseenter", function () {
  showInstructionHoverBox(this.dataset.instructions);
});

tr.addEventListener("mouseleave", function () {
  scheduleHideInstructionHoverBox();
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

  isClearing = true;

  // ✅ Clear selected row index
  if (rowIndexInput) rowIndexInput.value = "";

  // ✅ Clear ACTION TAKEN / OUTCOME
  if (outcomeInput) outcomeInput.value = "";

  // ✅ Clear hidden/extra fields if they exist
  if (personnelInput) personnelInput.value = "";
  if (documentInput) documentInput.value = "";
  if (personnelHidden) personnelHidden.value = "";

  // ✅ Clear CLIENT and DOCUMENT display
  if (clientSource) clientSource.textContent = "-";
  if (documentSource) documentSource.textContent = "-";

  // ✅ Clear selected personnel
  selectedPersonnel = [];

  if (typeof updatePersonnelDisplay === "function") {
    updatePersonnelDisplay();
  }

  if (typeof renderPersonnelOptions === "function") {
    renderPersonnelOptions(allPersonnelNames);
  }

  // ✅ Clear instruction data
  instructionStore = {};
  localStorage.removeItem("instructionStore");

  // ✅ Remove selected row highlight
  document.querySelectorAll("#dataGrid tbody tr").forEach(row => {
    row.classList.remove("selected-row");
  });

  // ✅ Close dropdown if open
  const personnelSearch = document.getElementById("personnelSearch");
  const personnelDropdown = document.getElementById("personnelDropdown");

  if (personnelSearch) personnelSearch.value = "";
  if (personnelDropdown) personnelDropdown.classList.remove("show");

  // ✅ Close instruction modal if open
  const instructionModal = document.getElementById("instructionModal");
  if (instructionModal) {
    instructionModal.classList.remove("show");
  }

  isInstructionDirty = false;

  setTimeout(() => {
    isClearing = false;
  }, 200);
}

/* ==============================
   UPDATE RECORD - FIXED
============================== */
/* ==============================
   UPDATE RECORD - FIXED
============================== */
async function updateRecord(e) {
  // ✅ Prevent refresh / form submit
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const rowIndex = rowIndexInput.value.trim();

  if (!rowIndex) {
    alert("⚠️ Please click/select a row first.");
    return;
  }

  const outcome = outcomeInput.value.trim();

  if (!outcome) {
    alert("⚠️ Please enter ACTION TAKEN.");
    outcomeInput.focus();
    return;
  }

  const selectedRow = allRows.find(
    r => String(r.__rowIndex) === String(rowIndex)
  );

  if (!selectedRow) {
    alert("⚠️ Selected row data not found. Please click the row again.");
    return;
  }

  const serialNumber = String(selectedRow["SERIAL NUMBER"] || "").trim();

  if (!serialNumber || serialNumber === "-") {
    alert("⚠️ Serial number not found. Please reload the page and select the row again.");
    return;
  }

  const updatedBy =
    localStorage.getItem("benroEmployee") ||
    localStorage.getItem("benroUsername") ||
    "UNKNOWN USER";

  // ✅ Keep existing values
  const existingPersonnel =
    selectedRow["PERSONNEL IN-CHARGE"] &&
    selectedRow["PERSONNEL IN-CHARGE"] !== "-"
      ? selectedRow["PERSONNEL IN-CHARGE"]
      : "";

  const existingDocumentClassification =
    selectedRow["DOCUMENT CLASSIFICATION"] ||
    selectedRow["DOCUMENT CLASSIFICATION "] ||
    "";

  const existingInstructions =
    selectedRow["INSTRUCTIONS"] && selectedRow["INSTRUCTIONS"] !== "-"
      ? selectedRow["INSTRUCTIONS"]
      : "";

  const payload = {
    action: "UPDATE_FIELDS",

    // ✅ Keep rowIndex for current local sheet
    rowIndex: Number(rowIndex),

    // ✅ Add serial number so backend can update safely
    serialNumber: serialNumber,
    "SERIAL NUMBER": serialNumber,

    OUTCOME: outcome,
    outcome: outcome,
    actionTaken: outcome,

    "PERSONNEL IN-CHARGE": existingPersonnel,
    personnelInCharge: existingPersonnel,

    "DOCUMENT CLASSIFICATION": existingDocumentClassification,
    documentClassification: existingDocumentClassification,

    INSTRUCTIONS: existingInstructions,
    instructionMessage: existingInstructions,

    updatedBy: updatedBy,
    actionTakenBy: updatedBy
  };

  console.log("EMPLOYEE UPDATE PAYLOAD:", payload);

  const originalText = saveBtn.textContent;

  saveBtn.disabled = true;
  saveBtn.textContent = "UPDATING...";
  saveBtn.style.opacity = "0.6";

  try {
    const res = await fetch(googleSheetsUrl, {
      method: "POST",

      // ✅ Apps Script-friendly, avoids CORS/preflight issue
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },

      body: JSON.stringify(payload)
    });

    const text = await res.text();
    console.log("UPDATE RESPONSE:", text);

    if (!text || text.trim() === "") {
      throw new Error("Empty response from Apps Script.");
    }

    let result;

    try {
      result = JSON.parse(text);
    } catch (jsonErr) {
      throw new Error("Apps Script did not return valid JSON:\n" + text);
    }

    if (result.success === false || result.status === "error") {
      throw new Error(result.message || result.error || "Update failed.");
    }

    alert("✅ ACTION TAKEN updated successfully.");

// ✅ Clear action taken only
if (outcomeInput) {
  outcomeInput.value = "";
}

// ✅ Clear selected row safely
if (rowIndexInput) {
  rowIndexInput.value = "";
}

if (clientSource) {
  clientSource.textContent = "-";
}

if (documentSource) {
  documentSource.textContent = "-";
}

document.querySelectorAll("#dataGrid tbody tr").forEach(row => {
  row.classList.remove("selected-row");
});

// ✅ Reload fresh data
loadDataFromSheet(false, false);

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
/* ==============================
   AUTO REFRESH - FIXED
============================== */
function startAutoUpdate() {
  setInterval(() => {
    const searchValue = searchBox ? searchBox.value.trim() : "";
    const actionTakenValue = outcomeInput ? outcomeInput.value.trim() : "";
    const selectedRowValue = rowIndexInput ? rowIndexInput.value.trim() : "";

    // ✅ Do not refresh while user is working
    if (
      searchValue !== "" ||
      isSearching ||
      isTypingSearch ||
      actionTakenValue !== "" ||
      selectedRowValue !== "" ||
      document.activeElement === outcomeInput ||
      document.activeElement === searchBox
    ) {
      console.log("Auto-refresh paused while user is working.");
      return;
    }

    console.log("Auto-refreshing data...");
    loadDataFromSheet(false);

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
   START - FIXED STARTUP LOAD
============================== */
document.addEventListener("DOMContentLoaded", async function () {
  try {
    showStartupLoader();

    // ✅ Load sidebar user first
    if (typeof loadLoggedInUserToSidebar === "function") {
      loadLoggedInUserToSidebar();
    }

    // ✅ Setup modals/dropdowns
   // ✅ Setup notification bell first
if (typeof setupNotificationBell === "function") {
  setupNotificationBell();
}

// ✅ Setup modals/dropdowns
setupInstructionModal();
setupPersonnelDropdown();

    // ✅ Load personnel first before filtering records
    await loadPersonnelCheckboxList();

    // ✅ Load table data while startup loader is showing
    await loadDataFromSheet(true, false);

    // ✅ Start auto refresh only after first load is done
    startAutoUpdate();

    // ✅ Search button
    if (searchBtn) {
      searchBtn.addEventListener("click", function (e) {
        e.preventDefault();
        filterTable();
      });
    }

    // ✅ Search box
    if (searchBox) {
      searchBox.addEventListener("input", function () {
        const value = this.value.trim();

        clearTimeout(searchIdleTimer);

        if (value === "") {
          isSearching = false;
          isTypingSearch = false;

          searchIdleTimer = setTimeout(() => {
            loadDataFromSheet(false, false);
          }, 300);

          return;
        }

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

    // ✅ Update button
    if (saveBtn) {
      saveBtn.type = "button";

      saveBtn.addEventListener("click", function (e) {
        updateRecord(e);
      });
    }

    // ✅ Clear button
    if (clearBtn) {
      clearBtn.type = "button";

      clearBtn.addEventListener("click", function (e) {
        clearAllFields(e);
      });
    }

  } catch (err) {
    console.error("Startup load error:", err);
    alert("Startup load error:\n" + err.message);
  } finally {
    hideStartupLoader();
  }
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
   STEADY HOVER INSTRUCTION BOX
   - Does not move with mouse
   - Can enter the box and scroll
   - Removes personnel name from display
   - Shows only instruction for logged-in employee
================================================== */

let instructionHoverHideTimer = null;
let mouseInsideInstructionHoverBox = false;
let mouseInsideInstructionRow = false;

function hasInstructionValue(instructionsText) {
  return (
    instructionsText &&
    String(instructionsText).trim() !== "" &&
    String(instructionsText).trim() !== "-"
  );
}

function getInstructionHoverBox() {
  let box = document.getElementById("instructionHoverBox");

  if (!box) {
    box = document.createElement("div");
    box.id = "instructionHoverBox";
    box.className = "instruction-hover-box";
    document.body.appendChild(box);

    box.addEventListener("mouseenter", function () {
      mouseInsideInstructionHoverBox = true;
      clearTimeout(instructionHoverHideTimer);
    });

    box.addEventListener("mouseleave", function () {
      mouseInsideInstructionHoverBox = false;
      scheduleHideInstructionHoverBox();
    });
  }

  return box;
}

function formatInstructionsForHover(instructionsText) {
  const loggedEmployee = normalizeText(
    localStorage.getItem("benroEmployee") ||
    document.getElementById("sidebarEmployeeName")?.textContent ||
    ""
  );

  if (!loggedEmployee) return "";

  const entries = String(instructionsText)
    .split(/-{20,}/g)
    .map(item => item.trim())
    .filter(item => item !== "");

  const matchedEntries = entries.filter(entry => {
    const lines = entry
      .split("\n")
      .map(line => line.trim())
      .filter(line => line !== "");

    if (lines.length === 0) return false;

    const lastLine = lines[lines.length - 1];

    if (!lastLine.startsWith("- ")) return false;

    const instructionName = normalizeText(
      lastLine.replace("- ", "").trim()
    );

    return instructionName === loggedEmployee;
  });

  const html = matchedEntries.map(entry => {
    const lines = entry
      .split("\n")
      .map(line => line.trim())
      .filter(line => line !== "");

    // ✅ remove name line like: - Abas, Karen Julie E.
    if (lines.length > 0 && lines[lines.length - 1].startsWith("- ")) {
      lines.pop();
    }

    const messageOnly = lines.join("\n").trim();

    if (!messageOnly) return "";

    return `
      <div class="hover-entry">
        ${escapeHTML(messageOnly).replace(/\n/g, "<br>")}
      </div>
    `;
  }).join("");

  return html.trim();
}

function showInstructionHoverBox(instructionsText) {
  mouseInsideInstructionRow = true;

  if (!hasInstructionValue(instructionsText)) {
    hideInstructionHoverBoxNow();
    return;
  }

  const box = getInstructionHoverBox();
  const html = formatInstructionsForHover(instructionsText);

  // ✅ If there is no instruction for logged-in employee, do not show box
  if (!html) {
    hideInstructionHoverBoxNow();
    return;
  }

  clearTimeout(instructionHoverHideTimer);

  box.innerHTML = html;
  box.classList.add("show");
}

function scheduleHideInstructionHoverBox() {
  mouseInsideInstructionRow = false;

  clearTimeout(instructionHoverHideTimer);

  instructionHoverHideTimer = setTimeout(function () {
    if (!mouseInsideInstructionHoverBox && !mouseInsideInstructionRow) {
      hideInstructionHoverBoxNow();
    }
  }, 350);
}

function hideInstructionHoverBoxNow() {
  clearTimeout(instructionHoverHideTimer);

  const box = document.getElementById("instructionHoverBox");

  if (box) {
    box.classList.remove("show");
  }
}




function showInstructionHoverBox(instructionsText) {
  mouseInsideInstructionRow = true;

  if (!hasInstructionValue(instructionsText)) {
    hideInstructionHoverBoxNow();
    return;
  }

  const box = getInstructionHoverBox();
  const html = formatInstructionsForHover(instructionsText);

  // ✅ If there is no instruction for logged-in employee, do not show box
  if (!html) {
    hideInstructionHoverBoxNow();
    return;
  }

  clearTimeout(instructionHoverHideTimer);

  // ✅ Store the instruction so VIEW button can read it
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  box.dataset.fullInstruction = tempDiv.innerText.trim();

  // ✅ Instruction text + VIEW button on right corner
  box.innerHTML = `
    <div class="instruction-hover-content">
      ${html}
    </div>

    <button type="button" class="view-instruction-btn">
      VIEW
    </button>
  `;

  box.classList.add("show");
}


/* ==================================================
   VIEW BUTTON FOR HOVER INSTRUCTIONS
   - Adds VIEW button in right corner
   - Opens instruction in modal notification
   - JS only, no need to add HTML manually
================================================== */

function setupInstructionViewModal() {
  // ✅ Create modal if it does not exist
  let modal = document.getElementById("instructionViewModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "instructionViewModal";
    modal.className = "modal-notification";

    modal.innerHTML = `
      <div class="modal-content instruction-view-modal-content">
        <h2>INSTRUCTIONS</h2>

        <div id="instructionViewContent" class="instruction-view-content"></div>

        <button type="button" id="closeInstructionViewModal">
          Close
        </button>
      </div>
    `;

    document.body.appendChild(modal);
  }

  // ✅ Add CSS by JS only
  if (!document.getElementById("instructionViewStyle")) {
    const style = document.createElement("style");
    style.id = "instructionViewStyle";

    style.textContent = `
      .instruction-hover-box {
        position: fixed;
        padding-right: 90px !important;
        box-sizing: border-box;
      }

      .instruction-hover-content {
        max-height: 130px;
        overflow-y: auto;
        padding-right: 8px;
      }

      .view-instruction-btn {
        position: absolute;
        top: 14px;
        right: 14px;
        background: #0d47a1;
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 6px 13px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        z-index: 999999;
      }

      .view-instruction-btn:hover {
        background: #08306f;
      }

      .instruction-view-modal-content {
        max-width: 540px;
        width: 90%;
      }

      .instruction-view-content {
        margin-top: 12px;
        max-height: 45vh;
        overflow-y: auto;
        text-align: left;
        white-space: pre-wrap;
        line-height: 1.6;
        font-size: 15px;
        color: #222;
        padding: 10px;
        border-radius: 8px;
        background: #f7f7f7;
      }

      #closeInstructionViewModal {
        margin-top: 16px;
        width: 10%;
        padding: 10px;
        border: none;
        border-radius: 8px;
        background: #0d47a1;
        color: white;
        font-weight: 700;
        cursor: pointer;
      }

      #closeInstructionViewModal:hover {
        background: #08306f;
      }
    `;

    document.head.appendChild(style);
  }
}

document.addEventListener("click", function (e) {
  const viewBtn = e.target.closest(".view-instruction-btn");

  if (viewBtn) {
    e.preventDefault();
    e.stopPropagation();

    setupInstructionViewModal();

    const hoverBox = viewBtn.closest("#instructionHoverBox");
    const instructionText =
      hoverBox?.dataset.fullInstruction ||
      hoverBox?.innerText.replace("VIEW", "").trim() ||
      "No instruction available.";

    const modal = document.getElementById("instructionViewModal");
    const content = document.getElementById("instructionViewContent");

    if (content) {
      content.textContent = instructionText;
    }

    if (modal) {
      modal.classList.add("show");
    }

    return;
  }

  if (
    e.target.id === "closeInstructionViewModal" ||
    e.target.id === "instructionViewModal"
  ) {
    const modal = document.getElementById("instructionViewModal");
    if (modal) {
      modal.classList.remove("show");
    }
  }
});

document.addEventListener("DOMContentLoaded", function () {
  setupInstructionViewModal();
});




/* ==================================================
   NOTIFICATION BELL
================================================== */

/* ==================================================
   NOTIFICATION BELL - GREEN NEW HIGHLIGHT + TIMEFRAME
================================================== */

/* ==================================================
   NOTIFICATION BELL - FIXED
   - Green highlight for unseen/new
   - Time frame included
   - Green left bar on hover
   - Does NOT break data loading
================================================== */

const NOTIFICATION_SEEN_KEY = "BENRO_SEEN_NOTIFICATIONS";
let currentNotificationRows = [];

// ===== GET SEEN NOTIFICATIONS =====
function getSeenNotifications() {
  try {
    return JSON.parse(localStorage.getItem(NOTIFICATION_SEEN_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

// ===== SAVE SEEN NOTIFICATIONS =====
function saveSeenNotifications(seenList) {
  localStorage.setItem(NOTIFICATION_SEEN_KEY, JSON.stringify(seenList));
}

// ===== UNIQUE KEY PER RECORD =====
function getNotificationKey(row) {
  return String(row["SERIAL NUMBER"] || "").trim();
}

// ===== DATE USED FOR TIME FRAME =====
function getNotificationDate(row) {
  return (
    row["DATE ASSIGNED"] ||
    row["DATE RECEIVED OD"] ||
    ""
  );
}

// ===== TIME AGO FORMAT =====
function getTimeAgo(value) {
  if (!value || value === "-") return "";

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const diffMs = now - date;

  if (diffMs < 0) return "Just now";

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return minutes + " min ago";
  if (hours < 24) return hours + (hours === 1 ? " hr ago" : " hrs ago");
  if (days === 1) return "Yesterday";
  if (days < 7) return days + " days ago";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric"
  });
}

// ===== MARK ONE NOTIFICATION AS SEEN =====
function markNotificationAsSeen(rowKey) {
  if (!rowKey) return;

  const seen = getSeenNotifications();

  if (!seen.includes(rowKey)) {
    seen.push(rowKey);
    saveSeenNotifications(seen);
  }

  // Stop ringtone after opening notification
  stopNotificationRingtone();

  updateNotificationCount();
  renderNotificationList();
}

// ===== SETUP NOTIFICATION BELL =====
function setupNotificationBell() {
  const bell = document.getElementById("notificationBell");
  const panel = document.getElementById("notificationPanel");

  if (!bell || !panel) {
    console.warn("Notification bell or panel not found.");
    return;
  }

  // ✅ Prevent duplicate click events
  if (bell.dataset.ready === "true") return;
  bell.dataset.ready = "true";

  bell.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();

    // ✅ Close sidebar when notification opens
    const sidebar = document.getElementById("sidebar");
    const mainContent = document.querySelector(".main-content");

    if (sidebar) sidebar.classList.remove("show");
    if (mainContent) mainContent.classList.remove("shift");

    panel.classList.toggle("show");

    renderNotificationList();
    updateNotificationCount();
  });

  panel.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest("#notificationWrapper")) {
      panel.classList.remove("show");
    }
  });
}

// ===== UPDATE NOTIFICATION DATA =====
function updateNotificationBell(rows) {
  currentNotificationRows = Array.isArray(rows) ? rows : [];

  renderNotificationList();
  updateNotificationCount();
}

// ===== UPDATE RED COUNT =====
function updateNotificationCount() {
  const countBox = document.getElementById("notificationCount");
  if (!countBox) return;

  const seen = getSeenNotifications();

  const unreadRows = currentNotificationRows.filter(row => {
    const key = getNotificationKey(row);
    return key && !seen.includes(key);
  });

  const count = unreadRows.length;

  countBox.textContent = count > 99 ? "99+" : count;

  if (count > 0) {
    countBox.classList.add("show");
  } else {
    countBox.classList.remove("show");
  }
}

// ===== RENDER NOTIFICATION LIST =====
function renderNotificationList() {

  
  const list = document.getElementById("notificationList");
  if (!list) return;

  const seen = getSeenNotifications();

  if (!currentNotificationRows.length) {
    list.innerHTML = `<div class="notification-empty">No notifications</div>`;
    return;
  }

  list.innerHTML = currentNotificationRows.map(row => {
    const key = getNotificationKey(row);
    const isUnread = key && !seen.includes(key);
    const unreadClass = isUnread ? "unread" : "";

    const typeOfDocument = row["TYPE OF DOCUMENT"] || "-";
    const client = row["CLIENT"] || "-";
    const documentTitle = row["DOCUMENT"] || "-";
    const rowIndex = row.__rowIndex || "";
    const timeAgo = getTimeAgo(getNotificationDate(row));

const receivedDivisionDate =
  row["DATE RECEIVED DIVISION"] ||
  row["DATE RECEIVED BY DIVISION"] ||
  "";

const assignedEmployeeDate =
  row["DATE ASSIGNED EMPLOYEE"] ||
  row["DATE ASSIGNED"] ||
  "";

    return `
      <div 
        class="notification-item ${unreadClass}" 
        data-row-index="${rowIndex}"
        data-notification-key="${key}"
      >
        <div class="notification-top-row">
          <div class="notification-type">
            ${escapeHTML(typeOfDocument)}
            ${isUnread ? '<span class="notification-new-badge">NEW</span>' : ''}
          </div>

          <div class="notification-time">
            ${escapeHTML(timeAgo)}
          </div>
        </div>

        <div class="notification-dates">

  ${
    receivedDivisionDate
      ? `
      <div class="notification-date-row">
        <span class="notification-date-label">
          Received by Division:
        </span>
        <span class="notification-date-value">
          ${escapeHTML(
            new Date(receivedDivisionDate).toLocaleString("en-PH", {
              month: "short",
              day: "2-digit",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true
            })
          )}
        </span>
      </div>
    `
      : ""
  }

  ${
    assignedEmployeeDate
      ? `
      <div class="notification-date-row">
        <span class="notification-date-label">
          Assigned to You:
        </span>
        <span class="notification-date-value">
          ${escapeHTML(
            new Date(assignedEmployeeDate).toLocaleString("en-PH", {
              month: "short",
              day: "2-digit",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true
            })
          )}
        </span>
      </div>
    `
      : ""
  }

</div>

<div class="notification-client">
  ${escapeHTML(client)}
</div>

<div class="notification-document">
  ${escapeHTML(documentTitle)}
</div>




      </div>
    `;
  }).join("");

  document.querySelectorAll(".notification-item").forEach(item => {
    item.addEventListener("click", function () {
      const rowIndex = this.dataset.rowIndex;
      const notificationKey = this.dataset.notificationKey;

      // ✅ Mark only clicked notification as seen
      markNotificationAsSeen(notificationKey);

      document.getElementById("notificationPanel")?.classList.remove("show");

      const tableRow = document.querySelector(
        `#dataGrid tbody tr[data-row-index="${rowIndex}"]`
      );

      if (tableRow) {
        tableRow.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });

        tableRow.click();
      } else if (typeof showRowDataBelowFromButton === "function") {
        showRowDataBelowFromButton(rowIndex);
      }
    });
  });
}





// Request browser notification permission on startup
if (typeof Notification !== "undefined" && Notification.permission === "default") {
  Notification.requestPermission();
}

/**
 * Utility to notify the user visually and audibly about new updates/instructions.
 */
function triggerUpdateNotification(title, message) {
  // 1. Desktop Browser Notification
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body: message });
  }

  // 2. Fallback console statement or custom UI modal/alert
  console.log(`%c🔔 NOTIFICATION: ${title} - ${message}`, "color: #fff; background: #ffc107; padding: 4px; font-weight: bold;");
  
  // Optional: You can append an audio beep or alert banner here
}



function playNotificationSound() {
  notificationAudio.currentTime = 0;

  notificationAudio.play()
    .catch(err => {
      console.log("Audio blocked:", err);
    });
}

function startNotificationRingtone() {
  if (ringtoneTimer) return;

  playNotificationSound();

  ringtoneTimer = setInterval(() => {
    playNotificationSound();
  }, 5000);
}

function stopNotificationRingtone() {
  clearInterval(ringtoneTimer);
  ringtoneTimer = null;

  notificationAudio.pause();
  notificationAudio.currentTime = 0;
}



function markNotificationAsSeen(rowKey) {
  stopNotificationRingtone();

  const seen =
    getSeenNotifications();

  if (
    rowKey &&
    !seen.includes(rowKey)
  ) {
    seen.push(rowKey);
    saveSeenNotifications(seen);
  }

  updateNotificationCount();
  renderNotificationList();
}




function formatNotificationDate(dateString) {
  if (!dateString) return "-";

  const date = new Date(dateString);

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}




