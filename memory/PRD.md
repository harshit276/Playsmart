# PlaySmart - Product Requirements Document

## Problem Statement
AI-powered badminton companion helping players understand skill level, get equipment recommendations, follow training plans, watch tutorials, and track progress.

## Architecture
- **Frontend**: React + TailwindCSS + Shadcn UI + Framer Motion
- **Backend**: FastAPI (Python) + MongoDB
- **AI**: OpenAI GPT-5.2 via Emergent LLM Key (explanation layer only)
- **Auth**: Mobile OTP (simulated for MVP)

## User Personas
- Beginner badminton players wanting to start right
- Intermediate players looking to upgrade equipment
- Regular players seeking structured training

## Core Requirements
- Deterministic recommendation engine (no random AI suggestions)
- Data-driven compatibility scoring
- Structured training plans with curated tutorials
- Progress tracking with streaks

## What's Been Implemented (March 2026)
- [x] Landing page with hero, features grid, CTA
- [x] Mobile OTP authentication flow
- [x] 6-step skill assessment questionnaire
- [x] Player dashboard with bento grid layout
- [x] Equipment recommendation engine (25 rackets, compatibility scoring)
- [x] AI explanation layer for recommendations
- [x] Price comparison across Amazon/Flipkart/Decathlon
- [x] 30-day training plans (Beginner, Beginner+, Intermediate)
- [x] 60 structured drills with YouTube video tutorials
- [x] Progress tracker with charts and day grid
- [x] Shareable player skill card
- [x] Full seed data: 25 rackets, 15 shoes, shuttlecocks, strings, grips, bags
- [x] Dark theme UI with lime-400 accent

## Prioritized Backlog
### P0 (Next)
- Real SMS OTP via Twilio
- Real product images from retailer CDNs

### P1
- Shoe recommendation engine
- Advanced player training plan
- Profile editing
- Social features (leaderboard, challenges)

### P2
- Multi-sport support (tennis, squash)
- Community forums
- Coach matching
- Video analysis
