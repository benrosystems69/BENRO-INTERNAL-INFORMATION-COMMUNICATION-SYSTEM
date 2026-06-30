// ===== CONFIG =====
//const googleSheetsUrl = "https://script.google.com/macros/s/AKfycbwVJ7-nwkL7GMzS116dRJiI0bPfMV1w6cL-avV3dIBjLt3JnGzLQgKFr2eZEVlaf-uB/exec";
const googleSheetsUrl = "https://script.google.com/macros/s/AKfycbxapoa5OENbY7yjjqXDfuP80NWDDd_iWpRNC-UB82ZP0l-q6HoG891jmjdZPfjQazc/exec";
const cancelBtn = document.querySelector(".btn.cancel");
const saveBtn = document.getElementById("saveBtn");
const toast = document.getElementById("toast");
const dataGrid = document.getElementById("dataGrid").querySelector("tbody");

let currentEditingRow = null;



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











// ===== COLLECT FORM DATA =====
function collectFormData() {
  const fileInput = document.getElementById("fileInput");
  const files = Array.from(fileInput.files);

  return {
    serial: null,
    client: document.getElementById("client").value,
    gender: document.getElementById("GENDER").value,
    typeOfDocument: document.getElementById("TYPEOFDOCUMENT").value,
    document: document.getElementById("document").value,
    dateReceivedOD: document.getElementById("dateReceivedOD").value,
    dateRoutedPenro: document.getElementById("dateRoutedPenro").value,
    dateReleasedPenro: document.getElementById("dateReleasedPenro").value,
    division: document.getElementById("division").value,
    dateReleased: document.getElementById("dateReleased").value,
    receivedBy: document.getElementById("personnel").value,
    files: files,
    fileUrls: []
  };
}


// ===== VALIDATION =====
function validateRequiredFields(d) {
  const requiredFields = [
    { key: "client", label: "Client" },
    { key: "gender", label: "Gender" },
    { key: "typeOfDocument", label: "Type of Document" },
    { key: "document", label: "Document" },
    { key: "dateReceivedOD", label: "Date Received (OD)" },
    { key: "dateRoutedPenro", label: "Date Routed to PENRO" }
  ];

  const missing = requiredFields.filter(
    f => !d[f.key] || d[f.key].toString().trim() === ""
  );

  return { isValid: missing.length === 0, missing };
}

function notifyRequiredFields() {
  alert("PLEASE INPUT ALL REQUIRED FIELDS: THANK YOU");
}


// ===== CLEAR FORM =====
function clearForm() {
  document.querySelectorAll("input").forEach(i => (i.value = ""));
  document.getElementById("fileInput").value = "";
}


// ===== SEND TO GOOGLE SHEETS =====
async function sendRowToGoogleSheets(d) {
  const filesBase64 = await Promise.all(
    (d.files || []).map(file => new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve({
        name: file.name,
        base64: reader.result
      });

      reader.onerror = reject;
      reader.readAsDataURL(file);
    }))
  );

  const res = await fetch(googleSheetsUrl, {
    method: "POST",
    body: JSON.stringify({
      ...d,
      files: filesBase64
    })
  });

  const result = await res.json();

  if (result.status !== "success") {
    throw new Error(result.message || "Failed to save data.");
  }

  d.no = result.number;
  d.serial = result.serial;
  d.fileUrls = result.fileUrls || [];

  return d;
}


// ===== DELETE FROM GOOGLE SHEETS =====
async function deleteRowFromGoogleSheets(serial) {
  const res = await fetch(googleSheetsUrl, {
    method: "POST",
    body: JSON.stringify({
      action: "DELETE",
      serial: serial
    })
  });

  const result = await res.json();

  if (result.status !== "success") {
    throw new Error(result.message || "Failed to delete data.");
  }

  return result;
}


