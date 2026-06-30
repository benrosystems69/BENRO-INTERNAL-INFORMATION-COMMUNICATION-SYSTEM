const loginUrl = "https://script.google.com/macros/s/AKfycbz_24lFJGDQuyl_l2pVaQrACEqxtwvaRfRZnuqzYBptRzPaUSrAUgLOWPRXARJRT_4-wQ/exec";

document.addEventListener("DOMContentLoaded", function () {
  const loginBtn = document.getElementById("saveBtn");
  const loginLoader = document.getElementById("loginLoader");

  if (!loginBtn) {
    console.error("Login button not found.");
    return;
  }

  loginBtn.addEventListener("click", async function () {
    const username = document.getElementById("USERNAME").value.trim();
    const password = document.getElementById("PASSWORD").value.trim();

    if (!username || !password) {
      alert("Enter username and password");
      return;
    }

    if (loginLoader) {
      loginLoader.classList.add("show");
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "Logging in...";

    try {
      const res = await fetch(loginUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain"
        },
        body: JSON.stringify({
          username: username,
          password: password
        })
      });

      const result = await res.json();
      console.log("Login result:", result);

      if (!result.success) {
        if (loginLoader) {
          loginLoader.classList.remove("show");
        }

        loginBtn.disabled = false;
        loginBtn.textContent = "LOG IN";

        alert(result.message || "Invalid login");
        return;
      }

      // SAVE LOGIN DATA FROM APPS SCRIPT
      localStorage.setItem("benroEmployee", result.employee || "");
      localStorage.setItem("benroRole", result.role || result.position || "");
      localStorage.setItem("benroPosition", result.position || result.role || "");
      localStorage.setItem("benroDivision", result.division || "");
      localStorage.setItem("benroUsername", username);
      localStorage.setItem("benroProfile", result.profile || "");

      const role = String(result.role || result.position || "").toUpperCase().trim();

      if (role.includes("DIVISION HEAD")) {
        window.location.href = "BENRO-IICTS_DIVISION.html";
        return;
      }

      if (role.includes("PENRO")) {
        window.location.href = "BENRO-IICTS_PENRO.html";
        return;
      }

        if (role.includes("EMPLOYEE")) {
        window.location.href = "BENRO-IICTS_EMPLOYEE.html";
        return;
      }

       if (role.includes("BIIC TRACKER")) {
        window.location.href = "BENRO-IICTS.html";
        return;
      }

      if (loginLoader) {
        loginLoader.classList.remove("show");
      }

      loginBtn.disabled = false;
      loginBtn.textContent = "LOG IN";

      alert("Access Denied. Role found: " + role);

    } catch (err) {
      console.error("Login error:", err);

      if (loginLoader) {
        loginLoader.classList.remove("show");
      }

      loginBtn.disabled = false;
      loginBtn.textContent = "LOG IN";

      alert("Login error: " + err.message);
    }
  });
});