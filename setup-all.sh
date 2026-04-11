#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Mix Analyzer — One-Shot Setup
# 
# Put all downloaded files in one folder, then run:
#   bash setup-all.sh
#
# This will:
#   1. Create a Vite + React project
#   2. Place all project files in the right locations
#   3. Install dependencies
#   4. Init git
#   5. Start the dev server
#
# Prerequisites: Node.js 18+ installed
# Claude Code: install separately with:
#   curl -fsSL https://claude.ai/install.sh | bash
# ═══════════════════════════════════════════════════════════

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "🎚️  Mix Analyzer — Full Project Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Node
if ! command -v node &> /dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  echo "❌ Node.js 18+ required. Install from https://nodejs.org"
  exit 1
fi
echo "✓ Node $(node -v) found"

# Create Vite project
echo ""
echo "→ Creating Vite + React project..."
cd "$SCRIPT_DIR"
npm create vite@latest mix-analyzer -- --template react 2>/dev/null
cd mix-analyzer
npm install

# Clean Vite boilerplate
rm -f src/App.jsx src/App.css src/index.css

# ── Place main app component ──
if [ -f "$SCRIPT_DIR/mix-analyzer-p1.jsx" ]; then
  cp "$SCRIPT_DIR/mix-analyzer-p1.jsx" src/App.jsx
  echo "✓ App component placed"
else
  echo "⚠ mix-analyzer-p1.jsx not found — copy it to src/App.jsx manually"
fi

# ── Place CLAUDE.md (Claude Code reads this automatically) ──
if [ -f "$SCRIPT_DIR/CLAUDE.md" ]; then
  cp "$SCRIPT_DIR/CLAUDE.md" ./CLAUDE.md
  echo "✓ CLAUDE.md placed (Claude Code project context)"
fi

# ── Place PROJECT.md ──
if [ -f "$SCRIPT_DIR/PROJECT.md" ]; then
  cp "$SCRIPT_DIR/PROJECT.md" ./PROJECT.md
  echo "✓ PROJECT.md placed (technical reference)"
fi

# ── Place tracker ──
if [ -f "$SCRIPT_DIR/mix-analyzer-tracker.xlsx" ]; then
  mkdir -p docs
  cp "$SCRIPT_DIR/mix-analyzer-tracker.xlsx" docs/tracker.xlsx
  echo "✓ Tracker placed in docs/"
fi

# ── Fix main.jsx ──
cat > src/main.jsx << 'MAINEOF'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
MAINEOF

# ── Clean index.html ──
cat > index.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mix Analyzer</title>
    <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { background: #0b0b16; }</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
HTMLEOF

# ── .gitignore ──
cat > .gitignore << 'GITEOF'
node_modules/
dist/
.DS_Store
*.log
GITEOF

# ── Init git ──
git init -q
git add -A
git commit -q -m "Mix Analyzer: Phase 1 setup"
echo "✓ Git initialized"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup complete!"
echo ""
echo "Project location: $SCRIPT_DIR/mix-analyzer"
echo ""
echo "To run the app:"
echo "  cd $SCRIPT_DIR/mix-analyzer"
echo "  npm run dev"
echo ""
echo "To start Claude Code:"
echo "  cd $SCRIPT_DIR/mix-analyzer"
echo "  claude"
echo ""
echo "Claude Code will automatically read CLAUDE.md"
echo "and have full context of the project."
echo ""
echo "First command to try in Claude Code:"
echo "  'Start Phase 2: build the 3-band filter bank"
echo "   and live spectrum analyzer on Canvas'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