// ===== RELEASE TO GOOGLE SHEETS COLUMN N =====
async function releaseRowToGoogleSheets(serial) {
  const res = await fetch(googleSheetsUrl, {
    method: "POST",
    body: JSON.stringify({
      action: "RELEASE",
      serial: serial
    })
  });

  const result = await res.json();

  if (result.status !== "success") {
    throw new Error(result.message || "Failed to release data.");
  }

  return result;
}


// ===== FORMAT DATE =====
function formatClearDateTime(value) {
  if (!value || value === "-") return "-";

  const date = new Date(value);

  if (isNaN(date.getTime())) return value;

  const month = date.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  hours = hours ? hours : 12;

  return `${month} ${day}, ${year} | ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
}


function formatForInputDateTime(value) {
  if (!value || value === "-") return "";

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}


// ===== POPULATE FORM =====
function populateForm(d) {
  document.getElementById("client").value = d.client || "";
  document.getElementById("GENDER").value = d.gender || "";
  document.getElementById("TYPEOFDOCUMENT").value = d.typeOfDocument || "";
  document.getElementById("document").value = d.document || "";

  document.getElementById("dateReceivedOD").value = formatForInputDateTime(d.dateReceivedOD);
  document.getElementById("dateRoutedPenro").value = formatForInputDateTime(d.dateRoutedPenro);
  document.getElementById("dateReleasedPenro").value = formatForInputDateTime(d.dateReleasedPenro);

  document.getElementById("division").value = d.division || "";

  document.getElementById("dateReleased").value = formatForInputDateTime(d.dateReleased);

  document.getElementById("personnel").value = d.receivedBy || "";
}


// ===== ADD / UPDATE ROW =====
function addRowToTable(d) {
  const row = dataGrid.insertRow();
  populateRow(row, d);
}

function updateRow(row, d) {
 row.dataset.record = JSON.stringify({
  serial: d.serial || "",
  client: d.client || "",
  gender: d.gender || "",
  typeOfDocument: d.typeOfDocument || "",
  document: d.document || "",
  dateReceivedOD: d.dateReceivedOD || "",
  dateRoutedPenro: d.dateRoutedPenro || "",
  dateReleasedPenro: d.dateReleasedPenro || "",
  division: d.division || "",
  dateReleased: d.dateReleased || "",
  receivedBy: d.receivedBy || "",
  files: [],
  fileUrls: d.fileUrls || [],
  releaseStatus: d.releaseStatus || "" // ✅ Column N status
});

  populateRow(row, d);
}

function getCurrentDateTimeLocal() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}


// ===== POPULATE ROW =====
// ===== POPULATE ROW =====
function populateRow(row, d) {
  row.innerHTML = "";

  d.files = d.files || [];
  d.fileUrls = d.fileUrls || [];

  const values = [
    d.serial,
    d.client,
    d.gender,
    d.typeOfDocument,
    d.document,
    formatClearDateTime(d.dateReceivedOD),
    formatClearDateTime(d.dateRoutedPenro),
    formatClearDateTime(d.dateReleasedPenro),
    d.division,
    formatClearDateTime(d.dateReleased),
    d.receivedBy
  ];

  values.forEach(v => {
    const cell = row.insertCell();
    cell.textContent = v || "";
  });

  row.dataset.fileUrls = JSON.stringify(d.fileUrls);

  row.dataset.record = JSON.stringify({
    serial: d.serial || "",
    client: d.client || "",
    gender: d.gender || "",
    typeOfDocument: d.typeOfDocument || "",
    document: d.document || "",
    dateReceivedOD: d.dateReceivedOD || "",
    dateRoutedPenro: d.dateRoutedPenro || "",
    dateReleasedPenro: d.dateReleasedPenro || "",
    division: d.division || "",
    dateReleased: d.dateReleased || "",
    receivedBy: d.receivedBy || "",
    files: [],
    fileUrls: d.fileUrls || []
  });

  const fileCell = row.insertCell();

  fileCell.textContent =
    d.fileUrls.length
      ? d.fileUrls.map((u, i) => `FILE ATTACHED`).join(", ")
      : d.files.length
      ? d.files.map(f => f.name).join(", ")
      : "-";

  const actionCell = row.insertCell();

  const styleBtn = (btn, bgColor) => {
    btn.style.backgroundColor = bgColor;
    btn.style.color = "#fff";
    btn.style.border = "none";
    btn.style.padding = "6px 14px";
    btn.style.marginRight = "6px";
    btn.style.borderRadius = "6px";
    btn.style.cursor = "pointer";
    btn.style.fontWeight = "600";
  };

  // ===== OPEN BUTTON =====
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.textContent = "OPEN";
  styleBtn(openBtn, "#28a745");

  openBtn.onclick = () => {
    if (!d.fileUrls.length) {
      alert("No uploaded file available.");
      return;
    }

    d.fileUrls.forEach(u => window.open(u, "_blank"));
  };


  // ===== UPDATE BUTTON =====
  const updateBtn = document.createElement("button");
  updateBtn.type = "button";
  updateBtn.textContent = "UPDATE";
  styleBtn(updateBtn, "#007bff");

  updateBtn.onclick = () => {
    currentEditingRow = row;

    const rowData = row.dataset.record
      ? JSON.parse(row.dataset.record)
      : d;

    populateForm(rowData);

    saveBtn.textContent = "UPDATE DATA";
    saveBtn.scrollIntoView({ behavior: "smooth", block: "center" });
  };


  // ===== DELETE BUTTON =====
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.textContent = "DELETE";
  styleBtn(deleteBtn, "#dc3545");

  deleteBtn.onclick = async () => {
    const serial = row.cells[0].textContent.trim();

    if (!serial) {
      alert("No serial number found. Cannot delete this record.");
      return;
    }

    if (!confirm("Delete this record from the data grid and spreadsheet?")) {
      return;
    }

    deleteBtn.disabled = true;
    deleteBtn.textContent = "DELETING...";

    try {
      showSavingModal("saving", "Deleting Data...");

      await deleteRowFromGoogleSheets(serial);

      row.remove();

      if (currentEditingRow === row) {
        currentEditingRow = null;
        saveBtn.textContent = "SAVE DATA";
        clearForm();
      }

      saveTableToLocalStorage();

      showSavingModal("success", "Data Deleted Successfully");

    } catch (err) {
      console.error("Delete error:", err);
      showSavingModal("error", "Error Deleting Data: " + err.message);

      deleteBtn.disabled = false;
      deleteBtn.textContent = "DELETE";
    }
  };


  // ===== RELEASE BUTTON =====
  const releaseBtn = document.createElement("button");
  releaseBtn.type = "button";
  releaseBtn.textContent = "RELEASE";
  styleBtn(releaseBtn, "#fd7e14");


  if ((d.releaseStatus || "").toString().toUpperCase() === "RELEASED") {
  releaseBtn.textContent = "RELEASED";
  releaseBtn.disabled = true;
  releaseBtn.style.backgroundColor = "#6c757d";
}

  releaseBtn.onclick = async () => {
  const serial = row.cells[0].textContent.trim();

  if (!serial) {
    alert("No serial number found. Cannot release this record.");
    return;
  }

  if (!confirm("Mark this record as RELEASED? This will remove it from the pending data grid only.")) {
    return;
  }

  releaseBtn.disabled = true;
  releaseBtn.textContent = "RELEASING...";

  try {
    showSavingModal("saving", "Releasing Data...");

    // ✅ This only writes RELEASED in Column N
    // ✅ It does NOT delete the row in spreadsheet
    await releaseRowToGoogleSheets(serial);

    // ✅ Remove from data grid only
    row.remove();

    if (currentEditingRow === row) {
      currentEditingRow = null;
      saveBtn.textContent = "SAVE DATA";
      clearForm();
    }

    saveTableToLocalStorage();

    showSavingModal("success", "Data Released Successfully");

  } catch (err) {
    console.error("Release error:", err);
    showSavingModal("error", "Error Releasing Data: " + err.message);

    releaseBtn.disabled = false;
    releaseBtn.textContent = "RELEASE";
  }
};


  // ✅ BUTTONS IN DATA GRID
  actionCell.append(openBtn, updateBtn, deleteBtn, releaseBtn);
}




// ===== SAVE BUTTON =====
saveBtn.addEventListener("click", async (e) => {
  e.preventDefault();

  const data = collectFormData();
  const v = validateRequiredFields(data);

  if (!v.isValid) {
    return notifyRequiredFields();
  }

  saveBtn.disabled = true;

  try {
    let savedData;

    if (currentEditingRow) {
      data.action = "UPDATE";
      data.serial = currentEditingRow.cells[0].textContent.trim();

      saveBtn.textContent = "UPDATING...";
      showSavingModal("saving", "Updating Data...");

      savedData = await sendRowToGoogleSheets(data);

      updateRow(currentEditingRow, savedData);

      showSavingModal("success", "Data Updated Successfully");

    } else {
      data.action = "CREATE";

      saveBtn.textContent = "SAVING...";
      showSavingModal("saving", "Saving Data...");

      savedData = await sendRowToGoogleSheets(data);

      addRowToTable(savedData);

      showSavingModal("success", "Data Saved Successfully");
    }

    currentEditingRow = null;
    saveTableToLocalStorage();
    clearForm();

  } catch (err) {
    console.error(err);
    showSavingModal("error", "Error Saving Data: " + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "SAVE DATA";
  }
});


// ===== SAVING MODAL =====
function showSavingModal(status, message) {
  const modal = document.getElementById("savingDataModal");
  const spinner = modal.querySelector(".saving-spinner");
  const checkmark = modal.querySelector(".saving-checkmark");
  const messageBox = document.getElementById("savingMessage");
  const okBtn = document.getElementById("savingOkBtn");

  modal.classList.add("show");

  if (status === "saving") {
    spinner.style.display = "block";
    checkmark.style.display = "none";
    okBtn.style.display = "none";
    messageBox.textContent = message || "Saving Data...";
  }

  if (status === "success") {
    spinner.style.display = "none";
    checkmark.style.display = "block";
    okBtn.style.display = "inline-block";
    messageBox.textContent = message || "Data Saved Successfully";
  }

  if (status === "error") {
    spinner.style.display = "none";
    checkmark.style.display = "none";
    okBtn.style.display = "inline-block";
    messageBox.textContent = message || "Error Saving Data";
  }

  okBtn.onclick = () => {
    modal.classList.remove("show");
  };
}


// ===== LOCAL STORAGE SAVE =====
function saveTableToLocalStorage() {
  const rows = [...dataGrid.rows].map(row => {
    const c = row.cells;

    return {
      serial: c[0]?.textContent || "",
      client: c[1]?.textContent || "",
      gender: c[2]?.textContent || "",
      typeOfDocument: c[3]?.textContent || "",
      document: c[4]?.textContent || "",
      dateReceivedOD: c[5]?.textContent || "",
      dateRoutedPenro: c[6]?.textContent || "",
      dateReleasedPenro: c[7]?.textContent || "",
      division: c[8]?.textContent || "",
      dateReleased: c[9]?.textContent || "",
      receivedBy: c[10]?.textContent || "",
      files: [],
      fileUrls: row.dataset.fileUrls
        ? JSON.parse(row.dataset.fileUrls)
        : []
    };
  });

  localStorage.setItem("BENRO_IICTS_DATA", JSON.stringify(rows));
}


// ===== LOAD FROM GOOGLE SHEETS =====
// ===== LOAD FROM GOOGLE SHEETS WITH STARTUP LOADER =====
async function loadDataFromGoogleSheets(showLoader = false) {
  if (showLoader) {
    showStartupLoader();
  }

  try {
    const res = await fetch(googleSheetsUrl + "?t=" + Date.now(), {
      method: "GET"
    });

    if (!res.ok) {
      throw new Error("HTTP " + res.status + " " + res.statusText);
    }

    const result = await res.json();

    if (result.status !== "success") {
      throw new Error(result.message || "Failed to load spreadsheet data.");
    }

    dataGrid.innerHTML = "";

    const rows = result.data || [];

    if (rows.length === 0) {
      dataGrid.innerHTML = `
        <tr>
          <td colspan="13" style="text-align:center; padding:20px;">
            No records found.
          </td>
        </tr>
      `;
      return;
    }

    rows.forEach(d => {
      d.files = [];
      d.fileUrls = d.fileUrls || [];
      addRowToTable(d);
    });

    filterTable();
    saveTableToLocalStorage();

  } catch (err) {
    console.error("Load spreadsheet error:", err);
    alert("Error loading spreadsheet data: " + err.message);
  } finally {
    if (showLoader) {
      hideStartupLoader();
    }
  }
}

// ===== SEARCH RECORDS IN DATA GRID =====
function filterTable() {
  const searchBox = document.getElementById("searchBox");
  const searchValue = searchBox.value.toLowerCase().trim();

  const rows = dataGrid.querySelectorAll("tr");

  rows.forEach(row => {
    // ✅ Search data columns only, not action buttons
    const cells = Array.from(row.cells).slice(0, 12);

    const rowText = cells
      .map(cell => cell.textContent.toLowerCase())
      .join(" ");

    if (searchValue === "" || rowText.includes(searchValue)) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });
}


// ===== SEARCH BUTTON AND ENTER KEY =====
document.addEventListener("DOMContentLoaded", () => {
  const searchBox = document.getElementById("searchBox");
  const searchBtn = document.getElementById("searchBtn");

  if (searchBtn) {
    searchBtn.addEventListener("click", function (e) {
      e.preventDefault();
      filterTable();
    });
  }

  if (searchBox) {
    searchBox.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        filterTable();
      }
    });
  }
});



// ===== CANCEL / CLEAR BUTTON =====
if (cancelBtn) {
  cancelBtn.addEventListener("click", function (e) {
    e.preventDefault();

    clearForm();
    currentEditingRow = null;
    saveBtn.textContent = "SAVE DATA";
  });
}


// ===== FINAL SIDEBAR FIX =====

// Converts Google Drive profile links into image-viewable links
function getGoogleDriveImageUrl(url) {
  if (!url || url.trim() === "") {
    return "photos/logopgb.png";
  }

  const driveFileMatch = url.match(/\/d\/([^/]+)/);
  const driveIdMatch = url.match(/[?&]id=([^&]+)/);

  const fileId = driveFileMatch
    ? driveFileMatch[1]
    : driveIdMatch
    ? driveIdMatch[1]
    : "";

  if (fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w300`;
  }

  return url;
}


