// (owner) a long update list shows its newest part, faded; Full Update Log opens every entry in a window over a darkened page
(() => {
  const sec = document.querySelector(".front-updates"), body = sec && sec.querySelector(".front-body");
  if (!body || body.querySelectorAll("li").length <= 8) return;
  sec.classList.add("collapsed");
  const more = document.createElement("button"); more.type = "button"; more.className = "updates-more"; more.textContent = "Full Update Log";
  sec.append(more);
  let ov = null;
  const close = () => { if (ov) { ov.remove(); ov = null; document.body.style.overflow = ""; more.focus(); } };
  more.addEventListener("click", () => {
    ov = document.createElement("div"); ov.className = "ulog-overlay";
    ov.innerHTML = '<div class="ulog-win card" role="dialog" aria-modal="true" aria-labelledby="ulog-title"><div class="ulog-head"><h2 id="ulog-title" class="brand">Update Log</h2><button type="button" class="ulog-close" aria-label="Close">×</button></div><div class="ulog-body front-body"></div></div>';
    ov.querySelector(".ulog-body").innerHTML = body.innerHTML;
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest(".ulog-close")) close(); });
    document.body.append(ov); document.body.style.overflow = "hidden"; ov.querySelector(".ulog-close").focus();
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
})();
