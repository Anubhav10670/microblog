// Admin page: sign in, write/edit posts, manage the list, edit the profile.
// Security note: hiding this page protects nothing by itself. The real protection
// is Row Level Security in the database (see setup.sql): even if someone opens
// this page, Supabase refuses every write unless you are signed in as the admin.

const $ = (id) => document.getElementById(id);
const PAGE = 50;

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

let profile = { display_name: "Anubhav", avatar_url: "", name_color: "#FFB800", page_title: "Thoughts" };
let editing = null;        // the post being edited, or null when writing a new one
let listFilter = "all";
let listCount = 0;         // how many rows are currently shown in the Posts tab

const EMOJIS = ("😀 😃 😄 😁 😆 😅 😂 🤣 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤔 🤨 😐 😑 😶 🙄 😏 😒 " +
  "😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤫 🥱 😴 🤤 😷 " +
  "🤒 🤕 🤢 🤮 🥳 😎 🤓 🧐 👍 👎 👏 🙌 🙏 💪 👀 🤝 ✌️ 🤞 👌 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 " +
  "✨ 🔥 💯 ⭐ 🌙 ☀️ 🌧️ 🎬 🍿 🎵 🎧 📚 ☕ 🍕 🎉 💀 😈 👻 🤡").split(" ");

// ---------- small helpers ----------

let toastTimer;
function toast(message, isError) {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("error", !!isError);
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}

function applyProfile() {
  document.documentElement.style.setProperty("--accent", profile.name_color);
  $("composer-avatar").src = profile.avatar_url || BLANK_AVATAR;
  $("profile-avatar").src = profile.avatar_url || BLANK_AVATAR;
  $("avatar-url").value = profile.avatar_url || "";
  $("display-name").value = profile.display_name;
  $("name-color").value = profile.name_color;
  $("page-title").value = profile.page_title;
}

// ---------- sign in / out ----------

function showLogin(message) {
  $("app").classList.add("hidden");
  $("login").classList.remove("hidden");
  $("login-error").textContent = message || "";
}

async function showApp() {
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");

  const { data } = await db.from("settings").select("*").eq("id", 1).maybeSingle();
  if (data) profile = data;
  applyProfile();
  renderPreview();
  switchTab("write");
}

async function checkSession(session) {
  if (!session) return showLogin();
  // Friendly check only; the database enforces the real rule.
  const { data: isAdmin } = await db.rpc("is_admin");
  if (!isAdmin) {
    await db.auth.signOut();
    return showLogin("This account is not set up as the admin. See README step 4.");
  }
  showApp();
}

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("login-btn").disabled = true;
  $("login-error").textContent = "";
  const { data, error } = await db.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value,
  });
  $("login-btn").disabled = false;
  if (error) {
    $("login-error").textContent = error.message;
    return;
  }
  $("password").value = "";
  checkSession(data.session);
});

$("signout").addEventListener("click", () => db.auth.signOut());

// Only react to sign-out here; calling Supabase inside this callback can hang.
db.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") showLogin();
});

// ---------- tabs ----------

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  ["write", "posts", "profile"].forEach((n) => $("panel-" + n).classList.toggle("hidden", n !== name));
  if (name === "posts") loadPosts(true);
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

// ---------- composer ----------

const textarea = $("content");

function autoGrow() {
  textarea.style.height = "auto";
  textarea.style.height = Math.max(120, textarea.scrollHeight) + "px";
}

function renderPreview() {
  const preview = $("preview");
  preview.innerHTML = "";
  const value = textarea.value;
  if (!value.trim()) {
    const hint = document.createElement("p");
    hint.className = "note";
    hint.textContent = "Your post will appear here as you type.";
    preview.appendChild(hint);
    return;
  }
  const when = editing && editing.published_at ? editing.published_at : new Date().toISOString();
  preview.appendChild(buildPost(profile, value, when));
}

function onInput() {
  autoGrow();
  renderPreview();
}
textarea.addEventListener("input", onInput);

