/* ==================================================
   DISABLE BROWSER BACK / NEXT NAVIGATION
   INCLUDING MOUSEPAD SWIPE, MOBILE SWIPE, TABLET SWIPE
================================================== */

(function disableBrowserBackNext() {
  // ✅ Push current page into history so Back button does not leave immediately
  history.pushState(null, "", location.href);

  window.addEventListener("popstate", function () {
    // ✅ Force user to stay on the same page
    history.pushState(null, "", location.href);
  });

  // ✅ Block horizontal swipe gestures on touch devices
  let touchStartX = 0;
  let touchStartY = 0;

  document.addEventListener(
    "touchstart",
    function (e) {
      if (!e.touches || e.touches.length === 0) return;

      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    },
    { passive: false }
  );

  document.addEventListener(
    "touchmove",
    function (e) {
      if (!e.touches || e.touches.length === 0) return;

      const touchX = e.touches[0].clientX;
      const touchY = e.touches[0].clientY;

      const diffX = touchX - touchStartX;
      const diffY = touchY - touchStartY;

      // ✅ If movement is mostly horizontal, stop browser swipe navigation
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // ✅ Block Alt + Left / Alt + Right browser shortcuts
  document.addEventListener("keydown", function (e) {
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // ✅ Also block Backspace from navigating back when not typing
    const activeTag = document.activeElement.tagName.toLowerCase();
    const isTyping =
      activeTag === "input" ||
      activeTag === "textarea" ||
      document.activeElement.isContentEditable;

    if (e.key === "Backspace" && !isTyping) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  });

  // ✅ Block mouse wheel horizontal swipe on trackpad if possible
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