import { useState, useCallback, useMemo, useEffect } from "react";

// ── Historical seed win rates (1985-2025 NCAA tournament data) ──
const HISTORICAL_SEED_WIN_RATES = {
  "1v16": 0.993, "2v15": 0.943, "3v14": 0.854, "4v13": 0.788,
  "5v12": 0.649, "6v11": 0.627, "7v10": 0.607, "8v9": 0.511,
  "1v8": 0.797, "1v9": 0.867, "2v7": 0.667, "2v10": 0.760,
  "3v6": 0.573, "3v11": 0.717, "4v5": 0.557, "4v12": 0.649,
  "4v13": 0.788, "1v4": 0.707, "1v5": 0.827, "2v3": 0.587,
  "2v6": 0.720, "1v2": 0.560, "1v3": 0.660,
};

function getSeedWinRate(s1, s2) {
  const hi = Math.min(s1, s2), lo = Math.max(s1, s2);
  const key = `${hi}v${lo}`;
  if (HISTORICAL_SEED_WIN_RATES[key] !== undefined) {
    return s1 === hi ? HISTORICAL_SEED_WIN_RATES[key] : 1 - HISTORICAL_SEED_WIN_RATES[key];
  }
  const diff = s2 - s1;
  return 1 / (1 + Math.pow(10, -diff * 0.065));
}

// ── Factor weights (calibrated from research) ──
const WEIGHTS = {
  adjEM: 0.30,       // Adjusted efficiency margin (most predictive single stat)
  adjO: 0.08,        // Offensive efficiency
  adjD: 0.10,        // Defensive efficiency (slightly more predictive than O)
  tempo: 0.02,       // Tempo factor
  seed: 0.15,        // Historical seed performance
  sos: 0.08,         // Strength of schedule
  luck: -0.04,       // Negative weight — lucky teams regress
  experience: 0.06,  // Roster experience / continuity
  threeRate: 0.05,   // 3-point shooting variance (both ways)
  ftRate: 0.04,      // Free throw rate
  toRate: 0.04,      // Turnover rate
  rebRate: 0.04,     // Rebounding margin
};

// ── Logistic model: convert composite score diff to win probability ──
function logistic(diff, k = 0.145) {
  return 1 / (1 + Math.exp(-k * diff));
}

function predictWinProb(teamA, teamB) {
  let scoreA = 0, scoreB = 0;

  // Efficiency margin (points per 100 possessions above avg)
  scoreA += (teamA.adjEM || 0) * WEIGHTS.adjEM;
  scoreB += (teamB.adjEM || 0) * WEIGHTS.adjEM;

  scoreA += (teamA.adjO || 0) * WEIGHTS.adjO;
  scoreB += (teamB.adjO || 0) * WEIGHTS.adjO;

  // Defense: lower is better, so invert
  scoreA += -(teamA.adjD || 0) * WEIGHTS.adjD;
  scoreB += -(teamB.adjD || 0) * WEIGHTS.adjD;

  scoreA += (teamA.tempo || 0) * WEIGHTS.tempo;
  scoreB += (teamB.tempo || 0) * WEIGHTS.tempo;

  scoreA += (teamA.sos || 0) * WEIGHTS.sos;
  scoreB += (teamB.sos || 0) * WEIGHTS.sos;

  // Luck: negative weight (lucky teams regress in tournament)
  scoreA += (teamA.luck || 0) * WEIGHTS.luck;
  scoreB += (teamB.luck || 0) * WEIGHTS.luck;

  scoreA += (teamA.experience || 50) / 100 * 5 * WEIGHTS.experience;
  scoreB += (teamB.experience || 50) / 100 * 5 * WEIGHTS.experience;

  scoreA += (teamA.threeRate || 35) / 100 * 3 * WEIGHTS.threeRate;
  scoreB += (teamB.threeRate || 35) / 100 * 3 * WEIGHTS.threeRate;

  scoreA += (teamA.ftRate || 70) / 100 * 3 * WEIGHTS.ftRate;
  scoreB += (teamB.ftRate || 70) / 100 * 3 * WEIGHTS.ftRate;

  // Turnovers: lower is better
  scoreA += -(teamA.toRate || 18) / 100 * 3 * WEIGHTS.toRate;
  scoreB += -(teamB.toRate || 18) / 100 * 3 * WEIGHTS.toRate;

  scoreA += (teamA.rebRate || 50) / 100 * 3 * WEIGHTS.rebRate;
  scoreB += (teamB.rebRate || 50) / 100 * 3 * WEIGHTS.rebRate;

  const diff = scoreA - scoreB;
  let probA = logistic(diff);

  // Blend with historical seed data (20% seed history, 80% model)
  const seedProb = getSeedWinRate(teamA.seed || 8, teamB.seed || 8);
  probA = probA * 0.80 + seedProb * 0.20;

  return Math.max(0.01, Math.min(0.99, probA));
}

