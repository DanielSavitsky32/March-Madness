# 🏀 March Madness Bracket Generator (2026 Edition)
 
**Live Demo:** [danielsavitskymarchmadness.netlify.app](https://danielsavitskymarchmadness.netlify.app/)
 
An interactive NCAA tournament simulator that generates personalized March Madness brackets using real 2026 team metrics and AI-powered game predictions. Built in React and TypeScript, deployed on Netlify.
 
---
 
## What It Does
 
- **Simulates the full 2026 NCAA tournament** using offensive/defensive efficiency ratings and tempo data to calculate win probabilities for every matchup
- **Personality quiz** — answer a few questions to determine your "Madness Archetype" (Chaos Agent, Analytics Guru, etc.), which influences how your bracket is generated (more upsets vs. chalk)
- **AI-powered analysis** — integrates with the Google Gemini API to provide commentary and matchup breakdowns
- **Interactive bracket visualization** — watch results populate round by round with a clean, responsive UI
 
## Why I Built It
 
I wanted a project that combined a few things I care about: sports, data-driven decision making, and shipping something real that people can actually use. March Madness is the perfect domain for this — the tournament structure is well-defined, the data is available, and everyone has an opinion about their bracket. I built and deployed the whole thing over a few days during the 2026 tournament.
 
## Tech Stack
 
| Layer | Tools |
|-------|-------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons |
| **Backend** | Node.js, Express |
| **Data** | Better-SQLite3 (in-memory simulation state) |
| **AI** | Google Gemini API (`@google/genai`) |
| **Deployment** | Netlify |
 
## How It Works
 
1. **Seeding** — Teams are seeded using March 2026 bracketology projections (Duke, Kansas, UConn, Houston as 1-seeds)
2. **Metrics** — Each team has offensive efficiency, defensive efficiency, and tempo ratings that feed into win probability calculations
3. **Personality modifier** — Your quiz results adjust the simulation's upset sensitivity, so a "Chaos Agent" bracket looks very different from an "Analytics Guru" bracket
4. **Simulation** — The engine runs through each round, resolving matchups probabilistically and rendering results in real time
 
## Local Setup
 
### Prerequisites
 
- Node.js 18.0+
- npm 9.0+
- [Gemini API Key](https://aistudio.google.com/) (free)
 
### Installation
 
```bash
git clone https://github.com/danielfrecska/2026-March-Madness-Bracket-Generator.git
cd 2026-March-Madness-Bracket-Generator
npm install
```
 
### Environment Configuration
 
```bash
cp env.example .env
# Add your Gemini API key to .env
# GEMINI_API_KEY=your_actual_api_key_here
```
 
### Run
 
```bash
# Development (with hot reload)
npm run dev
 
# Production build
npm run build
npm run preview
```
 
## License
 
MIT
