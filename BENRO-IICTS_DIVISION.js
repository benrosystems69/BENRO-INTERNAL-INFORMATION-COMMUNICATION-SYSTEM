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

    return allPersonnelNames;

  } catch (err) {
    console.error("Failed to load personnel list:", err);

    allPersonnelNames = [];

    return [];
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

function normalizeReleaseStatus(value) {
  return String(value || "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toUpperCase();
}

function getReleaseStatusFromRow(row) {
  const key = Object.keys(row).find(k =>
    normalizeReleaseStatus(k) === "RELEASE STATUS" ||
    normalizeReleaseStatus(k) === "STATUS"
  );

  return key ? row[key] : "";
}

function isReleasedRow(row) {
  return normalizeReleaseStatus(getReleaseStatusFromRow(row)) === "RELEASED";
}





/* ==============================
   DATA LOAD
============================== */
/* ==============================
   DATA LOAD
============================== */
/* ==============================
   DATA LOAD - FIXED WITH NOTIFICATION
============================== */
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

    const rows = JSON.parse(rawText);

    if (!Array.isArray(rows)) {
      throw new Error("Response is not an array.");
    }

    // ✅ If no records from Apps Script
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

    // ✅ Create allRows first
allRows = rows.map((row, i) => ({
  ...row,
  __rowIndex: i + 2
}));

// ✅ JS ONLY FIX:
// Show ONLY records declared as RELEASED
// If RELEASE STATUS is blank, PENDING, or anything else, it will NOT appear
const releasedRows = allRows.filter(row => isReleasedRow(row));

// ✅ Then filter by logged-in division
let filteredRows = releasedRows;
let allowedDivisions = [];

    if (loggedInDivision) {
      allowedDivisions = loggedInDivision
        .split(/\||\/|,/)
        .map(div => div.trim().toUpperCase())
        .filter(div => div !== "");

      filteredRows = releasedRows.filter(row => {
        const rowDivision = String(row["DIVISION"] || "")
          .trim()
          .toUpperCase();

        return allowedDivisions.some(div =>
          rowDivision === div ||
          rowDivision.startsWith(div) ||
          rowDivision.includes(div)
        );
      });
    }

    // ✅ Now it is safe to check filteredRows
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

    filteredRows.sort(
      (a, b) => parseDate(b["DATE RECEIVED OD"]) - parseDate(a["DATE RECEIVED OD"])
    );

    renderTable(filteredRows);

    // ✅ Update notification bell after data is loaded
    if (typeof updateNotificationBell === "function") {
      updateNotificationBell(filteredRows);
    }

  } catch (error) {
    console.error("Failed to load data:", error);

    if (showAlert) {
      alert("Failed to load data:\n" + error.message);
    }

    if (typeof updateNotificationBell === "function") {
      updateNotificationBell([]);
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

            <div class="personnel-actions">
              <button 
                type="button"
                class="personnel-round-btn message ${hasInstruction ? "has-instruction" : ""}"
                title="${hasInstruction ? "Edit Instruction" : "Add Instruction"}"
                data-row-index="${rowIndex}"
                data-personnel="${name}"
                data-mode="${hasInstruction ? "edit" : "add"}"
                onclick="openPersonnelInstructionFromTable(event)"
              >
                ${hasInstruction ? "✎" : "✉"}
              </button>

              <button 
                type="button"
                class="personnel-round-btn remove"
                title="Remove"
                data-row-index="${rowIndex}"
                data-personnel="${name}"
                onclick="removePersonnelFromTable(event)"
              >
                ×
              </button>
            </div>
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

/* ==============================
   UPDATE RECORD
============================== */
async function updateRecord(e) {
  // ✅ STOP PAGE REFRESH / FORM SUBMIT
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
  const personnel = personnelHidden.value.trim();
  const documentClassification = documentInput.value.trim();
  const instructions = buildInstructionCellText();

  const actionTakenBy =
    localStorage.getItem("benroEmployee") ||
    localStorage.getItem("benroUsername") ||
    "UNKNOWN USER";

  if (!documentClassification) {
    alert("⚠️ Please enter DOCUMENT CLASSIFICATION.");
    documentInput.focus();
    return;
  }

  const selectedRowData = allRows.find(
  r => String(r.__rowIndex) === String(rowIndex)
);

const serialNumber = selectedRowData
  ? String(selectedRowData["SERIAL NUMBER"] || "").trim()
  : "";

if (!serialNumber) {
  alert("⚠️ Serial number not found. Please reload the page and select the row again.");
  return;
}

const payload = {
  action: "UPDATE_FIELDS",

  // ✅ keep rowIndex for display sheet
  rowIndex: Number(rowIndex),

  // ✅ permanent key, this prevents lost updates
  serialNumber: serialNumber,
  "SERIAL NUMBER": serialNumber,

  OUTCOME: outcome,
  "PERSONNEL IN-CHARGE": personnel,
  "DOCUMENT CLASSIFICATION": documentClassification,
  INSTRUCTIONS: instructions,

  outcome: outcome,
  personnelInCharge: personnel,
  documentClassification: documentClassification,
  instructionMessage: instructions,

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

      // ✅ Do not use custom headers to avoid Apps Script/CORS fetch issue
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    console.log("UPDATE RAW RESPONSE:", text);

    if (!text || text.trim() === "") {
      throw new Error("Empty response from Apps Script. Check doPost return.");
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch (jsonErr) {
      throw new Error("Apps Script did not return valid JSON:\n" + text);
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
  setInterval(() => {
    const searchValue = searchBox.value.trim();

    // ✅ Do not refresh while searching, typing search, editing, or row is selected
    if (
      searchValue !== "" ||
      isSearching ||
      isTypingSearch ||
      rowIndexInput.value.trim() !== "" ||
      documentInput.value.trim() !== "" ||
      personnelHidden.value.trim() !== "" ||
      outcomeInput.value.trim() !== ""
    ) {
      console.log("Auto-refresh paused.");
      return;
    }

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
   START
============================== */
/* ==============================
   START - FIXED
============================== */
document.addEventListener("DOMContentLoaded", async function () {
  try {
    showStartupLoader();

    if (typeof setupNotificationBell === "function") {
      setupNotificationBell();
    }

    setupInstructionModal();
    setupPersonnelDropdown();

    await loadPersonnelCheckboxList();

    await loadDataFromSheet(true, false);

    startAutoUpdate();

    if (searchBtn) {
      searchBtn.addEventListener("click", function (e) {
        e.preventDefault();
        filterTable();
      });
    }

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

    if (saveBtn) {
      saveBtn.type = "button";

      saveBtn.addEventListener("click", function (e) {
        updateRecord(e);
      });
    }

    if (clearBtn) {
      clearBtn.type = "button";

      clearBtn.addEventListener("click", function (e) {
        clearAllFields(e);
      });
    }

  } catch (err) {
    console.error("Startup error:", err);
    alert("Startup error:\n" + err.message);
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

  // ✅ Close notification panel when sidebar opens/closes
  const notificationPanel = document.getElementById("notificationPanel");
  if (notificationPanel) {
    notificationPanel.classList.remove("show");
  }

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

    window.location.href = "index.html";
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
   NOTIFICATION BELL
================================================== */

/* ==================================================
   NOTIFICATION BELL - GREEN NEW HIGHLIGHT + TIMEFRAME
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
  const serial = String(row["SERIAL NUMBER"] || "").trim();

  const releaseStatus = normalizeReleaseStatus(
    getReleaseStatusFromRow(row)
  );

  const releaseDate = String(
    row["DATE RELEASED PENRO"] ||
    row["DATE RELEASED"] ||
    ""
  ).trim();

  // ✅ This makes RELEASED status a new notification event
  return serial
    ? `${serial}|${releaseStatus}|${releaseDate}`
    : "";
}

// ===== GET DATE FOR TIMEFRAME =====
function getNotificationDate(row) {
  return (
    row["DATE RECEIVED OD"] ||
    row["DATE ROUTED TO PENRO"] ||
    row["DATE RELEASED PENRO"] ||
    row["DATE RELEASED"] ||
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

// ===== SETUP BELL =====
function setupNotificationBell() {
  const bell = document.getElementById("notificationBell");
  const panel = document.getElementById("notificationPanel");

  if (!bell || !panel) return;

  bell.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();

    panel.classList.toggle("show");

    // ✅ Do NOT mark all as seen when opening.
    // ✅ It will stay green until the notification item is clicked.
    renderNotificationList();
    updateNotificationCount();
  });

  panel.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  document.addEventListener("click", function () {
    panel.classList.remove("show");
  });
}

// ===== UPDATE NOTIFICATION DATA =====
const NOTIFIED_RELEASE_KEYS = "BENRO_DIVISION_NOTIFIED_RELEASE_KEYS";
let pendingRingtoneRows = [];

function getNotifiedReleaseKeys() {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_RELEASE_KEYS) || "[]");
  } catch (e) {
    return [];
  }
}

function saveNotifiedReleaseKeys(keys) {
  localStorage.setItem(
    NOTIFIED_RELEASE_KEYS,
    JSON.stringify([...new Set(keys)])
  );
}

function updateNotificationBell(rows) {
  currentNotificationRows = Array.isArray(rows)
    ? rows
    : [];

  const currentKeys = currentNotificationRows
    .map(row => getNotificationKey(row))
    .filter(Boolean);

  const alreadyNotifiedKeys = getNotifiedReleaseKeys();

  // ✅ This works even on another device.
  // If that device has not notified this release yet, it will alert/ring.
  const newKeys = currentKeys.filter(
    key => !alreadyNotifiedKeys.includes(key)
  );

  if (newKeys.length > 0) {
    const newRows = currentNotificationRows.filter(row =>
      newKeys.includes(getNotificationKey(row))
    );

    console.log("🔔 NEW RELEASED DIVISION NOTIFICATION:", newRows);

    // ✅ Save immediately so it does not ring again and again every refresh
    saveNotifiedReleaseKeys([
      ...alreadyNotifiedKeys,
      ...newKeys
    ]);

    showReleaseNotificationPopup(newRows);
    showBrowserReleaseNotification(newRows);

    // ✅ If sound is unlocked, ring now.
    // ✅ If not unlocked, queue it until the user clicks/taps.
    if (notificationAudioUnlocked) {
      startNotificationRingtone();
    } else {
      pendingRingtoneRows = newRows;
      showEnableSoundNotice();
    }
  }

  previousNotificationKeys = [...currentKeys];
  firstNotificationLoad = false;

  renderNotificationList();
  updateNotificationCount();
}


function showReleaseNotificationPopup(rows) {
  if (!rows || rows.length === 0) return;

  let toast = document.getElementById("divisionReleaseToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "divisionReleaseToast";

    toast.style.position = "fixed";
    toast.style.top = "90px";
    toast.style.right = "25px";
    toast.style.zIndex = "999999";
    toast.style.background = "#0f5132";
    toast.style.color = "#fff";
    toast.style.padding = "14px 18px";
    toast.style.borderRadius = "10px";
    toast.style.boxShadow = "0 8px 25px rgba(0,0,0,0.25)";
    toast.style.fontSize = "14px";
    toast.style.fontWeight = "700";
    toast.style.maxWidth = "360px";
    toast.style.display = "none";

    document.body.appendChild(toast);
  }

  const firstRow = rows[0];

  const client = firstRow["CLIENT"] || "-";
  const documentTitle = firstRow["DOCUMENT"] || "-";

  toast.innerHTML = `
    🔔 NEW RELEASED COMMUNICATION<br>
    <span style="font-weight:500;">
      ${escapeHTML(client)} | ${escapeHTML(documentTitle)}
    </span>
  `;

  toast.style.display = "block";

  setTimeout(() => {
    toast.style.display = "none";
  }, 7000);
}

function showBrowserReleaseNotification(rows) {
  if (!rows || rows.length === 0) return;

  if (typeof Notification === "undefined") return;

  if (Notification.permission === "default") {
    Notification.requestPermission();
    return;
  }

  if (Notification.permission !== "granted") return;

  const firstRow = rows[0];

  new Notification("NEW RELEASED COMMUNICATION", {
    body: `${firstRow["CLIENT"] || "-"} | ${firstRow["DOCUMENT"] || "-"}`
  });
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

      // ✅ Select/highlight the matching row
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



/* ==============================
   PENRO RINGTONE NOTIFICATION
============================== */

/* ==============================
   DIVISION RINGTONE NOTIFICATION
============================== */

const notificationAudio = new Audio("RINGTONE/RINGTONE(2).mp3");
notificationAudio.preload = "auto";
notificationAudio.volume = 1;

let previousNotificationKeys = [];
let ringtoneTimer = null;
let firstNotificationLoad = true;
let notificationAudioUnlocked = false;
let pendingRingtoneRows = [];

// ✅ Debug if ringtone file is missing on another device/deployment
notificationAudio.addEventListener("error", function () {
  console.error("❌ Ringtone file not found or cannot load: RINGTONE/RINGTONE(2).mp3");
  showEnableSoundNotice("Ringtone file cannot be loaded. Check RINGTONE/RINGTONE(2).mp3 path.");
});

function showEnableSoundNotice(customMessage) {
  let box = document.getElementById("enableSoundNotice");

  if (!box) {
    box = document.createElement("div");
    box.id = "enableSoundNotice";

    box.style.position = "fixed";
    box.style.bottom = "25px";
    box.style.right = "25px";
    box.style.zIndex = "999999";
    box.style.background = "#842029";
    box.style.color = "#fff";
    box.style.padding = "14px 18px";
    box.style.borderRadius = "10px";
    box.style.boxShadow = "0 8px 25px rgba(0,0,0,0.25)";
    box.style.fontSize = "14px";
    box.style.fontWeight = "700";
    box.style.cursor = "pointer";
    box.style.maxWidth = "360px";

    document.body.appendChild(box);
  }

  box.innerHTML = customMessage || "🔊 Tap/click here to enable notification sound on this device.";
  box.style.display = "block";

  box.onclick = function (e) {
    e.preventDefault();
    e.stopPropagation();
    unlockNotificationAudio(true);
  };
}

function hideEnableSoundNotice() {
  const box = document.getElementById("enableSoundNotice");
  if (box) {
    box.style.display = "none";
  }
}

function unlockNotificationAudio(playPending = false) {
  if (notificationAudioUnlocked) {
    if (playPending && pendingRingtoneRows.length > 0) {
      startNotificationRingtone();
      pendingRingtoneRows = [];
    }
    return;
  }

  notificationAudio.volume = 1;
  notificationAudio.currentTime = 0;

  notificationAudio.play()
    .then(() => {
      notificationAudio.pause();
      notificationAudio.currentTime = 0;

      notificationAudioUnlocked = true;
      localStorage.setItem("BENRO_DIVISION_SOUND_ENABLED", "YES");

      console.log("✅ Notification audio unlocked on this device.");
      hideEnableSoundNotice();

      if (playPending && pendingRingtoneRows.length > 0) {
        startNotificationRingtone();
        pendingRingtoneRows = [];
      }
    })
    .catch(err => {
      console.log("Audio still blocked until user clicks/taps:", err);
      showEnableSoundNotice();
    });
}

// ✅ Any click/tap on this device can unlock sound
document.addEventListener("click", function () {
  unlockNotificationAudio(false);
}, { once: true });

function playNotificationSound() {
  notificationAudio.currentTime = 0;

  notificationAudio.play().catch(err => {
    console.log("Audio blocked by browser:", err);
    showEnableSoundNotice();
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
  if (ringtoneTimer) {
    clearInterval(ringtoneTimer);
    ringtoneTimer = null;
  }

  notificationAudio.pause();
  notificationAudio.currentTime = 0;
}
