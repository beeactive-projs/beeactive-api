# Meta (Facebook) app – fix the rest

App icon is done. Do these next in [developers.facebook.com/apps](https://developers.facebook.com/apps) → your app → **Settings → Basic**.

---

## 1. Privacy policy URL

You need a **live URL** to the privacy policy page.

- **If you already have a website (e.g. beeactive.fit):**  
  Upload `privacy-and-data-deletion.html` to your site (e.g. at `https://beeactive.fit/privacy-and-data-deletion.html` or `https://beeactive.fit/legal/privacy`).  
  Then in Meta paste: **`https://your-domain.com/path/to/privacy-and-data-deletion.html`**

- **If you don’t have a site yet – use GitHub Pages (free):**
  1. Create a new GitHub repo (e.g. `beeactive-legal`).
  2. Upload **only** the file `privacy-and-data-deletion.html` into the root of the repo.
  3. In the repo: **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main** (or **master**) → Folder: **/ (root)** → Save.
  4. After a minute, your URL is: **`https://<your-github-username>.github.io/beeactive-legal/privacy-and-data-deletion.html`**
  5. In Meta, paste that URL into **Privacy policy URL**.

---

## 2. User data deletion

Meta wants a URL where you explain how users can delete their data.

- Use the **same URL** as the privacy policy.  
  If you use the GitHub Pages URL above, paste it again in **User data deletion**.  
  Optional: add the anchor so it jumps to the deletion section:  
  **`https://<your-github-username>.github.io/beeactive-legal/privacy-and-data-deletion.html#user-data-deletion`**

---

## 3. Category

In **Settings → Basic**, find the **Category** dropdown and pick one that fits (e.g. **Health and fitness**, **Lifestyle**, or **Other**). Save.

---

## 4. App ID

The **App ID** is already on the same Basic page. You don’t upload it; Meta fills it. If a form says “App ID” is missing, make sure you’ve **saved** the Basic settings after filling Privacy policy URL, User data deletion, and Category.

---

## 5. Fix "Invalid Scopes: email" (Facebook Login)

If you see **Invalid Scopes: email** when testing Facebook Login, the app must have the **email** permission enabled for its use case:

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) → your app.
2. In the left sidebar, open **Use cases** (or **App settings** → **Use cases**).
3. Find **Facebook Login** or **Authentication and account creation** (or **Customize** → **Add use case**).
4. Add or open the **Authentication and account creation** use case. Ensure **email** is included in the permissions for that use case (and **public_profile**).
5. Save. Wait a few minutes, then try logging in again.

If your app was created with a use case that doesn’t include email, add the **Authentication and account creation** use case so the `email` scope is valid.  
Docs: [Facebook Login permissions](https://developers.facebook.com/docs/facebook-login/guides/permissions).

---

## Contact email in the policy

The file `privacy-and-data-deletion.html` uses **support@beeactive.fit** as the contact email. To change it, edit the file and replace `support@beeactive.fit` with your preferred address, then re-upload the file to your site or GitHub repo.
