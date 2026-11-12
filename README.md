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
  data/files/<id>/<type>/  uploads, sorted into gds / dxf / design / sem / scope / other folders
  data/files/<id>/results/ images added in the Results section
  data/files/recipes/<id>/ files attached to recipes
  data/recipes/<id>.json   one file per recipe (parameters, files list, issues, history)
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

Easier for the team: put the repo name in `js/config.js` (`dataRepo: 'my-lab/fab-data'`) so people only
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
Every layout has three sections, shown as tabs: **Design**, **Fab** and **Results**.

- **Header**: name, passive or active, status (Planned, Ready, In fab, Measuring, Done), people,
  purpose, and **tags**. Tags are free text (Full laser, Passive only, Deep trench, Cleaved, No PECVD
  are suggested, and any tag you type is offered to everyone next time). On the overview page you can
  filter by one or more tags.
- **Overview rows** show name, tags, people and progress. A layout's description is on its own page (search still looks
  inside it). Rows carry a faint tint: red when any step has an open issue, blue-grey while In fab, green when Done.
- **Sort and group** (overview page): sort layouts by last updated, date created, name, Design start,
  Fab start, Fab finish or Measurement start. The arrow button reverses the order, and layouts without
  that date always go last. **Group** chooses between sections by status and one flat list. Your choice
  is remembered in your browser.
- **Design**: GDS, DXF and other design files. Upload them (up to 25 MB; zip or gzip big GDS files) or
  link them from Box or Google Drive. Uploaded GDS files have a **View layout** button.
- **Fab**: the process steps.
  - Add steps with the box or the quick-add chips, as many times as you like. The optional date next
    to the box sets the step's **start date** (you can also edit it later, or click Today).
  - Tick or cross each step, and add a **note**.
  - Click a step to open it: set the **recipe used**, add notes, **report issues** (each issue can be
    marked resolved or reopened, and open issues show on the step and on the overview), reorder,
    rename or delete it, and see its history of who changed what.
  - Below the steps, **Process images and files** holds SEM images, microscope images and other files,
    which you can tie to a step.
- **Results**: a running report with four kinds of blocks, in any order.
  - **Text**: write findings (supports `- bullets`, `# headings` and `**bold**`).
  - **Image**: measurement photos or exported plots, with captions.
  - **Table**: paste from Excel or CSV (first row = column names, up to 2,000 rows).
  - **Plot**: pick a table, then line, scatter or bar, the X column, one or more Y columns and axis
    labels. Download any plot as SVG. **Print report** gives a clean printout or PDF.
- **Videos**: attach MP4 or WebM videos like any other file (type **Video** on the Fab tab, the Results tab, or a
  recipe's files) and click **Play video** to watch them in a pop-up player, as with images. Up to 25 MB each, so
  compress longer clips. MOV files may not play in every browser (convert to MP4). Videos are loaded in full before
  they play. A Google Drive link to a video can play inside the page too, if you have access to it in Drive.
- **Recipe library** (the **Recipes** tab at the top): save your process recipes once and reuse them.
  - Each recipe has a name, process (for example Etching), version, status (Active, Draft or Retired),
    equipment, and **parameters and procedure** (text with `- bullets`, `# headings`, `**bold**`).
  - The parameters editor colours fab terms as you type: values with units (100 W, 30 mTorr, 40 / 5 sccm, 60 s,
    115 °C), gases and materials (SF6, O2, HF, TMAH, Au, resists), process words (etch, bake, spin, liftoff) and
    warnings (NOTE, WARNING). Insert buttons add common lines (Gas, Power, Pressure, Time, Spin, Bake, Dose, and for e-beam work Beam current, Beam size, Step size, Dwell time, Write field, Aperture, Acceleration voltage).
    Lines written as `Key: value` show as a tidy parameter list on the recipe page.
  - Attach **files** (uploads up to 25 MB, or Box and Drive links), for example a recipe exported from the tool.
  - A recipe can have its own **issues**, which you report and mark resolved or reopened, just like on a step.
  - The page lists every **layout and step that uses the recipe**, and a **history** of who changed what.
  - **Duplicate as a new version** makes a draft copy to edit. Mark the old one Retired.
  - On any step, the **Recipe used** dropdown lists your recipes, with the ones matching the step's name
    first. Choose **Custom** to type free text instead. A step using a recipe that has open issues shows a warning.
  - Editing a recipe changes it for every step that uses it. To keep an earlier run's recipe unchanged,
    duplicate it as a new version, edit the copy, and retire the old one.
- **Section dates**: each of Design, Fab and Measurement (the Results tab) has **Started** and
  **Finished** dates at the top, with Today buttons and a day count. A timeline under the layout header
  shows all three, and the overview shows them in short form.
- **Overdue**: give a section (Design, Fab, Measurement) or a single step a **time frame in days**. The start
  date counts as day 1, so a 5-day time frame started on the 1st is due on the 5th and overdue from the 6th.
  Anything that has a start date and a time frame, and is not finished, is labelled **Overdue by N days** in red.
  Sections are finished when they have a finish date, and steps when they are ticked done or crossed. Overdue
  shows on the step, in the section row and timeline, in the layout summary, and on the overview. The CSV export
  has the time frames and an Overdue column. Duplicating a layout keeps its time frames but not its dates.
- **Duplicate layout** (bottom of a layout page): makes a copy with the same type, purpose and tags.
  Choose whether to copy the steps (reset to not started), their recipes and notes, and linked design files.
  Uploaded files, results, issues, dates and history are not copied. The copy starts as Planned.
- **Copy and paste steps**: on the Fab tab click **Select steps to copy**, tick the steps and click Copy
  (or open one step and click **Copy step**). In any layout, including the same one, click **Paste**
  to add them at the end, or **Paste after** inside a step to insert them there. Pasted steps keep the
  name and recipe and start as not started. The clipboard is kept in your browser, so it also works
  after a reload or in another tab.
- Changes by other people appear within 30 seconds, or press **Refresh**.
- **Export CSV** on the overview page lists every step with tags, section dates, start date, recipe and open issues.

## Good to know
- Two people editing the same layout at once is handled. The app re-reads the latest version
  and re-applies your change.
- Every update is a commit, so the data repo's history is your audit trail and backup.
  You can restore an older version of any layout from GitHub.
- Uploaded files live in the repo. Keep an eye on its size (GitHub recommends under 1 GB).
  Use Box or Drive links for big GDS files.
- If someone leaves the group, remove them from the `fab-data` collaborators and revoke their token.
- The site also works if you just open `index.html` from your computer. No server is needed.
