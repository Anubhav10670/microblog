// Shared by the public feed and the admin preview, so both look identical.
//
// Posts are stored as plain text. This turns that text into safe HTML:
//   ==highlight==   **bold**   *italic*   ~~strike~~   [text](https://link)
// All other HTML is escaped first, so nothing a post contains can run as code.
// Line breaks are not converted here; the CSS (white-space: pre-wrap) keeps them.

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyMarkers(html) {
  return html
    .replace(/==([^=\n][^\n]*?)==/g, "<mark>$1</mark>")
    .replace(/\*\*([^\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^\n]+?)~~/g, "<s>$1</s>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

function formatPost(raw) {
  let text = escapeHtml(String(raw).replace(/\u0000/g, ""));

  // Pull links out first so markers inside a URL are not touched.
  const links = [];
  text = text.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    (match, label, url) => {
      links.push({ label, url });
      return "\u0000" + (links.length - 1) + "\u0000";
    }
  );

  text = applyMarkers(text);

  return text.replace(/\u0000(\d+)\u0000/g, (match, i) => {
    const link = links[Number(i)];
    return (
      '<a href="' + link.url + '" target="_blank" rel="noopener noreferrer">' +
      applyMarkers(link.label) +
      "</a>"
    );
  });
}

// "2026-10-01T07:13:00Z" -> "01/10/2026 12:43" (Indian Standard Time)
function formatTimestamp(iso) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));

  const get = (type) => parts.find((p) => p.type === type).value;
  return (
    get("day") + "/" + get("month") + "/" + get("year") +
    " " + get("hour") + ":" + get("minute")
  );
}

// Builds one post as a DOM element. Used by the feed and the admin preview,
// so the preview is always identical to the live site.
// profile = { display_name, avatar_url }
const BLANK_AVATAR = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function buildPost(profile, content, iso) {
  const article = document.createElement("article");
  article.className = "post";

  const img = document.createElement("img");
  img.className = "avatar";
  img.alt = "";
  img.src = profile.avatar_url || BLANK_AVATAR;

  const body = document.createElement("div");
  body.className = "post-body";

  const head = document.createElement("div");
  head.className = "post-head";

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = profile.display_name;

  const time = document.createElement("time");
  time.className = "time";
  time.dateTime = iso;
  time.textContent = formatTimestamp(iso);

  const text = document.createElement("div");
  text.className = "text";
  text.innerHTML = formatPost(content);   // safe: formatPost escapes all HTML first

  head.append(name, time);
  body.append(head, text);
  article.append(img, body);
  return article;
}

// Lets the same file be tested with Node. Browsers ignore this.
if (typeof module !== "undefined") {
  module.exports = { formatPost, formatTimestamp };
}
