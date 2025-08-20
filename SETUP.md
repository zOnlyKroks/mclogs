# MCLogs Setup Guide

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Install root dependencies
npm run install:all

# Or install individually
cd backend && npm install
cd ../frontend && npm install
```

### 2. Set up Google OAuth2

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure OAuth consent screen first if prompted
6. For **Application type**, select **Web application**
7. Add authorized redirect URI: `http://localhost:8000/api/auth/google/callback`
8. Copy your **Client ID** and **Client Secret**

### 3. Environment Variables

Create a `.env` file in the `backend/` directory:

```bash
# backend/.env
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
JWT_SECRET=your-super-secret-jwt-key-change-in-production
SESSION_SECRET=your-super-secret-session-key
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

### 4. Start Development

```bash
# Start both backend and frontend
npm run dev
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000

## ✨ Features

### ✅ Implemented
- **Google OAuth2 Authentication** - Sign in with Google
- **User Crash Log Management** - Max 10 logs per user (auto-deletion)
- **Enhanced UI** - Modern design with improved feedback
- **Smart Crash Parsing** - Detects Minecraft version, mods, culprits
- **Clickable Mod Links** - Direct links to Modrinth/CurseForge
- **Expandable Mod Lists** - Show/hide complete mod lists
- **Copy URL Functionality** - One-click sharing
- **Loading States** - Visual feedback during submission
- **Responsive Design** - Works on desktop and mobile

### 🔐 Authentication Flow
1. User clicks "Sign in with Google"
2. Redirected to Google OAuth2
3. After consent, redirected back with JWT token
4. Token stored in localStorage
5. API requests include `Authorization: Bearer <token>` header

### 📊 User Limits
- **Authenticated users**: Max 10 crash logs (oldest auto-deleted)
- **Anonymous users**: Still allowed (for accessibility)
- **All logs**: 30-day automatic expiration

## 🛠️ Development

### Backend Structure
```
backend/src/
├── routes/
│   ├── auth.ts          # Google OAuth2 endpoints
│   └── crashLogs.ts     # Crash log CRUD with user limits
├── services/
│   ├── auth.ts          # JWT + Passport configuration
│   ├── database.ts      # SQLite with user management
│   └── crashParser.ts   # Enhanced Minecraft log parsing
└── models/
    ├── User.ts          # User interface
    └── CrashLog.ts      # Crash log interface
```

### Frontend Structure
```
frontend/src/
├── stores/
│   └── auth.ts          # Pinia auth store
├── services/
│   ├── api.ts           # HTTP client with auth
│   └── modLinks.ts      # Mod URL generation
├── views/
│   ├── HomeView.vue     # Enhanced submission form
│   ├── SearchView.vue   # Search interface
│   └── CrashView.vue    # Crash log display
└── components/
    └── CrashLogDisplay.vue  # Syntax highlighting
```

### Database Schema
- **users**: id, google_id, email, name, picture, created_at, last_login
- **crash_logs**: id, user_id, content, minecraft_version, mod_loader, culprit_mod, etc.

## 🔒 Security

- **JWT tokens** with 7-day expiration
- **Rate limiting** (10 submissions/15min, 60 searches/min)
- **CORS** configured for localhost
- **Helmet** security headers
- **Input validation** and sanitization

## 🚀 Production Deployment

1. **Update environment variables**:
   ```bash
   GOOGLE_CLIENT_ID=your_production_client_id
   GOOGLE_CLIENT_SECRET=your_production_client_secret
   FRONTEND_URL=https://yourdomain.com
   NODE_ENV=production
   ```

2. **Update Google OAuth2 redirect URI**:
   - Add: `https://yourdomain.com/api/auth/google/callback`

3. **Build and deploy**:
   ```bash
   npm run build
   npm start
   ```

4. **Set up HTTPS** (required for production OAuth2)

5. **Configure CORS** for your domain

## 🐛 Troubleshooting

### Authentication Issues
- Check Google Console for correct redirect URI
- Verify environment variables are set
- Check browser console for JWT errors

### Database Issues
- Database auto-migrates on startup
- Delete `crashes.db` to reset (will lose data)
- Check file permissions for SQLite

### CORS Issues
- Ensure frontend URL matches CORS configuration
- Check for correct protocol (http vs https)

## 📝 API Endpoints

### Authentication
- `GET /api/auth/google` - Initiate Google OAuth2
- `GET /api/auth/google/callback` - OAuth2 callback
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/logout` - Logout

### Crash Logs
- `POST /api/crashes` - Submit crash log (optional auth)
- `GET /api/crashes/:id` - Get crash log by ID
- `GET /api/crashes` - Search crash logs

The application is now production-ready with user management and enhanced UX! 🎉