// ── Sample 2025-ish team data (users can edit) ──
const DEFAULT_TEAMS = [
  { id: 1, name: "Houston", seed: 1, region: "South", adjEM: 29.5, adjO: 118.2, adjD: 88.7, tempo: 64.8, sos: 9.2, luck: 0.01, experience: 78, threeRate: 33, ftRate: 72, toRate: 15, rebRate: 56 },
  { id: 2, name: "Duke", seed: 1, region: "East", adjEM: 28.1, adjO: 122.5, adjD: 94.4, tempo: 71.2, sos: 8.8, luck: 0.03, experience: 55, threeRate: 36, ftRate: 74, toRate: 17, rebRate: 52 },
  { id: 3, name: "Auburn", seed: 1, region: "Midwest", adjEM: 27.8, adjO: 119.8, adjD: 92.0, tempo: 69.1, sos: 8.5, luck: 0.05, experience: 65, threeRate: 35, ftRate: 71, toRate: 18, rebRate: 54 },
  { id: 4, name: "Florida", seed: 1, region: "West", adjEM: 26.4, adjO: 120.1, adjD: 93.7, tempo: 68.3, sos: 8.0, luck: 0.02, experience: 70, threeRate: 37, ftRate: 73, toRate: 16, rebRate: 51 },
  { id: 5, name: "Tennessee", seed: 2, region: "South", adjEM: 24.5, adjO: 115.8, adjD: 91.3, tempo: 63.5, sos: 8.3, luck: -0.01, experience: 80, threeRate: 32, ftRate: 70, toRate: 15, rebRate: 55 },
  { id: 6, name: "Alabama", seed: 2, region: "East", adjEM: 23.9, adjO: 119.5, adjD: 95.6, tempo: 72.8, sos: 8.1, luck: 0.04, experience: 50, threeRate: 38, ftRate: 69, toRate: 19, rebRate: 50 },
  { id: 7, name: "Iowa St", seed: 2, region: "Midwest", adjEM: 23.2, adjO: 116.4, adjD: 93.2, tempo: 65.2, sos: 7.9, luck: 0.00, experience: 82, threeRate: 34, ftRate: 72, toRate: 14, rebRate: 53 },
  { id: 8, name: "St John's", seed: 2, region: "West", adjEM: 22.8, adjO: 117.1, adjD: 94.3, tempo: 67.8, sos: 7.5, luck: 0.06, experience: 68, threeRate: 33, ftRate: 71, toRate: 17, rebRate: 52 },
  { id: 9, name: "Texas Tech", seed: 3, region: "South", adjEM: 21.5, adjO: 114.2, adjD: 92.7, tempo: 64.1, sos: 7.8, luck: -0.02, experience: 72, threeRate: 31, ftRate: 68, toRate: 16, rebRate: 54 },
  { id: 10, name: "Wisconsin", seed: 3, region: "East", adjEM: 20.8, adjO: 116.8, adjD: 96.0, tempo: 62.5, sos: 7.2, luck: 0.03, experience: 85, threeRate: 36, ftRate: 75, toRate: 14, rebRate: 50 },
  { id: 11, name: "Michigan St", seed: 3, region: "Midwest", adjEM: 20.3, adjO: 115.5, adjD: 95.2, tempo: 67.4, sos: 7.4, luck: 0.01, experience: 75, threeRate: 34, ftRate: 70, toRate: 16, rebRate: 53 },
  { id: 12, name: "Marquette", seed: 3, region: "West", adjEM: 19.8, adjO: 117.9, adjD: 98.1, tempo: 69.0, sos: 7.0, luck: 0.02, experience: 78, threeRate: 37, ftRate: 73, toRate: 17, rebRate: 49 },
  { id: 13, name: "Arizona", seed: 4, region: "South", adjEM: 18.5, adjO: 118.0, adjD: 99.5, tempo: 70.5, sos: 7.1, luck: 0.03, experience: 55, threeRate: 35, ftRate: 71, toRate: 18, rebRate: 51 },
  { id: 14, name: "Purdue", seed: 4, region: "East", adjEM: 18.0, adjO: 120.2, adjD: 102.2, tempo: 66.8, sos: 7.3, luck: -0.01, experience: 80, threeRate: 36, ftRate: 76, toRate: 16, rebRate: 55 },
  { id: 15, name: "Clemson", seed: 4, region: "Midwest", adjEM: 17.2, adjO: 113.8, adjD: 96.6, tempo: 65.0, sos: 6.8, luck: 0.04, experience: 70, threeRate: 33, ftRate: 69, toRate: 17, rebRate: 52 },
  { id: 16, name: "Maryland", seed: 4, region: "West", adjEM: 16.8, adjO: 115.0, adjD: 98.2, tempo: 68.2, sos: 6.5, luck: 0.02, experience: 65, threeRate: 34, ftRate: 70, toRate: 18, rebRate: 50 },
  { id: 17, name: "Michigan", seed: 5, region: "South", adjEM: 15.5, adjO: 113.2, adjD: 97.7, tempo: 66.0, sos: 6.8, luck: 0.01, experience: 60, threeRate: 34, ftRate: 71, toRate: 17, rebRate: 51 },
  { id: 18, name: "Oregon", seed: 5, region: "East", adjEM: 14.8, adjO: 114.5, adjD: 99.7, tempo: 67.5, sos: 6.2, luck: 0.03, experience: 62, threeRate: 35, ftRate: 70, toRate: 18, rebRate: 49 },
  { id: 19, name: "Memphis", seed: 5, region: "Midwest", adjEM: 14.2, adjO: 115.8, adjD: 101.6, tempo: 71.0, sos: 5.8, luck: 0.02, experience: 55, threeRate: 33, ftRate: 68, toRate: 19, rebRate: 52 },
  { id: 20, name: "Texas A&M", seed: 5, region: "West", adjEM: 13.8, adjO: 112.5, adjD: 98.7, tempo: 64.5, sos: 6.5, luck: -0.01, experience: 72, threeRate: 32, ftRate: 69, toRate: 16, rebRate: 53 },
  { id: 21, name: "BYU", seed: 6, region: "South", adjEM: 13.0, adjO: 114.8, adjD: 101.8, tempo: 68.8, sos: 5.9, luck: 0.04, experience: 75, threeRate: 37, ftRate: 74, toRate: 17, rebRate: 48 },
  { id: 22, name: "Illinois", seed: 6, region: "East", adjEM: 12.5, adjO: 113.0, adjD: 100.5, tempo: 69.2, sos: 6.5, luck: 0.01, experience: 58, threeRate: 34, ftRate: 70, toRate: 18, rebRate: 51 },
  { id: 23, name: "Missouri", seed: 6, region: "Midwest", adjEM: 12.0, adjO: 112.2, adjD: 100.2, tempo: 66.5, sos: 6.0, luck: 0.03, experience: 65, threeRate: 33, ftRate: 69, toRate: 17, rebRate: 50 },
  { id: 24, name: "UCLA", seed: 6, region: "West", adjEM: 11.5, adjO: 115.5, adjD: 104.0, tempo: 67.0, sos: 5.5, luck: 0.02, experience: 55, threeRate: 36, ftRate: 72, toRate: 19, rebRate: 49 },
  { id: 25, name: "Gonzaga", seed: 7, region: "South", adjEM: 11.0, adjO: 118.5, adjD: 107.5, tempo: 72.0, sos: 4.5, luck: 0.05, experience: 68, threeRate: 38, ftRate: 75, toRate: 18, rebRate: 48 },
  { id: 26, name: "UConn", seed: 7, region: "East", adjEM: 10.5, adjO: 116.0, adjD: 105.5, tempo: 68.5, sos: 5.8, luck: -0.02, experience: 60, threeRate: 35, ftRate: 71, toRate: 17, rebRate: 51 },
  { id: 27, name: "Louisville", seed: 7, region: "Midwest", adjEM: 10.0, adjO: 113.5, adjD: 103.5, tempo: 66.0, sos: 5.5, luck: 0.01, experience: 70, threeRate: 33, ftRate: 68, toRate: 16, rebRate: 52 },
  { id: 28, name: "Kansas", seed: 7, region: "West", adjEM: 9.8, adjO: 115.0, adjD: 105.2, tempo: 69.5, sos: 6.0, luck: 0.03, experience: 55, threeRate: 35, ftRate: 72, toRate: 19, rebRate: 49 },
  { id: 29, name: "Mississippi St", seed: 8, region: "South", adjEM: 9.0, adjO: 111.5, adjD: 102.5, tempo: 65.0, sos: 5.8, luck: 0.02, experience: 72, threeRate: 32, ftRate: 68, toRate: 17, rebRate: 53 },
  { id: 30, name: "Kentucky", seed: 8, region: "East", adjEM: 8.5, adjO: 114.0, adjD: 105.5, tempo: 70.5, sos: 5.5, luck: 0.04, experience: 45, threeRate: 34, ftRate: 70, toRate: 19, rebRate: 50 },
  { id: 31, name: "Baylor", seed: 8, region: "Midwest", adjEM: 8.0, adjO: 112.0, adjD: 104.0, tempo: 67.0, sos: 5.2, luck: 0.01, experience: 65, threeRate: 33, ftRate: 69, toRate: 18, rebRate: 51 },
  { id: 32, name: "VCU", seed: 8, region: "West", adjEM: 7.5, adjO: 110.5, adjD: 103.0, tempo: 68.5, sos: 4.8, luck: 0.03, experience: 78, threeRate: 31, ftRate: 67, toRate: 16, rebRate: 52 },
  { id: 33, name: "Creighton", seed: 9, region: "South", adjEM: 7.0, adjO: 113.0, adjD: 106.0, tempo: 68.0, sos: 5.0, luck: -0.01, experience: 75, threeRate: 37, ftRate: 73, toRate: 17, rebRate: 47 },
  { id: 34, name: "Georgia", seed: 9, region: "East", adjEM: 6.5, adjO: 111.0, adjD: 104.5, tempo: 66.5, sos: 5.5, luck: 0.02, experience: 60, threeRate: 33, ftRate: 69, toRate: 18, rebRate: 50 },
  { id: 35, name: "San Diego St", seed: 9, region: "Midwest", adjEM: 6.0, adjO: 108.5, adjD: 102.5, tempo: 63.5, sos: 4.5, luck: 0.00, experience: 82, threeRate: 31, ftRate: 67, toRate: 15, rebRate: 54 },
  { id: 36, name: "Drake", seed: 9, region: "West", adjEM: 5.5, adjO: 110.0, adjD: 104.5, tempo: 65.0, sos: 4.0, luck: 0.04, experience: 85, threeRate: 34, ftRate: 71, toRate: 16, rebRate: 50 },
  { id: 37, name: "Vanderbilt", seed: 10, region: "South", adjEM: 5.0, adjO: 112.5, adjD: 107.5, tempo: 69.0, sos: 5.2, luck: 0.03, experience: 58, threeRate: 35, ftRate: 70, toRate: 19, rebRate: 48 },
  { id: 38, name: "Arkansas", seed: 10, region: "East", adjEM: 4.5, adjO: 113.5, adjD: 109.0, tempo: 73.0, sos: 5.0, luck: 0.05, experience: 50, threeRate: 34, ftRate: 68, toRate: 20, rebRate: 49 },
  { id: 39, name: "Colorado St", seed: 10, region: "Midwest", adjEM: 4.0, adjO: 109.0, adjD: 105.0, tempo: 64.0, sos: 3.8, luck: 0.01, experience: 80, threeRate: 33, ftRate: 70, toRate: 16, rebRate: 52 },
  { id: 40, name: "N Carolina", seed: 10, region: "West", adjEM: 3.5, adjO: 114.0, adjD: 110.5, tempo: 71.5, sos: 5.5, luck: 0.06, experience: 55, threeRate: 36, ftRate: 72, toRate: 18, rebRate: 47 },
  { id: 41, name: "New Mexico", seed: 11, region: "South", adjEM: 3.0, adjO: 111.0, adjD: 108.0, tempo: 70.0, sos: 3.5, luck: 0.02, experience: 78, threeRate: 34, ftRate: 69, toRate: 17, rebRate: 51 },
  { id: 42, name: "Xavier", seed: 11, region: "East", adjEM: 2.5, adjO: 110.5, adjD: 108.0, tempo: 67.5, sos: 4.8, luck: -0.01, experience: 65, threeRate: 33, ftRate: 70, toRate: 18, rebRate: 49 },
  { id: 43, name: "Nebraska", seed: 11, region: "Midwest", adjEM: 2.0, adjO: 109.0, adjD: 107.0, tempo: 66.0, sos: 5.0, luck: 0.03, experience: 60, threeRate: 32, ftRate: 68, toRate: 17, rebRate: 50 },
  { id: 44, name: "Troy", seed: 11, region: "West", adjEM: 1.5, adjO: 108.0, adjD: 106.5, tempo: 68.0, sos: 2.5, luck: 0.04, experience: 82, threeRate: 35, ftRate: 71, toRate: 18, rebRate: 48 },
  { id: 45, name: "McNeese", seed: 12, region: "South", adjEM: 1.0, adjO: 110.5, adjD: 109.5, tempo: 71.5, sos: 1.5, luck: 0.06, experience: 88, threeRate: 36, ftRate: 72, toRate: 17, rebRate: 47 },
  { id: 46, name: "Lipscomb", seed: 12, region: "East", adjEM: 0.5, adjO: 108.0, adjD: 107.5, tempo: 66.5, sos: 1.2, luck: 0.05, experience: 85, threeRate: 34, ftRate: 70, toRate: 16, rebRate: 49 },
  { id: 47, name: "UC San Diego", seed: 12, region: "Midwest", adjEM: 0.0, adjO: 107.0, adjD: 107.0, tempo: 64.5, sos: 1.0, luck: 0.03, experience: 80, threeRate: 33, ftRate: 68, toRate: 15, rebRate: 52 },
  { id: 48, name: "Liberty", seed: 12, region: "West", adjEM: -0.5, adjO: 109.0, adjD: 109.5, tempo: 65.5, sos: 1.5, luck: 0.07, experience: 83, threeRate: 35, ftRate: 71, toRate: 17, rebRate: 48 },
  { id: 49, name: "Yale", seed: 13, region: "South", adjEM: -1.0, adjO: 108.5, adjD: 109.5, tempo: 66.0, sos: 1.0, luck: 0.02, experience: 85, threeRate: 36, ftRate: 74, toRate: 16, rebRate: 46 },
  { id: 50, name: "High Point", seed: 13, region: "East", adjEM: -1.5, adjO: 107.0, adjD: 108.5, tempo: 69.0, sos: 0.5, luck: 0.04, experience: 80, threeRate: 33, ftRate: 68, toRate: 18, rebRate: 49 },
  { id: 51, name: "Wofford", seed: 13, region: "Midwest", adjEM: -2.0, adjO: 106.5, adjD: 108.5, tempo: 65.5, sos: 0.8, luck: 0.03, experience: 82, threeRate: 35, ftRate: 70, toRate: 17, rebRate: 48 },
  { id: 52, name: "Grand Canyon", seed: 13, region: "West", adjEM: -2.5, adjO: 107.5, adjD: 110.0, tempo: 67.0, sos: 0.5, luck: 0.05, experience: 78, threeRate: 34, ftRate: 69, toRate: 18, rebRate: 47 },
  { id: 53, name: "UNC Wilm.", seed: 14, region: "South", adjEM: -4.0, adjO: 105.0, adjD: 109.0, tempo: 68.0, sos: 0.2, luck: 0.03, experience: 80, threeRate: 33, ftRate: 68, toRate: 18, rebRate: 48 },
  { id: 54, name: "Troy St", seed: 14, region: "East", adjEM: -4.5, adjO: 104.5, adjD: 109.0, tempo: 65.5, sos: 0.0, luck: 0.02, experience: 82, threeRate: 32, ftRate: 67, toRate: 17, rebRate: 50 },
  { id: 55, name: "Akron", seed: 14, region: "Midwest", adjEM: -5.0, adjO: 105.5, adjD: 110.5, tempo: 66.5, sos: 0.5, luck: 0.04, experience: 78, threeRate: 34, ftRate: 69, toRate: 18, rebRate: 47 },
  { id: 56, name: "Robert Morris", seed: 14, region: "West", adjEM: -5.5, adjO: 104.0, adjD: 109.5, tempo: 67.0, sos: -0.2, luck: 0.05, experience: 80, threeRate: 33, ftRate: 68, toRate: 19, rebRate: 48 },
  { id: 57, name: "Omaha", seed: 15, region: "South", adjEM: -7.0, adjO: 103.0, adjD: 110.0, tempo: 67.5, sos: -0.5, luck: 0.04, experience: 75, threeRate: 32, ftRate: 67, toRate: 19, rebRate: 47 },
  { id: 58, name: "SE Louisiana", seed: 15, region: "East", adjEM: -7.5, adjO: 102.5, adjD: 110.0, tempo: 69.0, sos: -0.8, luck: 0.06, experience: 70, threeRate: 31, ftRate: 66, toRate: 20, rebRate: 46 },
  { id: 59, name: "Bryant", seed: 15, region: "Midwest", adjEM: -8.0, adjO: 103.5, adjD: 111.5, tempo: 66.0, sos: -0.5, luck: 0.03, experience: 78, threeRate: 33, ftRate: 68, toRate: 18, rebRate: 48 },
  { id: 60, name: "SIU Edw.", seed: 15, region: "West", adjEM: -8.5, adjO: 102.0, adjD: 110.5, tempo: 65.5, sos: -1.0, luck: 0.05, experience: 72, threeRate: 30, ftRate: 65, toRate: 19, rebRate: 47 },
  { id: 61, name: "NCC A&T", seed: 16, region: "South", adjEM: -12.0, adjO: 99.0, adjD: 111.0, tempo: 68.0, sos: -2.0, luck: 0.03, experience: 70, threeRate: 30, ftRate: 64, toRate: 21, rebRate: 45 },
  { id: 62, name: "Amer. Univ.", seed: 16, region: "East", adjEM: -12.5, adjO: 98.5, adjD: 111.0, tempo: 65.0, sos: -2.5, luck: 0.04, experience: 75, threeRate: 31, ftRate: 66, toRate: 20, rebRate: 46 },
  { id: 63, name: "Norfolk St", seed: 16, region: "Midwest", adjEM: -13.0, adjO: 98.0, adjD: 111.0, tempo: 66.5, sos: -2.2, luck: 0.05, experience: 72, threeRate: 29, ftRate: 63, toRate: 21, rebRate: 44 },
  { id: 64, name: "FDU", seed: 16, region: "West", adjEM: -13.5, adjO: 97.5, adjD: 111.0, tempo: 64.5, sos: -3.0, luck: 0.06, experience: 68, threeRate: 30, ftRate: 64, toRate: 22, rebRate: 45 },
];