// Wrap the selected text (or a placeholder) in markers, e.g. ==text==
function wrapSelection(before, after, placeholder) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || placeholder;
  textarea.setRangeText(before + selected + after, start, end, "end");
  textarea.focus();
  textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
  onInput();
}

function insertAtCursor(text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.setRangeText(text, start, end, "end");
  textarea.focus();
  onInput();
}

const actions = {
  highlight: () => wrapSelection("==", "==", "highlighted text"),
  bold: () => wrapSelection("**", "**", "bold text"),
  italic: () => wrapSelection("*", "*", "italic text"),
  strike: () => wrapSelection("~~", "~~", "struck text"),
  link: () => {
    const url = prompt("Link address", "https://");
    if (url && url !== "https://") wrapSelection("[", "](" + url.trim() + ")", "link text");
  },
  emoji: () => $("emoji-panel").classList.toggle("hidden"),
};

$("toolbar").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button) actions[button.dataset.action]();
});

EMOJIS.forEach((emoji) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = emoji;
  b.addEventListener("click", () => insertAtCursor(emoji));
  $("emoji-panel").appendChild(b);
});

textarea.addEventListener("keydown", (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return;
  if (event.key === "Enter") { event.preventDefault(); save("published"); }
  if (event.key === "b") { event.preventDefault(); actions.bold(); }
  if (event.key === "i") { event.preventDefault(); actions.italic(); }
});

function setBusy(busy) {
  $("btn-publish").disabled = busy;
  $("btn-draft").disabled = busy;
}

// Adjust buttons to match what is being edited.
function refreshComposerButtons() {
  const status = editing ? editing.status : "new";
  $("editing-note").classList.toggle("hidden", !editing);
  $("btn-publish").textContent = status === "published" ? "Save changes" : "Publish";
  $("btn-draft").classList.toggle("hidden", status === "published");
  $("btn-draft").textContent = status === "unpublished" ? "Save (keep unpublished)" : "Save draft";
  // Offer "move to top" only for posts that already have a publish date.
  $("bump-label").classList.toggle("hidden", !(editing && editing.published_at));
  $("bump").checked = false;
}

function resetComposer() {
  editing = null;
  textarea.value = "";
  $("emoji-panel").classList.add("hidden");
  refreshComposerButtons();
  onInput();
}

// status: "published" to publish, otherwise the status to save as.
async function save(status) {
  const content = textarea.value.trim();
  if (!content) return toast("Write something first.", true);

  const row = { content, status };
  if (editing && status === "published" && $("bump").checked) {
    row.published_at = new Date().toISOString();
  }

  setBusy(true);
  const query = editing
    ? db.from("posts").update(row).eq("id", editing.id).select()
    : db.from("posts").insert(row).select();
  const { data, error } = await query;
  setBusy(false);

  if (error) return toast(error.message, true);
  if (!data.length) return toast("Not saved: permission denied.", true);

  toast(status === "published" ? "Published." : "Saved.");
  resetComposer();
}

$("btn-publish").addEventListener("click", () => save("published"));
$("btn-draft").addEventListener("click", () => save(editing ? editing.status : "draft"));
$("btn-clear").addEventListener("click", resetComposer);
$("cancel-edit").addEventListener("click", resetComposer);

// ---------- posts list ----------

function setFilter(filter) {
  listFilter = filter;
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.filter === filter));
  loadPosts(true);
}

$("chips").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-filter]");
  if (chip) setFilter(chip.dataset.filter);
});

async function loadPosts(reset) {
  const list = $("post-list");
  if (reset) {
    list.innerHTML = "";
    listCount = 0;
  }

  let query = db.from("posts").select("*").order("created_at", { ascending: false })
    .range(listCount, listCount + PAGE - 1);
  if (listFilter !== "all") query = query.eq("status", listFilter);

  const { data, error } = await query;
  if (error) return toast(error.message, true);

  data.forEach((post) => list.appendChild(buildRow(post)));
  listCount += data.length;
  $("list-more").classList.toggle("hidden", data.length < PAGE);

  if (!listCount) {
    const empty = document.createElement("p");
    empty.className = "note";
    empty.textContent = "No posts here yet.";
    list.appendChild(empty);
  }
}

