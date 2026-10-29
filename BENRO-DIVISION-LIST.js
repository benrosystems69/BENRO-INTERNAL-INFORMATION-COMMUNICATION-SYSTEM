
/* =========================================
   BENRO-IICTS - DIVISION MULTI-SELECT
   FIXED VERSION
   ========================================= */

document.addEventListener("DOMContentLoaded", function () {

    const wrapper = document.getElementById("divisionWrapper");
    const box = document.getElementById("divisionSelectBox");
    const dropdown = document.getElementById("divisionDropdown");
    const display = document.getElementById("divisionDisplay");
    const search = document.getElementById("divisionSearch");
    const options = document.getElementById("divisionOptions");
    const hidden = document.getElementById("division");
    const count = document.getElementById("divisionCount");
    const selectAll = document.getElementById("divisionSelectAll");
    const clearAll = document.getElementById("divisionClearAll");

    if (!wrapper || !box || !dropdown || !display ||
        !search || !options || !hidden || !count ||
        !selectAll || !clearAll) {
        console.error("DIVISION: Required HTML elements not found.");
        return;
    }

    // DIVISION LIST
    const divisions = [
        "AMD - ADMINISTRATIVE MANAGEMENT DIVISION",
        "NRMD - NATURAL RESOURCES MANAGEMENT DIVISION",
        "MGMD - MINES & GEOSCIENCES MANAGEMENT DIVISION",
        "EMDD - ENVIRONMENTAL MANAGEMENT AND DEVELOPMENT DIVISION",
        "ERDPPMD - ECOSYSTEM RESEARCH AND DEVELOPMENT PLANNING AND POLICY MANAGEMENT DIVISION"
    ];

    let selectedDivisions = [];

    // UPDATE DISPLAY
    function updateDisplay() {

        display.replaceChildren();

        hidden.value = selectedDivisions.join(" | ");
        count.textContent = selectedDivisions.length + " selected";

        if (selectedDivisions.length === 0) {
            const placeholder = document.createElement("span");
            placeholder.className = "division-placeholder";
            placeholder.textContent = "DIVISION";

            display.appendChild(placeholder);
            return;
        }

        selectedDivisions.forEach(name => {

            const tag = document.createElement("span");
            tag.className = "division-tag";

            const nameText = document.createElement("span");
            nameText.className = "division-tag-name";
            nameText.textContent = name;

            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "division-tag-remove";
            removeBtn.textContent = "×";
            removeBtn.title = "Remove Division";

            removeBtn.addEventListener("click", function (e) {

                e.preventDefault();
                e.stopPropagation();

                selectedDivisions = selectedDivisions.filter(
                    division => division !== name
                );

                updateDisplay();
                renderOptions();
            });

            tag.append(nameText, removeBtn);
            display.appendChild(tag);
        });
    }

    // RENDER DIVISION CHECKBOXES
    function renderOptions() {

        options.replaceChildren();

        const keyword = search.value.trim().toLowerCase();

        const filtered = divisions.filter(name =>
            name.toLowerCase().includes(keyword)
        );

        if (filtered.length === 0) {

            const empty = document.createElement("div");
            empty.className = "division-empty";
            empty.textContent = "No divisions found.";
            empty.style.padding = "15px";
            empty.style.textAlign = "center";

            options.appendChild(empty);
            return;
        }

        filtered.forEach(name => {

            const row = document.createElement("label");
            row.className = "division-option";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = name;
            checkbox.checked = selectedDivisions.includes(name);

            const text = document.createElement("span");
            text.textContent = name;

            checkbox.addEventListener("change", function () {

                if (this.checked) {

                    if (!selectedDivisions.includes(name)) {
                        selectedDivisions.push(name);
                    }

                } else {

                    selectedDivisions = selectedDivisions.filter(
                        division => division !== name
                    );
                }

                updateDisplay();
            });

            row.append(checkbox, text);
            options.appendChild(row);
        });
    }

    // OPEN / CLOSE DROPDOWN
    function setDropdownOpen(open) {

        dropdown.classList.toggle("show", open);
        box.setAttribute("aria-expanded", String(open));

        if (open) {
            search.focus();
        }
    }

    box.addEventListener("click", function (e) {
        e.stopPropagation();

        setDropdownOpen(
            !dropdown.classList.contains("show")
        );
    });

    box.addEventListener("keydown", function (e) {

        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setDropdownOpen(
                !dropdown.classList.contains("show")
            );
        }
    });

    // KEEP DROPDOWN OPEN WHILE SELECTING
    dropdown.addEventListener("click", function (e) {
        e.stopPropagation();
    });

    // SEARCH
    search.addEventListener("input", renderOptions);

    // SELECT ALL MATCHING SEARCH
    selectAll.addEventListener("click", function (e) {

        e.preventDefault();
        e.stopPropagation();

        const keyword = search.value.trim().toLowerCase();

        divisions
            .filter(name => name.toLowerCase().includes(keyword))
            .forEach(name => {

                if (!selectedDivisions.includes(name)) {
                    selectedDivisions.push(name);
                }
            });

        updateDisplay();
        renderOptions();
    });

    // CLEAR ALL
    clearAll.addEventListener("click", function (e) {

        e.preventDefault();
        e.stopPropagation();

        selectedDivisions = [];

        updateDisplay();
        renderOptions();
    });

    // CLICK OUTSIDE
    document.addEventListener("click", function (e) {

        if (!wrapper.contains(e.target)) {
            setDropdownOpen(false);
        }
    });

    // ESCAPE KEY
    document.addEventListener("keydown", function (e) {

        if (e.key === "Escape") {
            setDropdownOpen(false);
        }
    });

    // RESTORE DIVISIONS WHEN EDITING
    window.setDivisionSelection = function (value) {

        selectedDivisions = [
            ...new Set(
                String(value || "")
                    .split("|")
                    .map(name => name.trim())
                    .filter(Boolean)
            )
        ];

        updateDisplay();
        renderOptions();
    };

    // CLEAR DIVISIONS AFTER SAVE / CANCEL
    window.clearDivisionSelection = function () {

        selectedDivisions = [];
        search.value = "";

        updateDisplay();
        renderOptions();
        setDropdownOpen(false);
    };

    // INITIALIZE
    updateDisplay();
    renderOptions();

    console.log("DIVISION MULTI-SELECT READY");

});
