/*
  Fab tracker settings.

  dataRepo  The repository that stores your tracker data, as "owner/name".
            Use a PRIVATE repo for this. Leave it empty to type it in on the
            sign-in screen instead (it is then remembered in the browser).
  branch    Leave empty to use the repo's default branch.
*/
window.FAB_CONFIG = {
  dataRepo: '',      // e.g. 'my-lab/fab-data'  (set this once and teammates only need to paste a token)
  branch: '',
  dataDir: 'data',
  // Where the GDS viewer script lives. Default is the copy you add to js/vendor/.
  // You may instead paste a CDN address for kwasm here.
  kwasmUrl: 'js/vendor/kwasm.js',
  // Optional: Google API key (Drive API only) so GDS files shared on Google Drive as
  // "Anyone with the link" can be viewed in the browser. See the README.
  googleApiKey: ''
};