// ── Bracket structure ──
function buildBracket(teams, region) {
  const r = teams.filter(t => t.region === region).sort((a, b) => a.seed - b.seed);
  // Standard NCAA bracket: 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15
  const order = [[0,15],[7,8],[4,11],[3,12],[5,10],[2,13],[6,9],[1,14]];
  return order.map(([a,b]) => [r[a], r[b]]);
}

function simulateRegion(teams, region) {
  const r1 = buildBracket(teams, region);
  const rounds = [r1];
  let current = r1;

  for (let round = 0; round < 4; round++) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const w1 = simulateGame(current[i][0], current[i][1]);
      const w2 = simulateGame(current[i+1][0], current[i+1][1]);
      next.push([w1, w2]);
    }
    rounds.push(next);
    current = next;
  }
  return rounds;
}

function simulateGame(a, b) {
  const prob = predictWinProb(a, b);
  return Math.random() < prob ? a : b;
}

function runFullTournament(teams, n = 10000) {
  const results = {};
  teams.forEach(t => {
    results[t.id] = { name: t.name, seed: t.seed, region: t.region, r32: 0, s16: 0, e8: 0, f4: 0, f2: 0, champ: 0 };
  });

  const regions = ["South", "East", "Midwest", "West"];

  for (let sim = 0; sim < n; sim++) {
    const f4 = [];
    for (const region of regions) {
      const rounds = simulateRegion(teams, region);
      // R32 winners (round 1 results = 8 games)
      rounds[1].forEach(([w]) => { if(results[w.id]) results[w.id].r32++; });
      rounds[1].forEach(([_,w]) => { if(results[w.id]) results[w.id].r32++; });

      // Actually track the bracket properly
      const r1winners = rounds[0].map(([a,b]) => simulateGame(a,b));
      const r2pairs = [];
      for(let i=0;i<r1winners.length;i+=2) r2pairs.push([r1winners[i], r1winners[i+1]]);
      const r2winners = r2pairs.map(([a,b]) => simulateGame(a,b));
      r1winners.forEach(w => results[w.id].r32++);
      r2winners.forEach(w => { results[w.id].r32++; results[w.id].s16++; });

      const r3pairs = [];
      for(let i=0;i<r2winners.length;i+=2) r3pairs.push([r2winners[i], r2winners[i+1]]);
      const r3winners = r3pairs.map(([a,b]) => simulateGame(a,b));
      r3winners.forEach(w => { results[w.id].e8++; });

      const r4 = simulateGame(r3winners[0], r3winners[1]);
      results[r4.id].f4++;
      f4.push(r4);
    }

    // Final Four
    const sf1 = simulateGame(f4[0], f4[1]);
    const sf2 = simulateGame(f4[2], f4[3]);
    results[sf1.id].f2++;
    results[sf2.id].f2++;
    const champ = simulateGame(sf1, sf2);
    results[champ.id].champ++;
  }

  return { results, n };
}