// ===== SIDEBAR TOGGLE =====
document.addEventListener("DOMContentLoaded", function () {
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const logoutBtn = document.getElementById("logoutBtn");


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


  // Load logged-in user info
  if (typeof loadLoggedInUserToSidebar === "function") {
    loadLoggedInUserToSidebar();
  }

  function openSidebar() {
    sidebar.classList.add("open");
    sidebar.classList.add("show");
    document.body.classList.add("sidebar-is-open");
    sidebarToggle.textContent = "×";
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    sidebar.classList.remove("show");
    document.body.classList.remove("sidebar-is-open");
    sidebarToggle.textContent = "☰";
  }

  function toggleSidebar() {
    if (sidebar.classList.contains("open") || sidebar.classList.contains("show")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    });

    // Close sidebar when clicking outside
    document.addEventListener("click", function (e) {
      const clickedInsideSidebar = sidebar.contains(e.target);
      const clickedToggle = sidebarToggle.contains(e.target);

      if (!clickedInsideSidebar && !clickedToggle) {
        closeSidebar();
      }
    });

    // Close sidebar using ESC key
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeSidebar();
      }
    });
  }

  
if (logoutBtn) {
  logoutBtn.addEventListener("click", function (e) {
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
}

});



// ✅ LOAD DATA WHEN PAGE OPENS WITH STARTUP LOADER
document.addEventListener("DOMContentLoaded", function () {
  loadDataFromGoogleSheets(true);
});

