# Andy's Dashboard Deployment Guide

## 🔐 Security Information

**Default Credentials:**
- Username: `naveen`
- Password: `andy2026`

⚠️ **IMPORTANT**: Change these credentials before deploying to production!

To change the password:
1. Open `secure-dashboard.html`
2. Find the `CREDENTIALS` object
3. Replace `passwordHash` with a hash of your new password
4. To generate a hash, open the file in browser console and run: `simpleHash('your-new-password')`

## 📦 Deployment Options

### Option 1: Netlify (Easiest - Recommended)

1. Go to [netlify.com](https://www.netlify.com)
2. Sign up for free (GitHub, GitLab, or email)
3. Drag and drop `secure-dashboard.html` to Netlify's dashboard
4. Your site will be live at `https://your-site-name.netlify.app`

**Pros:**
- Free hosting
- HTTPS included
- Custom domain support
- Instant deployment

### Option 2: Vercel

1. Go to [vercel.com](https://vercel.com)
2. Sign up for free
3. Upload `secure-dashboard.html`
4. Deploy instantly

**Pros:**
- Free tier generous
- Excellent performance
- Global CDN

### Option 3: GitHub Pages

1. Create a new GitHub repository
2. Upload `secure-dashboard.html` and rename it to `index.html`
3. Go to Settings → Pages
4. Enable GitHub Pages
5. Your site will be at `https://username.github.io/repo-name`

**Pros:**
- Free forever
- Version control included
- Easy updates via Git

### Option 4: Cloudflare Pages

1. Go to [pages.cloudflare.com](https://pages.cloudflare.com)
2. Create account
3. Upload your file
4. Deploy

**Pros:**
- Free tier
- Fast global CDN
- Good security features

## 🚀 Quick Deployment (No Account Needed)

### Tiiny.host (Temporary)

1. Go to [tiiny.host](https://tiiny.host)
2. Upload `secure-dashboard.html`
3. Get instant URL (expires after 7 days on free tier)

### Surge.sh (Command Line)

```bash
npm install -g surge
surge secure-dashboard.html
```

## 🔒 Security Best Practices

1. **Change Default Password**: See security information above
2. **Use HTTPS Only**: All recommended hosts provide HTTPS
3. **Session Management**: Sessions expire after 24 hours
4. **Don't Share URL Publicly**: This is for personal use

## 🛠 Advanced: Self-Hosted Server

If you want more control, you can host on your own server:

```bash
# Simple Python server
python3 -m http.server 8080

# Or using Node.js (install http-server first)
npx http-server -p 8080
```

Then use a service like:
- **ngrok**: `ngrok http 8080` (for temporary public URL)
- **CloudFlare Tunnel**: For permanent self-hosted solution

## 📱 Mobile Access

All hosting options work perfectly on mobile browsers. Just visit the URL on your phone!

## 🔄 Updating the Dashboard

1. Make changes to `secure-dashboard.html`
2. Re-deploy using your chosen method:
   - **Netlify/Vercel**: Drag and drop new file
   - **GitHub Pages**: Commit and push changes
   - **Surge**: Run `surge` again

## 📊 Data Persistence

The dashboard stores all project data in your browser's localStorage. This means:
- Data persists across sessions
- Data is device-specific (not synced across devices)
- Clearing browser data will reset the dashboard

For multi-device sync, you'd need a backend database (more complex setup).

## ❓ Troubleshooting

**Can't login?**
- Make sure you're using the correct credentials
- Check browser console for errors
- Clear browser cache and try again

**Dashboard not loading?**
- Check internet connection
- Try different browser
- Verify file uploaded correctly

**Lost data?**
- Data is stored in browser localStorage
- Check if you're using the same browser/device
- Check browser settings haven't cleared site data

## 🆘 Need Help?

Just ask Andy! I can help you with deployment or customization.
