/**
 * Feedback tier chain — generates mixing feedback with automatic fallback.
 *
 * Tier 3 (cloud): POST to VITE_API_URL/feedback → natural language from Claude API
 * Tier 1 (offline): in-browser template engine (src/analysis/feedback.js)
 *
 * Fallback order: 3 → 1. If tier 3 fails or is unavailable, falls back to tier 1.
 *
 * Options: { tier: 1|3, apiKey?: string, apiUrl?: string }
 */

import { generateFeedback as tier1Feedback } from '../analysis/feedback.js';

const DEFAULT_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function tier3Feedback(analysisData, options) {
  const url = (options.apiUrl || DEFAULT_API_URL) + '/feedback';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.apiKey ? { 'Authorization': `Bearer ${options.apiKey}` } : {}),
    },
    body: JSON.stringify({ analysis: analysisData }),
  });
  if (!res.ok) throw new Error(`Tier 3 API error: ${res.status}`);
  return res.json();
}

/**
 * generateFeedback — unified entry point with tier fallback.
 *
 * @param {Object} analysisData - Complete analysis result from analyze()
 * @param {Object} prefs - User preferences (genre, targets, etc.)
 * @param {Object} [options] - { tier: 1|3, apiKey, apiUrl }
 * @returns {Promise<Array>} Feedback items array
 */
export async function generateFeedback(analysisData, prefs, options = {}) {
  const tier = options.tier || 1;

  if (tier >= 3) {
    try {
      return await tier3Feedback(analysisData, options);
    } catch {
      // Tier 3 unavailable — fall through to tier 1
    }
  }

  // Tier 1: offline template engine (synchronous, wrapped in Promise for uniform API)
  return tier1Feedback(analysisData, prefs);
}
