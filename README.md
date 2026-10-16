# Thought Board

A personal dashboard for capturing **thoughts**, moving them through stages, deciding on them, and running the ones you **Proceed** with as **projects** — on a Kanban board or a list. Each item can be shared through a private, read-only link that shows only that item.

Plain HTML/CSS/JavaScript — no build step. Hosted free on **GitHub Pages**, data stored free on **Supabase**.

---

## 1. Try it on your computer (optional)

The app works immediately in **Local mode** (data saved only in that browser, with four sample items you can delete).

Browsers block JavaScript modules opened by double-click, so serve the folder:

```bash
cd thought-board
python3 -m http.server 8000
# open http://localhost:8000
```

## 2. Publish on GitHub Pages

1. On github.com create a new repository, e.g. `thought-board` (Public is required for free Pages; your *data* stays private in the database).
2. Upload everything in this folder (keep the `css/`, `js/` and `supabase/` folders).
3. Repository → **Settings → Pages** → *Source: Deploy from a branch* → Branch **main**, folder **/ (root)** → Save.
4. After a minute your board is at `https://<your-username>.github.io/thought-board/`.

At this point it runs in Local mode. Do step 3 to store data online, use it from any device, and enable sharing.

## 3. Connect the free database (Supabase)

1. Sign up at **supabase.com** → **New project**. Pick region **South Asia (Mumbai)**. Save the database password somewhere safe.
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
3. **Authentication → Users → Add user → Create new user**: your email + a password, tick *Auto confirm user*.
4. **Authentication → Sign In / Providers** → turn **off** *Allow new users to sign up* (so nobody else can create an account).
5. **Project Settings → API** (or *API Keys*): copy the **Project URL** and the **anon / publishable** key.
6. Edit `js/config.js` on GitHub and paste them:

```js
SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJ…  or  sb_publishable_…',
```

Commit. Reload your site → sign in with the user from step 3.

> The anon/publishable key is meant to be public. Your data is protected by **row-level security**: only the signed-in owner can read or change rows; share links can read only the single row whose secret token they carry.

**Moving sample/local data online:** in Local mode use **⋯ → Export backup**, then after connecting Supabase use **⋯ → Import backup**.

### Free-tier notes
- 500 MB database — tens of thousands of thoughts.
- A free project **pauses after 7 days with no activity**. Your data is kept; open the Supabase dashboard and click *Restore*. Using the board at least once a week avoids this.
- Take an **Export backup** now and then.

## How it works

| Concept | Rule |
|---|---|
| Stages | Initial → Data Gathering → Review → Decision |
| Decision | Proceed · Dropped · For Future Consideration · On-Hold (shown only at the Decision stage) |
| Project | A thought whose decision is **Proceed**. Priority (High/Medium/Low) and Status (Not Started/WIP/Completed/On-Hold) become active. |
| End date | Start date + Duration (weeks), calculated automatically |
| Description / Objective | Max 250 words each (live counter) |
| Icon | Square slot: an emoji, a square image URL, or the title's initials by default |
| Dev link | Link to wherever the real work happens (Notion, Drive, Trello, GitHub…) |
| Sharing | ⋯ Share → *Create link* → `share.html?t=<secret>`. *Stop sharing* kills the link. |

**Boards:** Pipeline (thoughts by stage) · Decisions · Projects by Status · Projects by Priority. Drag cards between columns to change the field. **List** view shows everything in a table with a Thoughts/Projects filter.

## Files

```
index.html           dashboard
share.html           public read-only view of one shared item
css/styles.css       all styles (light + dark, desktop + mobile)
js/config.js         ← your Supabase URL/key, currency, word limit
js/model.js          stages, decisions, statuses, date & money helpers
js/store.js          data layer (Local or Supabase)
js/app.js            dashboard UI
js/share.js          share page
supabase/schema.sql  database table, security rules, share function
```

## Extending later

- **New field:** add a column in `schema.sql` (`alter table thoughts add column …`), add the name to `FIELDS` in `model.js`, add an input in `index.html`, and read/fill it in `openEditor` / `readForm` in `app.js`.
- **New board:** add an entry to `BOARDS` in `app.js` and a button in `#boardSeg`.
- **Mobile app feel:** the layout is already responsive; adding a `manifest.json` + service worker turns it into an installable PWA.

Fonts: Space Grotesk and Inter (SIL Open Font License), loaded from Google Fonts.
