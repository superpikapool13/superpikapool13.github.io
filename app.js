const USERNAME = "superpikapool13"; // <- your GitHub username

const API_URL = `https://api.github.com/users/${USERNAME}/repos?per_page=100&sort=updated`;
const CACHE_KEY = "repo-cache-v1";
const OWN_SITE = `${USERNAME}.github.io`.toLowerCase();

const LANG_COLORS = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572a5", HTML: "#e34c26",
  CSS: "#663399", Java: "#b07219", "C++": "#f34b7d", C: "#555555", "C#": "#178600",
  Go: "#00add8", Rust: "#dea584", Ruby: "#701516", PHP: "#4f5d95", Shell: "#89e051",
  Kotlin: "#a97bff", Swift: "#f05138", Dart: "#00b4ab", Vue: "#41b883", Lua: "#000080",
};

const $grid = document.getElementById("grid");
const $error = document.getElementById("error");
const $subtitle = document.getElementById("subtitle");

document.getElementById("title").textContent = `${USERNAME}'s projects`;

// ---------- cache ----------
function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || { repos: [], images: {} }; }
  catch { return { repos: [], images: {} }; }
}
function saveCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* storage full or blocked */ }
}
const cache = loadCache();

// ---------- helpers ----------
const fallbackImage = (repo) => `https://opengraph.githubassets.com/1/${USERNAME}/${repo.name}`;

function normalizeHomepage(url) {
  if (!url) return null;
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).href; }
  catch { return null; }
}
function isGithubIo(url) {
  try { return new URL(url).hostname.endsWith(".github.io"); } catch { return false; }
}
function visible(repos) {
  return repos.filter((r) => !r.fork && !r.archived && r.name.toLowerCase() !== OWN_SITE);
}
function slim(r) {
  return {
    name: r.name, description: r.description, html_url: r.html_url,
    homepage: normalizeHomepage(r.homepage), language: r.language,
    stars: r.stargazers_count, pushed_at: r.pushed_at,
  };
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ---------- og:image from homepage ----------
async function fetchOgImage(homepage) {
  const res = await fetch(homepage);
  if (!res.ok) throw new Error(res.status);
  const doc = new DOMParser().parseFromString(await res.text(), "text/html");
  const meta = doc.querySelector('meta[property="og:image"], meta[name="og:image"]');
  const content = meta && meta.getAttribute("content");
  if (!content) throw new Error("no og:image");
  return new URL(content, homepage).href; // resolves relative paths
}

async function resolveImage(repo, img) {
  const cached = cache.images[repo.name];
  if (cached && cached.homepage === repo.homepage) { img.src = cached.src; return; }
  if (!repo.homepage || !isGithubIo(repo.homepage)) return;
  try {
    const src = await fetchOgImage(repo.homepage);
    cache.images[repo.name] = { homepage: repo.homepage, src };
    saveCache(cache);
    img.src = src;
  } catch { /* keep fallback image */ }
}

// ---------- rendering ----------
function card(repo) {
  const root = el("article", "card");

  const media = el("div", "media");
  const img = document.createElement("img");
  img.alt = `${repo.name} preview`;
  img.loading = "lazy";
  img.src = fallbackImage(repo);
  img.addEventListener("error", () => {
    const fb = fallbackImage(repo);
    if (img.src !== fb) img.src = fb;
  });
  media.append(img);

  const body = el("div", "body");
  body.append(el("h2", null, repo.name));

  const pills = el("div", "pills");
  const repoLink = el("a", "pill", "Repo");
  repoLink.href = repo.html_url;
  pills.append(repoLink);
  if (repo.homepage) {
    const live = el("a", "pill", "Live site");
    live.href = repo.homepage;
    pills.append(live);
  }
  body.append(pills);

  body.append(el("p", "desc", repo.description || "No description."));

  const meta = el("div", "meta");
  if (repo.language) {
    const lang = el("span");
    const dot = el("i", "dot");
    dot.style.background = LANG_COLORS[repo.language] || "";
    lang.append(dot, repo.language);
    meta.append(lang);
  }
  meta.append(el("span", null, `★ ${repo.stars}`));
  const date = new Date(repo.pushed_at).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  meta.append(el("span", null, `Updated ${date}`));
  body.append(meta);

  root.append(media, body);
  resolveImage(repo, img);
  return root;
}

function renderRepos(repos) {
  $error.hidden = true;
  $grid.replaceChildren(...repos.map(card));
  $subtitle.textContent = repos.length
    ? `${repos.length} ${repos.length === 1 ? "repository" : "repositories"}`
    : "No public repositories to show yet.";
}

function renderSkeletons(n = 6) {
  $grid.replaceChildren(...Array.from({ length: n }, () => {
    const c = el("article", "card skeleton");
    c.setAttribute("aria-hidden", "true");
    const body = el("div", "body");
    body.append(el("div", "line title"), el("div", "line"), el("div", "line short"));
    c.append(el("div", "media"), body);
    return c;
  }));
}

function showError(message) {
  $error.textContent = message;
  $error.hidden = false;
}

// ---------- main ----------
async function refresh() {
  const res = await fetch(API_URL, { headers: { Accept: "application/vnd.github+json" } });
  if (res.status === 403 || res.status === 429) {
    throw new Error("GitHub's API rate limit was reached. Try again in a bit.");
  }
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}.`);
  const repos = visible(await res.json()).map(slim);
  const changed = JSON.stringify(repos) !== JSON.stringify(cache.repos);
  cache.repos = repos;
  saveCache(cache);
  return changed;
}

async function init() {
  const hadCache = cache.repos.length > 0;
  if (hadCache) renderRepos(cache.repos);
  else renderSkeletons();

  try {
    const changed = await refresh();
    if (changed || !hadCache) renderRepos(cache.repos);
  } catch (err) {
    if (!hadCache) {
      $grid.replaceChildren();
      $subtitle.textContent = "";
      showError(err.message.startsWith("GitHub") ? err.message : "Couldn't load repositories. Check your connection and reload.");
    }
    // with a cache, keep showing it silently
  }
}

init();
