// Points the download button at the newest Windows installer on GitHub Releases.
// If the API can't be reached (or there are no releases yet), the button keeps
// its default link to the "latest release" page.

const REPO = "AtamusRegis/atamus";

const button = document.getElementById("download");
const meta = document.getElementById("download-meta");

function formatBytes(bytes) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(0)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

async function loadLatest() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const release = await res.json();

    const installer = (release.assets || []).find(
      (a) => /setup.*\.exe$/i.test(a.name) || /\.exe$/i.test(a.name)
    );

    if (installer) {
      button.href = installer.browser_download_url;
      const size = formatBytes(installer.size);
      meta.textContent = [release.tag_name, "Windows", size].filter(Boolean).join(" · ");
    } else {
      meta.textContent = release.tag_name || "";
    }
  } catch {
    // No release yet, or rate-limited. Leave the default link in place.
    button.classList.add("is-unavailable");
    meta.textContent = "Coming soon";
  }
}

loadLatest();