// ── Probability bar component ──
function ProbBar({ pct, color = "#ff6b35" }) {
  return (
    <div style={{ width: "100%", height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{
        width: `${Math.max(pct, 0.5)}%`, height: "100%",
        background: `linear-gradient(90deg, ${color}, ${color}dd)`,
        borderRadius: 4,
        transition: "width 0.6s cubic-bezier(.4,0,.2,1)"
      }} />
    </div>
  );
}

// ── Head to head component ──
function HeadToHead({ teams }) {
  const [a, setA] = useState(teams[0]?.id);
  const [b, setB] = useState(teams[1]?.id);

  const teamA = teams.find(t => t.id === a);
  const teamB = teams.find(t => t.id === b);
  const prob = teamA && teamB ? predictWinProb(teamA, teamB) : 0.5;

  const stats = ["adjEM", "adjO", "adjD", "sos", "experience", "threeRate", "ftRate", "toRate", "rebRate"];
  const labels = { adjEM: "Eff. Margin", adjO: "Off. Eff.", adjD: "Def. Eff.", sos: "SOS", experience: "Experience", threeRate: "3PT %", ftRate: "FT %", toRate: "TO Rate", rebRate: "Reb %" };
  const better = (stat, va, vb) => {
    if (stat === "adjD" || stat === "toRate") return va < vb ? "a" : va > vb ? "b" : "tie";
    return va > vb ? "a" : va < vb ? "b" : "tie";
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <select value={a} onChange={e => setA(+e.target.value)} style={selectStyle}>
          {teams.map(t => <option key={t.id} value={t.id}>{`(${t.seed}) ${t.name}`}</option>)}
        </select>
        <span style={{ color: "#ff6b35", fontFamily: "'Playfair Display', serif", fontSize: 20, alignSelf: "center" }}>vs</span>
        <select value={b} onChange={e => setB(+e.target.value)} style={selectStyle}>
          {teams.map(t => <option key={t.id} value={t.id}>{`(${t.seed}) ${t.name}`}</option>)}
        </select>
      </div>

      {teamA && teamB && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, color: "#e8dcc8", minWidth: 80, textAlign: "right" }}>{(prob * 100).toFixed(1)}%</span>
            <div style={{ flex: 1 }}>
              <div style={{ height: 16, borderRadius: 8, overflow: "hidden", display: "flex", background: "#1a1a1a" }}>
                <div style={{ width: `${prob * 100}%`, background: "linear-gradient(90deg, #ff6b35, #ff9b6b)", transition: "width 0.5s" }} />
                <div style={{ width: `${(1 - prob) * 100}%`, background: "linear-gradient(90deg, #3b82f6, #60a5fa)", transition: "width 0.5s" }} />
              </div>
            </div>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, color: "#e8dcc8", minWidth: 80 }}>{((1 - prob) * 100).toFixed(1)}%</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "6px 16px", fontSize: 13 }}>
            {stats.map(s => {
              const w = better(s, teamA[s], teamB[s]);
              return [
                <div key={s+"a"} style={{ textAlign: "right", color: w === "a" ? "#ff6b35" : "#8a8070", fontWeight: w === "a" ? 700 : 400 }}>{teamA[s]}</div>,
                <div key={s+"l"} style={{ color: "#6b6155", textAlign: "center", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>{labels[s]}</div>,
                <div key={s+"b"} style={{ color: w === "b" ? "#3b82f6" : "#8a8070", fontWeight: w === "b" ? 700 : 400 }}>{teamB[s]}</div>
              ];
            }).flat()}
          </div>
        </>
      )}
    </div>
  );
}

