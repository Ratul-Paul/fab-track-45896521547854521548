# Fab tracker (GitHub edition)

A static website (plain HTML, CSS and JS) that tracks layouts and their fab process steps.
The site is hosted on **GitHub Pages**. Your data is saved as JSON files in a **separate private
repository**, so nothing sensitive is ever in the public site. Every tick, cross or note is a
commit, so GitHub's history shows who changed what and when.

```
fab-tracker/            <- this folder, the website (public repo is fine, it has no data)
  index.html
  css/style.css
  js/config.js          <- optional defaults
  js/github.js          <- talks to the GitHub API
  js/app.js             <- the app
  .nojekyll

fab-data/               <- the private repo the app creates files in
  data/layouts/<id>.json   one file per layout (steps, notes, history, file list)
  data/files/<id>/<type>/  uploads, sorted into gds / sem / scope / other folders
  data/presets.json        the shared quick-add step list
```

## Setup (about 10 minutes)

### 1. Create the data repo (private)
1. On GitHub, **New repository**, name it e.g. `fab-data`, set it to **Private**,
   and tick **Add a README file** (the repo needs one commit).
2. **Settings > Collaborators**: add everyone in your group with **Write** access.

### 2. Create the website repo
1. New repository, e.g. `fab-tracker`. It can be **Public** (free GitHub Pages). It contains no data.
2. Upload everything in this folder, keeping the folder structure (drag and drop works,
   including the hidden `.nojekyll` file, or use `git push`).
3. **Settings > Pages**: Source = *Deploy from a branch*, Branch = `main`, folder = `/ (root)`.
4. After a minute the site is live at `https://<your-username>.github.io/fab-tracker/`.

### 3. Each person signs in once
1. Open https://github.com/settings/personal-access-tokens/new
2. Token name: `fab-tracker`. Expiration: your choice.
   Resource owner: whoever owns `fab-data`.
3. **Repository access > Only select repositories** > choose `fab-data`.
4. **Permissions > Repository permissions > Contents: Read and write**.
5. Generate the token and paste it, with `owner/fab-data`, on the app's sign-in screen.

The token is stored only in that browser. Everyone uses their own token, which is how the
tracker knows who made each update. To sign out, use the button in the top right.

Optional: put the repo name in `js/config.js` (`dataRepo: 'my-lab/fab-data'`) so people only
have to paste their token.

### 4. Add the GDS viewer (optional, 2 minutes)
Follow `js/vendor/README.txt` to put the open-source kwasm viewer script at `js/vendor/kwasm.js`
(or point `kwasmUrl` in `js/config.js` at a CDN copy). Uploaded `.gds` files then get a
**View layout** button that opens them in a pop-up inside the site. Files that are only
Box or Drive links can't be viewed in the pop-up (Box and Drive don't let other websites read
their files) and still open in a new tab. For those, download the file and use **Open GDS file**
(overview page) or **view it from your computer** (Files tab) to view it without uploading.

### 5. View GDS files from Google Drive (optional)
Drive lets a web page download a file shared as "Anyone with the link", using a free API key.
1. Go to https://console.cloud.google.com, create a project, and enable **Google Drive API**
   (APIs & Services > Library).
2. **APIs & Services > Credentials > Create credentials > API key.**
3. Edit the key. Under *Application restrictions* choose **Websites** and add
   `https://YOUR-USERNAME.github.io/*`. Under *API restrictions* choose **Restrict key** and select
   only **Google Drive API**. The key is visible in the site's code, so these restrictions matter.
4. Paste the key into `googleApiKey` in `js/config.js` and commit.
5. In Drive, share each GDS: **Share > General access > Anyone with the link > Viewer**.
   (Some university Google accounts block this. A personal Google account works.)
6. In the tracker, attach the Drive link as a **GDS layout** link. It then shows **View layout**.
   You can also use **Open from Drive** on the overview page for a one-off look.

### Large GDS files (over 25 MB)
GitHub blocks single files over 100 MiB in a normal repo, and the tracker uploads up to 25 MB.
GDS files usually compress well, so compress first and upload a `.zip` (containing one `.gds`) or a `.gds.gz`,
with the type set to **GDS layout**:
- Mac or Linux: `gzip -k mylayout.gds` creates `mylayout.gds.gz`.
- Windows or Mac: right-click the file and choose Compress / Send to compressed folder, to get a `.zip`.
  (Or 7-Zip with format **gzip**.)
The **View layout** button unpacks `.zip` and `.gz` files in the browser automatically. If a compressed file is
still over 25 MB, use **Open GDS file** (it accepts `.gds` and `.gds.gz`, with no size limit).

## Using it
- **New layout**: name, passive or active, purpose, status (Planned, Ready, In fab, Done), people.
- **Steps**: add with the box or the quick-add chips, as many times as you like. Tick, cross,
  add a note, reorder, rename, or delete. Click a step to open its note and history.
- **Files**: on a layout's Files tab, pick the type (GDS layout, SEM image, microscope image or
  other), then upload (up to 25 MB) or link a Box or Google Drive file. Files are grouped by type,
  can be filtered, and can be tied to a specific step. Images show as thumbnails.
- Changes by other people appear within 30 seconds, or press **Refresh**.
- **Export CSV** on the overview page.

## Good to know
- Two people editing the same layout at once is handled. The app re-reads the latest version
  and re-applies your change.
- Every update is a commit, so the data repo's history is your audit trail and backup.
  You can restore an older version of any layout from GitHub.
- Uploaded files live in the repo. Keep an eye on its size (GitHub recommends under 1 GB).
  Use Box or Drive links for big GDS files.
- If someone leaves the group, remove them from the `fab-data` collaborators and revoke their token.
- The site also works if you just open `index.html` from your computer. No server is needed.
