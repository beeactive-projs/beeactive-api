# Legal pages for BeeActive

Use these for **Privacy policy URL** and **User data deletion** in Meta for Developers (and elsewhere).

## File

- **privacy-and-data-deletion.html** – One page with:
  - **Privacy Policy** (full text)
  - **User data deletion** (section with id `user-data-deletion`)

## Meta (Facebook) app settings

1. **Privacy policy URL**  
   Use the full URL to this page, e.g.:
   - `https://yourdomain.com/privacy-and-data-deletion.html`  
   or, if you use a subpath:
   - `https://yourdomain.com/legal/privacy-and-data-deletion.html`

2. **User data deletion**  
   Use the same URL. Optionally add the anchor for the deletion section:
   - `https://yourdomain.com/privacy-and-data-deletion.html#user-data-deletion`

## How to get a URL (if you don’t have a site yet)

- **Option A – Your own domain:** Put this file on your website (e.g. in your Angular app’s `src/assets` or `public` and deploy). The URL is then `https://yourdomain.com/privacy-and-data-deletion.html` (or the path you chose).
- **Option B – GitHub Pages:** Create a repo, add this HTML file, enable GitHub Pages in repo Settings. Your URL will be like `https://yourusername.github.io/repo-name/privacy-and-data-deletion.html`.
- **Option C – Netlify/Vercel:** Drag the `public` folder (or this file) into Netlify Drop or deploy the project; use the URL they give you plus `/privacy-and-data-deletion.html`.

After you have the URL, paste it in Meta for Developers → Your app → **Settings → Basic** → Privacy policy URL and User data deletion.
