

  const slides = document.querySelectorAll(".bg-slide");
const dots = document.querySelectorAll(".dot");

let current = 0;
let interval;

// SHOW SLIDE
function showSlide(index) {
  slides.forEach((slide, i) => {
    slide.classList.remove("active", "prev");

    if (i === index) {
      slide.classList.add("active");
    } else if (i === current) {
      slide.classList.add("prev");
    }
  });

  dots.forEach(dot => dot.classList.remove("active"));
  dots[index].classList.add("active");

  current = index;
}

// AUTO SLIDE
function startAutoSlide() {
  interval = setInterval(() => {
    let next = (current + 1) % slides.length;
    showSlide(next);
  }, 4000); // every 4 seconds
}

// DOT CLICK
dots.forEach(dot => {
  dot.addEventListener("click", () => {
    clearInterval(interval);
    showSlide(parseInt(dot.dataset.index));
    startAutoSlide();
  });
});

// START
startAutoSlide();