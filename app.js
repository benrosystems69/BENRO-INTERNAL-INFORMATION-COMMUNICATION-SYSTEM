const form = document.getElementById("docForm");

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const formData = new FormData(form);

  fetch("/api/sendDocument", {
    method: "POST",
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    console.log(data);
    alert(data.message);
  })
  .catch(err => console.error(err));
});
