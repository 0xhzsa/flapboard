// Landing interactions: deferred board iframe + scroll reveals.

const frame = document.getElementById("boardFrame");
if (frame) {
  const load = () => {
    if (frame.src) return;
    frame.src = "/app/?demo=1&quiet=1&dwell=6";
    frame.addEventListener("load", () => frame.classList.add("on"), { once: true });
  };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (load(), io.disconnect())),
      { rootMargin: "200px" }
    );
    io.observe(frame);
  } else load();
}

const reveals = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }),
    { threshold: 0.12 }
  );
  reveals.forEach((el) => io.observe(el));
} else {
  reveals.forEach((el) => el.classList.add("in"));
}
