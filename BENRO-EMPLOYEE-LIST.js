
/* ==========================================
   BENRO-IICTS - PERSONNEL IN-CHARGE
   FIXED EMPLOYEE MULTI-SELECT
   ========================================== */

document.addEventListener("DOMContentLoaded", function () {

    // Same source used by Division Head Tracker
    const personnelUrl =
        "https://script.google.com/macros/s/AKfycbzAxaoxDBHLfN9Dqu6FNzW_p7XNfbZSdnLtfAJmC53YEGr1lfgW0kGrHQLizY3Eg99j/exec";

    const wrapper = document.getElementById("personnelWrapper");
    const box = document.getElementById("personnelSelectBox");
    const dropdown = document.getElementById("personnelDropdown");
    const search = document.getElementById("personnelSearch");
    const options = document.getElementById("personnelOptions");
    const display = document.getElementById("personnelDisplay");
    const hidden = document.getElementById("PERSONNEL");

    if (!wrapper || !box || !dropdown || !search ||
        !options || !display || !hidden) {
        console.error("PERSONNEL: Required elements not found.");
        return;
    }

    let allPersonnelNames = [];
    let selectedPersonnel = [];

    // TOOLBAR
    const toolbar = document.createElement("div");
    toolbar.className = "personnel-toolbar";

    const count = document.createElement("span");
    count.className = "personnel-count";
    count.textContent = "0 selected";

    const buttons = document.createElement("div");
    buttons.className = "personnel-toolbar-buttons";

    const selectAll = document.createElement("button");
    selectAll.type = "button";
    selectAll.className = "personnel-select-all";
    selectAll.textContent = "SELECT ALL";

    const clearAll = document.createElement("button");
    clearAll.type = "button";
    clearAll.className = "personnel-clear-all";
    clearAll.textContent = "CLEAR ALL";

    buttons.append(selectAll, clearAll);
    toolbar.append(count, buttons);
    dropdown.appendChild(toolbar);

    // UPDATE SELECTED NAMES
    function updatePersonnelDisplay() {

        display.replaceChildren();

        hidden.value = selectedPersonnel.join(" | ");
        count.textContent = selectedPersonnel.length + " selected";

        if (selectedPersonnel.length === 0) {
            const placeholder = document.createElement("span");
            placeholder.className = "placeholder-text";
            placeholder.textContent = "PERSONNEL IN-CHARGE";
            display.appendChild(placeholder);
            return;
        }

        selectedPersonnel.forEach(name => {

            const tag = document.createElement("div");
            tag.className = "personnel-tag";

            const nameSpan = document.createElement("span");
            nameSpan.className = "personnel-name";
            nameSpan.textContent = name;

            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "personnel-remove";
            removeBtn.textContent = "×";
            removeBtn.title = "Remove Personnel";

            removeBtn.addEventListener("click", function (e) {

                e.preventDefault();
                e.stopPropagation();

                selectedPersonnel = selectedPersonnel.filter(
                    employee => employee !== name
                );

                updatePersonnelDisplay();
                renderPersonnelOptions();
            });

            tag.append(nameSpan, removeBtn);
            display.appendChild(tag);
        });
    }

    // RENDER SEARCHABLE CHECKBOXES
    function renderPersonnelOptions() {

        options.replaceChildren();

        const keyword = search.value.trim().toLowerCase();

        const filtered = allPersonnelNames.filter(name =>
            name.toLowerCase().includes(keyword)
        );

        if (filtered.length === 0) {
            const empty = document.createElement("div");
            empty.className = "personnel-empty";
            empty.textContent = "No employees found.";
            options.appendChild(empty);
            return;
        }

        filtered.forEach(name => {

            const row = document.createElement("label");
            row.className = "multi-option";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = name;
            checkbox.checked = selectedPersonnel.includes(name);

            const text = document.createElement("span");
            text.textContent = name;

            checkbox.addEventListener("change", function () {

                if (this.checked) {
                    if (!selectedPersonnel.includes(name)) {
                        selectedPersonnel.push(name);
                    }
                } else {
                    selectedPersonnel = selectedPersonnel.filter(
                        employee => employee !== name
                    );
                }

                updatePersonnelDisplay();
            });

            row.append(checkbox, text);
            options.appendChild(row);
        });
    }

    // LOAD EMPLOYEES FROM GOOGLE SHEETS
    async function loadPersonnelCheckboxList() {

        options.textContent = "Loading employees...";

        try {

            const url = personnelUrl +
                "?action=getPersonnelList&t=" + Date.now();

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error("HTTP " + response.status);
            }

            const names = await response.json();

            if (!Array.isArray(names)) {
                throw new Error("Invalid personnel data format");
            }

            allPersonnelNames = [
                ...new Set(
                    names.map(name => String(name || "").trim())
                         .filter(Boolean)
                )
            ].sort((a, b) => a.localeCompare(b));

            renderPersonnelOptions();

        } catch (error) {

            console.error("Error loading employees:", error);
            options.textContent = "Unable to load employees.";
        }
    }

    // OPEN / CLOSE
    function setDropdownOpen(open) {

        dropdown.classList.toggle("show", open);
        box.setAttribute("aria-expanded", String(open));

        if (open) search.focus();
    }

    box.addEventListener("click", function (e) {

        e.stopPropagation();
        setDropdownOpen(!dropdown.classList.contains("show"));
    });

    box.addEventListener("keydown", function (e) {

        if (e.key === "Enter" || e.key === " ") {

            e.preventDefault();
            setDropdownOpen(!dropdown.classList.contains("show"));
        }
    });

    dropdown.addEventListener("click", function (e) {
        e.stopPropagation();
    });

    // SEARCH
    search.addEventListener("input", renderPersonnelOptions);

    // SELECT ALL MATCHING SEARCH
    selectAll.addEventListener("click", function (e) {

        e.preventDefault();
        e.stopPropagation();

        const keyword = search.value.trim().toLowerCase();

        allPersonnelNames
            .filter(name => name.toLowerCase().includes(keyword))
            .forEach(name => {

                if (!selectedPersonnel.includes(name)) {
                    selectedPersonnel.push(name);
                }
            });

        updatePersonnelDisplay();
        renderPersonnelOptions();
    });

    // CLEAR ALL
    clearAll.addEventListener("click", function (e) {

        e.preventDefault();
        e.stopPropagation();

        selectedPersonnel = [];

        updatePersonnelDisplay();
        renderPersonnelOptions();
    });

    // CLICK OUTSIDE
    document.addEventListener("click", function (e) {

        if (!wrapper.contains(e.target)) {
            setDropdownOpen(false);
        }
    });

    document.addEventListener("keydown", function (e) {

        if (e.key === "Escape") {
            setDropdownOpen(false);
        }
    });

    // RESTORE PERSONNEL WHEN EDITING
    window.setPersonnelSelection = function (value) {

        selectedPersonnel = [
            ...new Set(
                String(value || "")
                    .split("|")
                    .map(name => name.trim())
                    .filter(Boolean)
            )
        ];

        updatePersonnelDisplay();
        renderPersonnelOptions();
    };

    // CLEAR PERSONNEL
    window.clearPersonnelSelection = function () {

        selectedPersonnel = [];
        search.value = "";

        updatePersonnelDisplay();
        renderPersonnelOptions();
        setDropdownOpen(false);
    };

    // INITIALIZE
    updatePersonnelDisplay();
    loadPersonnelCheckboxList();

    console.log("PERSONNEL MULTI-SELECT READY");

});
