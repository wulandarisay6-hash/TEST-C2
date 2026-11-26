// Fungsi global buat nampilin/nyembunyiin 3D Loader
window.showLoader = function(text = "MEMUAT DATA...") {
  let loader = document.getElementById("global-loader");
  if (!loader) {
    loader = document.createElement("div");
    loader.id = "global-loader";
    loader.className = "loader-overlay active";
    loader.innerHTML = `
      <div class="loader-cube">
        <div class="front"></div><div class="back"></div>
        <div class="right"></div><div class="left"></div>
        <div class="top"></div><div class="bottom"></div>
      </div>
      <div class="loader-text" id="loader-text">${text}</div>
    `;
    document.body.appendChild(loader);
  } else {
    loader.classList.add("active");
    document.getElementById("loader-text").textContent = text;
  }
};

window.hideLoader = function() {
  const loader = document.getElementById("global-loader");
  if (loader) loader.classList.remove("active");
};