$("list-more-btn").addEventListener("click", () => loadPosts(false));

function makeButton(label, className, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn small " + (className || "");
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function buildRow(post) {
  const row = document.createElement("div");
  row.className = "row";

  const meta = document.createElement("div");
  meta.className = "row-meta";
  const badge = document.createElement("span");
  badge.className = "badge " + post.status;
  badge.textContent = post.status;
  const when = document.createElement("span");
  when.textContent = formatTimestamp(post.published_at || post.created_at);
  meta.append(badge, when);

  const text = document.createElement("div");
  text.className = "row-text";
  text.textContent = post.content;

  const buttons = document.createElement("div");
  buttons.className = "row-actions";
  buttons.append(makeButton("Edit", "", () => startEdit(post)));
  if (post.status === "published") {
    buttons.append(makeButton("Unpublish", "", () => setStatus(post, "unpublished")));
  } else {
    buttons.append(makeButton("Publish", "", () => setStatus(post, "published")));
  }
  buttons.append(makeButton("Delete", "danger", () => deletePost(post)));

  row.append(meta, text, buttons);
  return row;
}

function startEdit(post) {
  editing = post;
  textarea.value = post.content;
  refreshComposerButtons();
  switchTab("write");
  onInput();
  textarea.focus();
}

async function setStatus(post, status) {
  const { data, error } = await db.from("posts").update({ status }).eq("id", post.id).select();
  if (error) return toast(error.message, true);
  if (!data.length) return toast("Not saved: permission denied.", true);
  toast(status === "published" ? "Published." : "Unpublished.");
  loadPosts(true);
}

async function deletePost(post) {
  if (!confirm("Delete this post permanently? This cannot be undone.")) return;
  const { data, error } = await db.from("posts").delete().eq("id", post.id).select();
  if (error) return toast(error.message, true);
  if (!data.length) return toast("Not deleted: permission denied.", true);
  toast("Deleted.");
  loadPosts(true);
}

// ---------- profile ----------

$("avatar-url").addEventListener("input", () => {
  $("profile-avatar").src = $("avatar-url").value || BLANK_AVATAR;
});

// Crop to a centered square and shrink to 400px so phone photos upload quickly.
async function resizeToSquare(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 400;
  canvas.getContext("2d").drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, 400, 400
  );
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

$("avatar-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  let blob;
  try {
    blob = await resizeToSquare(file);
  } catch (e) {
    return toast("Could not read that image. Try a JPG or PNG.", true);
  }

  const path = "avatar-" + Date.now() + ".jpg";   // new name each time avoids stale caches
  const { error } = await db.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
  if (error) return toast(error.message, true);

  const { data } = db.storage.from("avatars").getPublicUrl(path);
  $("avatar-url").value = data.publicUrl;
  $("profile-avatar").src = data.publicUrl;
  toast("Photo uploaded. Tap Save profile to use it.");
});

$("save-profile").addEventListener("click", async () => {
  const row = {
    id: 1,
    display_name: $("display-name").value.trim() || "Anubhav",
    avatar_url: $("avatar-url").value.trim() || null,
    name_color: $("name-color").value,
    page_title: $("page-title").value.trim() || "Thoughts",
  };
  const { data, error } = await db.from("settings").upsert(row).select();
  if (error) return toast(error.message, true);
  if (!data.length) return toast("Not saved: permission denied.", true);

  profile = data[0];
  applyProfile();
  renderPreview();
  toast("Profile saved.");
});

// ---------- start ----------

if (CONFIG.SUPABASE_URL.includes("YOUR-PROJECT")) {
  showLogin("Add your Supabase details to config.js first.");
} else {
  db.auth.getSession().then(({ data }) => checkSession(data.session));
}
