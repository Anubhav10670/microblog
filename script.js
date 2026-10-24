// Public feed: loads the profile and published posts from Supabase and draws them.

const feed = document.getElementById("feed");
let profile = { display_name: "Anubhav", avatar_url: "", name_color: "#FFB800", page_title: "Thoughts" };
let oldestLoaded = null;   // published_at of the last post drawn; used to fetch the next page
let hasMore = true;
let loading = false;
let moreWrap = null;

let db = null;
if (!CONFIG.SUPABASE_URL.includes("YOUR-PROJECT")) {
  db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}

function showMessage(text) {
  feed.innerHTML = "";
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = text;
  feed.appendChild(p);
}

function applyProfile() {
  document.documentElement.style.setProperty("--accent", profile.name_color);
  document.title = profile.page_title;
}

async function fetchPosts() {
  let query = db
    .from("posts")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(CONFIG.PAGE_SIZE);
  if (oldestLoaded) query = query.lt("published_at", oldestLoaded);
  return query;
}

async function loadMore() {
  if (loading || !hasMore) return;
  loading = true;

  const { data, error } = await fetchPosts();
  loading = false;

  if (error) {
    if (!feed.querySelector(".post")) showMessage("Could not load posts.");
    return;
  }

  data.forEach((post) => feed.insertBefore(buildPost(profile, post.content, post.published_at, post.images), moreWrap));
  if (data.length) oldestLoaded = data[data.length - 1].published_at;

  hasMore = data.length === CONFIG.PAGE_SIZE;
  moreWrap.classList.toggle("hidden", !hasMore);

  if (!feed.querySelector(".post")) {
    showMessage("Nothing here yet.");
  }
}

async function start() {
  if (!db) {
    showMessage("Add your Supabase details to config.js to get started.");
    return;
  }

  const { data } = await db.from("settings").select("*").eq("id", 1).maybeSingle();
  if (data) profile = data;
  applyProfile();

  moreWrap = document.createElement("div");
  moreWrap.className = "more-wrap hidden";
  const button = document.createElement("button");
  button.className = "more-btn";
  button.textContent = "Load more";
  button.addEventListener("click", loadMore);
  moreWrap.appendChild(button);
  feed.appendChild(moreWrap);

  // Load the next page automatically when the button scrolls into view.
  new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) loadMore(); },
    { rootMargin: "400px" }
  ).observe(moreWrap);

  await loadMore();
}

start();