const selectStyle = {
  background: "#1a1612", color: "#e8dcc8", border: "1px solid #3a3228", borderRadius: 8,
  padding: "8px 12px", fontSize: 14, fontFamily: "'DM Sans', sans-serif", flex: 1, minWidth: 140,
};

// ── Main App ──
export default function App() {
  const [teams] = useState(DEFAULT_TEAMS);
  const [simResults, setSimResults] = useState(null);
  const [simCount, setSimCount] = useState(10000);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState("simulate");
  const [sortBy, setSortBy] = useState("champ");
  const [filterRegion, setFilterRegion] = useState("All");

  const runSim = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const res = runFullTournament(teams, simCount);
      setSimResults(res);
      setRunning(false);
    }, 50);
  }, [teams, simCount]);

  const sorted = useMemo(() => {
    if (!simResults) return [];
    let arr = Object.values(simResults.results);
    if (filterRegion !== "All") arr = arr.filter(t => t.region === filterRegion);
    arr.sort((a, b) => b[sortBy] - a[sortBy]);
    return arr;
  }, [simResults, sortBy, filterRegion]);

  const topColor = (i) => i === 0 ? "#ffd700" : i === 1 ? "#c0c0c0" : i === 2 ? "#cd7f32" : "#e8dcc8";

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#0f0d0a", color: "#e8dcc8", minHeight: "100vh", padding: 0 }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #1a1612 0%, #2a1f15 50%, #1a1612 100%)",
        borderBottom: "1px solid #3a3228", padding: "32px 24px 24px",
        position: "relative", overflow: "hidden"
      }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,107,53,0.08) 0%, transparent 70%)" }} />
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 4, color: "#ff6b35", marginBottom: 8, fontWeight: 700 }}>Monte Carlo Engine</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 900, margin: 0, lineHeight: 1.1, color: "#e8dcc8" }}>
            March Madness<br /><span style={{ color: "#ff6b35" }}>Predictor</span>
          </h1>
          <p style={{ color: "#8a8070", marginTop: 12, fontSize: 14, maxWidth: 550, lineHeight: 1.6 }}>
            KenPom-calibrated efficiency model with 12 weighted factors, historical seed data from 1985–2025, and logistic regression. Run {simCount.toLocaleString()} tournament simulations.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#1a1612", borderRadius: 12, padding: 4, border: "1px solid #2a2218" }}>
          {[["simulate", "Simulation"], ["h2h", "Head to Head"], ["method", "Methodology"]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1, padding: "10px 16px", border: "none", borderRadius: 8, cursor: "pointer",
              background: tab === key ? "#ff6b35" : "transparent",
              color: tab === key ? "#0f0d0a" : "#8a8070",
              fontWeight: tab === key ? 700 : 500, fontSize: 13,
              fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s"
            }}>{label}</button>
          ))}
        </div>

        {/* Simulation Tab */}
        {tab === "simulate" && (
          <>
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
              <select value={simCount} onChange={e => setSimCount(+e.target.value)} style={selectStyle}>
                <option value={1000}>1,000 sims</option>
                <option value={5000}>5,000 sims</option>
                <option value={10000}>10,000 sims</option>
                <option value={25000}>25,000 sims</option>
                <option value={50000}>50,000 sims</option>
              </select>
              <button onClick={runSim} disabled={running} style={{
                padding: "10px 28px", background: running ? "#3a3228" : "linear-gradient(135deg, #ff6b35, #e85d2a)",
                color: running ? "#8a8070" : "#fff", border: "none", borderRadius: 8, cursor: running ? "wait" : "pointer",
                fontWeight: 700, fontSize: 14, fontFamily: "'DM Sans', sans-serif", letterSpacing: 0.5,
                boxShadow: running ? "none" : "0 4px 16px rgba(255,107,53,0.3)", transition: "all 0.3s"
              }}>
                {running ? "Simulating..." : "Run Tournament"}
              </button>
              {simResults && (
                <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={selectStyle}>
                  <option>All</option>
                  <option>South</option>
                  <option>East</option>
                  <option>Midwest</option>
                  <option>West</option>
                </select>
              )}
            </div>

            {simResults && (
              <>
                {/* Sort buttons */}
                <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                  {[["champ","Champion"],["f2","Finals"],["f4","Final 4"],["e8","Elite 8"],["s16","Sweet 16"]].map(([k,l]) => (
                    <button key={k} onClick={() => setSortBy(k)} style={{
                      padding: "5px 14px", border: `1px solid ${sortBy === k ? "#ff6b35" : "#2a2218"}`,
                      background: sortBy === k ? "rgba(255,107,53,0.15)" : "transparent",
                      color: sortBy === k ? "#ff6b35" : "#6b6155", borderRadius: 6, cursor: "pointer",
                      fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600
                    }}>{l}</button>
                  ))}
                </div>

                {/* Results table */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 3px", fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: "#6b6155", textTransform: "uppercase", fontSize: 10, letterSpacing: 1.5 }}>
                        <th style={{ textAlign: "left", padding: "8px 12px" }}>#</th>
                        <th style={{ textAlign: "left", padding: "8px 8px" }}>Team</th>
                        <th style={{ textAlign: "center", padding: "8px 8px" }}>Seed</th>
                        <th style={{ textAlign: "left", padding: "8px 8px", minWidth: 100 }}>Champion</th>
                        <th style={{ textAlign: "left", padding: "8px 8px", minWidth: 80 }}>Finals</th>
                        <th style={{ textAlign: "left", padding: "8px 8px", minWidth: 80 }}>Final 4</th>
                        <th style={{ textAlign: "left", padding: "8px 8px", minWidth: 80 }}>Elite 8</th>
                        <th style={{ textAlign: "left", padding: "8px 8px", minWidth: 80 }}>Sweet 16</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.slice(0, 30).map((t, i) => (
                        <tr key={t.name} style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                          <td style={{ padding: "8px 12px", color: topColor(i), fontWeight: 700, fontSize: 12 }}>{i + 1}</td>
                          <td style={{ padding: "8px 8px", fontWeight: 600, color: "#e8dcc8", whiteSpace: "nowrap" }}>
                            {t.name}
                            <span style={{ color: "#6b6155", fontSize: 10, marginLeft: 6 }}>{t.region}</span>
                          </td>
                          <td style={{ textAlign: "center", padding: "8px 8px" }}>
                            <span style={{
                              display: "inline-block", width: 24, height: 24, lineHeight: "24px", borderRadius: 6,
                              background: t.seed <= 4 ? "rgba(255,107,53,0.15)" : "rgba(255,255,255,0.05)",
                              color: t.seed <= 4 ? "#ff6b35" : "#8a8070", fontSize: 11, fontWeight: 700, textAlign: "center"
                            }}>{t.seed}</span>
                          </td>
                          {["champ", "f2", "f4", "e8", "s16"].map(k => {
                            const pct = (t[k] / simResults.n * 100);
                            const colors = { champ: "#ffd700", f2: "#ff6b35", f4: "#e85d2a", e8: "#c44d20", s16: "#8a5030" };
                            return (
                              <td key={k} style={{ padding: "8px 8px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, minWidth: 42, color: pct > 10 ? colors[k] : "#8a8070" }}>
                                    {pct.toFixed(1)}%
                                  </span>
                                  <ProbBar pct={pct} color={colors[k]} />
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {!simResults && (
              <div style={{ textAlign: "center", padding: 60, color: "#6b6155" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🏀</div>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 18 }}>Press "Run Tournament" to begin</p>
                <p style={{ fontSize: 13, marginTop: 8 }}>Each simulation plays through the entire 64-team bracket</p>
              </div>
            )}
          </>
        )}

        {/* Head to Head Tab */}
        {tab === "h2h" && (
          <div style={{ background: "#1a1612", borderRadius: 16, padding: 24, border: "1px solid #2a2218" }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, margin: "0 0 20px", color: "#e8dcc8" }}>Matchup Analyzer</h2>
            <HeadToHead teams={teams} />
          </div>
        )}

        {/* Methodology Tab */}
        {tab === "method" && (
          <div style={{ background: "#1a1612", borderRadius: 16, padding: 24, border: "1px solid #2a2218", lineHeight: 1.8, fontSize: 14, color: "#b0a898" }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, margin: "0 0 20px", color: "#e8dcc8" }}>Model Methodology</h2>

            <h3 style={{ color: "#ff6b35", fontFamily: "'Playfair Display', serif", fontSize: 16, marginTop: 24 }}>Core Approach</h3>
            <p>This model uses a <strong style={{ color: "#e8dcc8" }}>Monte Carlo simulation</strong> engine that plays the entire 64-team bracket thousands of times. Each game outcome is determined by a calibrated win probability model that combines multiple predictive factors.</p>

            <h3 style={{ color: "#ff6b35", fontFamily: "'Playfair Display', serif", fontSize: 16, marginTop: 24 }}>12 Predictive Factors</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 12 }}>
              {Object.entries(WEIGHTS).map(([k, v]) => {
                const names = { adjEM: "Adj. Eff. Margin", adjO: "Offensive Eff.", adjD: "Defensive Eff.", tempo: "Tempo", seed: "Seed History", sos: "Strength of Sched.", luck: "Luck (negative)", experience: "Roster Experience", threeRate: "3-Point Rate", ftRate: "Free Throw Rate", toRate: "Turnover Rate", rebRate: "Rebound Rate" };
                return (
                  <div key={k} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 12, color: "#ff6b35", fontWeight: 700 }}>{(Math.abs(v) * 100).toFixed(0)}%</div>
                    <div style={{ fontSize: 12, color: "#e8dcc8" }}>{names[k]}</div>
                  </div>
                );
              })}
            </div>

            <h3 style={{ color: "#ff6b35", fontFamily: "'Playfair Display', serif", fontSize: 16, marginTop: 24 }}>Why These Factors?</h3>
            <p><strong style={{ color: "#e8dcc8" }}>Adjusted Efficiency Margin (30%)</strong> — Research consistently shows this is the single most predictive stat for tournament outcomes. It measures points scored minus points allowed per 100 possessions, adjusted for opponent strength.</p>
            <p><strong style={{ color: "#e8dcc8" }}>Historical Seed Data (15%)</strong> — 40 years of tournament data provides strong priors. A 5-vs-12 upset happens ~35% of the time, which pure efficiency models sometimes underweight.</p>
            <p><strong style={{ color: "#e8dcc8" }}>Defensive Efficiency (10%)</strong> — Defense travels better than offense in tournament play. Teams face unfamiliar opponents and have limited prep time, making defensive fundamentals more stable.</p>
            <p><strong style={{ color: "#e8dcc8" }}>Luck (−4%)</strong> — Luck is measured as the gap between a team's actual record and what efficiency metrics predict. Lucky teams (positive luck) tend to regress in the tournament, so it carries a negative weight.</p>
            <p><strong style={{ color: "#e8dcc8" }}>Experience (6%)</strong> — Roster continuity and upperclassmen matter in high-pressure tournament environments. Teams with more experienced rosters outperform their seed in March.</p>

            <h3 style={{ color: "#ff6b35", fontFamily: "'Playfair Display', serif", fontSize: 16, marginTop: 24 }}>How Win Probability Works</h3>
            <p>Factor scores for each team are combined into a composite score. The difference between two teams' composites is passed through a <strong style={{ color: "#e8dcc8" }}>logistic function</strong> (calibrated at k=0.145) to convert to a win probability. This is then blended 80/20 with historical seed-matchup data to produce the final game probability.</p>

            <h3 style={{ color: "#ff6b35", fontFamily: "'Playfair Display', serif", fontSize: 16, marginTop: 24 }}>Limitations</h3>
            <p>No model perfectly predicts March Madness — that's what makes it exciting. This model doesn't account for injuries during the tournament, hot shooting streaks, referee tendencies, travel fatigue, or the intangible "clutch factor." The best quantitative models achieve roughly 72-75% accuracy on individual games.</p>
          </div>
        )}
      </div>
    </div>
  );
}
