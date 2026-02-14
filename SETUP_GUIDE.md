# Solar Guardian - Complete Setup Guide

## Table of Contents
1. [Project Overview](#project-overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Database Setup](#database-setup)
5. [Running the Application](#running-the-application)
6. [Making It Accessible to Friends](#making-it-accessible-to-friends)
7. [Troubleshooting](#troubleshooting)
8. [Deployment Options](#deployment-options)

---

## Project Overview

**Solar Guardian** is a full-stack solar panel monitoring system with:
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (via Prisma ORM)
- **Real-time**: ESP32 sensor data integration

---

## Prerequisites

Before you begin, ensure you have the following installed:

1. **Node.js** (v18 or higher)
   - Download from: https://nodejs.org/
   - Verify: `node --version`

2. **npm** (comes with Node.js)
   - Verify: `npm --version`

3. **Git**
   - Download from: https://git-scm.com/
   - Verify: `git --version`

4. **Neon PostgreSQL Account** (free tier works!)
   - Sign up at: https://neon.tech

---

## Quick Start

### 1. Clone the Repository

```
bash
git clone https://github.com/BM-005/solar-guardian.git
cd solar-guardian
```

### 2. Install Dependencies

```
bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

### 3. Configure Environment Variables

Create a `.env` file in the `server` directory:

```
env
# Server/.env
DATABASE_URL="postgresql://username:password@host.neon.tech/solar-guardian?sslmode=require"
PORT=3000
```

> **Note**: Replace the DATABASE_URL with your Neon PostgreSQL connection string.

### 4. Set Up Database

```
bash
cd server

# Generate Prisma Client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# (Optional) Seed the database with sample data
npm run seed
```

### 5. Start the Application

**Terminal 1 - Backend Server (port 3000):**
```
bash
cd server
npm run dev
```

**Terminal 2 - Frontend Server (port 8080):**
```
bash
npm run dev
```

### 6. Access the Application

- Frontend: http://localhost:8080
- Backend API: http://localhost:3000
- API Health Check: http://localhost:3000/health

---

## Database Setup

### Using Neon PostgreSQL (Recommended for Shared Access)

1. **Create a Neon Account**
   - Go to https://neon.tech
   - Sign up for free

2. **Create a New Project**
   - Name: `solar-guardian`
   - Select the closest region to you

3. **Get Connection String**
   - Go to Dashboard > Connection Details
   - Copy the connection string (format: `postgresql://user:pass@host.neon.tech/db?sslmode=require`)

4. **Add to .env File**
   
```
   DATABASE_URL="postgresql://your-username:your-password@your-host.neon.tech/solar-guardian?sslmode=require"
   
```

5. **Important: Keep Database Active**
   - Free Neon databases auto-suspend after 5 minutes of inactivity
   - To prevent this, you can:
     - Upgrade to Neon Pro ($20/month)
     - Use a database pooler
     - Set up a cron job to make periodic requests

---

## Running the Application

### Development Mode

```bash
# Start both frontend and backend together
npm run dev:all
```

Or separately:

```
bash
# Terminal 1 - Backend
cd server
npm run dev

# Terminal 2 - Frontend  
npm run dev
```

### Production Build

```
bash
# Build frontend
npm run build

# Preview production build
npm run preview
```

---

## Making It Accessible to Friends

Since you're running locally, your friends cannot access your application directly. Here are the options:

### Option 1: Deploy to a Hosting Platform (Recommended)

Deploy the application to a cloud platform so it's accessible via a public URL.

#### Frontend Deployment (Vercel - Free)

1. **Push your code to GitHub**
   
```
bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   
```

2. **Deploy to Vercel**
   - Go to https://vercel.com
   - Sign up with GitHub
   - Import your repository
   - Vercel will automatically detect the Vite/React project
   - Add environment variables if needed
   - Deploy!

3. **Your friends can now access**: `https://your-project.vercel.app`

#### Backend Deployment (Render - Free)

1. **Push code to GitHub** (if not already done)

2. **Deploy to Render**
   - Go to https://render.com
   - Sign up with GitHub
   - Create a new Web Service
   - Connect your GitHub repository
   - Settings:
     - Build Command: (leave empty)
     - Start Command: `npm run start`
   - Add Environment Variables:
     - `DATABASE_URL`: Your Neon PostgreSQL connection string
   - Deploy!

#### Alternative: Use ngrok (Temporary)

For temporary access without deployment:

```
bash
# Install ngrok
npm install -g ngrok

# Expose your frontend
ngrok http 8080

# Share the URL with your friends
```

---

## Troubleshooting

### Error: "Failed to fetch" / "Error loading panels"

**Cause**: Backend server is not running or database is not accessible.

**Solutions**:
1. Ensure backend is running: `netstat -ano | findstr :3000`
2. Ensure database is active (Neon might be suspended)
3. Check DATABASE_URL in .env file is correct

### Error: "Cannot find module" / "Module not found"

**Cause**: Dependencies not installed.

**Solution**:
```
bash
npm install
cd server && npm install
```

### Error: "Connection refused" on port 3000

**Cause**: Backend server not running.

**Solution**:
```
bash
cd server
npm run dev
```

### Error: "Database connection failed"

**Cause**: Invalid DATABASE_URL or database is suspended.

**Solutions**:
1. Verify DATABASE_URL is correct in .env
2. Check Neon database is not suspended
3. Try reconnecting: `npx prisma db push`

### Page loads but shows no data

**Cause**: API requests are failing.

**Solution**:
1. Check browser console (F12 > Console) for errors
2. Verify backend is running: http://localhost:3000/health
3. Check network tab (F12 > Network) for failed requests

### Database Suspended (Neon Free Tier)

**Cause**: Free Neon databases auto-suspend after 5 minutes of inactivity.

**Solutions**:
1. **Quick fix**: Make a request to wake up the database (wait 5-10 seconds)
2. **Upgrade**: Pay for Neon Pro ($20/month)
3. **Alternative**: Use a different database provider

---

## Deployment Options

### Option 1: Vercel + Render (Free)

| Component | Platform | Free Tier |
|-----------|----------|-----------|
| Frontend | Vercel | 100GB bandwidth/month |
| Backend | Render | 750 hours/month |
| Database | Neon | Free tier (with limitations) |

**Steps:**
1. Deploy frontend to Vercel
2. Deploy backend to Render
3. Update frontend API calls to point to Render URL

### Option 2: Railway (All-in-One)

- Website: https://railway.app
- Free tier: $5 credit/month
- Includes: Backend + Database + Hosting

**Steps:**
1. Connect GitHub repo to Railway
2. Add PostgreSQL plugin
3. Deploy with automatic builds

### Option 3: Fly.io

- Website: https://fly.io
- Free tier: 3 shared VMs
- Good for: Global deployment

### Option 4: Supabase + Vercel

- **Supabase**: Free PostgreSQL + API (no backend needed!)
- **Vercel**: Frontend hosting
- This removes the need for a separate Express backend!

---

## API Endpoints

When running locally:

| Endpoint | Description |
|----------|-------------|
| http://localhost:3000/health | Health check |
| http://localhost:3000/api/panels | Get all panels |
| http://localhost:3000/api/panels/:id | Get panel by ID |
| http://localhost:3000/api/analytics/dashboard | Dashboard metrics |
| http://localhost:3000/api/weather/current | Current weather |
| http://localhost:3000/api/technicians | Get technicians |
| http://localhost:3000/api/tickets | Get tickets |

---

## Project Structure

```
solar-guardian/
├── src/                    # Frontend source code
│   ├── components/         # React components
│   ├── pages/             # Page components
│   ├── lib/               # Utilities and API client
│   └── types/             # TypeScript types
├── server/                 # Backend source code
│   ├── src/
│   │   ├── routes/        # API routes
│   │   └── index.ts       # Express app entry
│   └── prisma/            # Database schema
├── public/                 # Static assets
├── package.json            # Frontend dependencies
└── vite.config.ts         # Vite configuration
```

---

## Commands Reference

```
bash
# Frontend
npm run dev              # Start frontend dev server
npm run build            # Build for production
npm run preview          # Preview production build

# Backend
cd server
npm run dev              # Start backend dev server
npm run build            # Compile TypeScript
npm run start            # Start production server
npx prisma studio        # Open Prisma database GUI

# Both
npm run dev:all          # Start frontend + backend together
```

---

## Support

If you encounter issues:

1. Check the browser console (F12 > Console)
2. Check the terminal for error messages
3. Verify all dependencies are installed
4. Ensure database is accessible
5. Check network tab for failed requests (F12 > Network)

---

## License

This project is for educational purposes.

---

*Last updated: 2025*
