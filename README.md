# Personal microblog

A stream of short thoughts. Plain HTML, CSS and JavaScript. Supabase stores the posts and handles login. No build step.

## Files

| File | What it does |
|---|---|
| `index.html` | Public feed |
| `script.js` | Loads the profile and posts, infinite scroll |
| `format.js` | Turns post text into safe HTML and formats IST timestamps (shared by feed and admin preview) |
| `style.css` | All styling, feed and admin |
| `admin.html` / `admin.js` | Private page: sign in, write, edit, drafts, delete, profile |
| `config.js` | Your Supabase URL and anon key (public values only) |
| `setup.sql` | Tables, security rules and avatar storage |

## Setup

### 1. Create the Supabase project
1. Sign up at supabase.com and create a new project.
2. Go to **SQL Editor > New query**, paste all of `setup.sql`, and click **Run**.

### 2. Create your admin account
1. **Authentication > Users > Add user**: enter your email and a strong password, and tick "Auto confirm user".
2. **Authentication > Sign In / Providers**: turn **off** "Allow new users to sign up".
3. In the SQL Editor, run this with your own email:
   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

### 3. Connect the site
1. **Project Settings > API**: copy the Project URL and the `anon` / publishable key.
2. Put both into `config.js`.
3. Never put the `service_role` key anywhere in these files.

### 4. Deploy on Vercel
1. Push the folder to a GitHub repo (or drag the folder into vercel.com/new).
2. Framework preset: **Other**. No build command, no output directory.
3. Deploy. The feed is at `/`, the admin at `/admin.html`.

## Writing posts

Posts are stored as plain text. The toolbar inserts these markers for you:

| Marker | Result |
|---|---|
| `==word==` | highlight |
| `**word**` | bold |
| `*word*` | italic |
| `~~word~~` | strikethrough |
| `[text](https://url)` | link |

Emojis are just text: use the emoji button or your phone's keyboard. Everything else is escaped, so posts cannot inject HTML or scripts.

- **Publish** sets the date once. Editing a published post keeps its place in the feed. Tick "Move to top" while editing to reset the date.
- **Unpublish** hides a post but keeps it. **Delete** removes it permanently after a confirmation.
- **Profile** tab: upload a photo (cropped square), change name, colour and tab title. Changes apply to the whole feed.

## How security works

Hiding `admin.html` protects nothing on its own. The real protection is Row Level Security in the database:
- Visitors can read only posts with `status = 'published'`, plus the profile row.
- Only the user listed in `admin_users` can insert, edit or delete posts, edit the profile, or upload avatars.
- The anon key in `config.js` is meant to be public.

## Test the permissions once it is live

In a private window (signed out), open the browser console on your site and try:
```js
await db.from("posts").select()                              // only published posts
await db.from("posts").insert({content:"x"})                 // must fail
await db.from("posts").update({content:"x"}).eq("status","published").select()  // returns []
await db.from("posts").delete().eq("status","published").select()               // returns []
```
Then sign in at `/admin.html` and check that you can see drafts, publish, edit, unpublish, delete, and save the profile.
