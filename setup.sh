#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Mix Analyzer — Project Setup for Claude Code
# Run this script in your desired parent directory
# It creates the project, installs deps, and scaffolds everything
# ═══════════════════════════════════════════════════════════

set -e

echo "🎚️  Setting up Mix Analyzer project..."

# Create project with Vite
npm create vite@latest mix-analyzer -- --template react
cd mix-analyzer

# Install deps
npm install

# Clean default Vite boilerplate
rm -f src/App.jsx src/App.css src/index.css

# Copy the main component
# (You should place mix-analyzer-p1.jsx next to this script before running)
if [ -f "../mix-analyzer-p1.jsx" ]; then
  cp ../mix-analyzer-p1.jsx src/App.jsx
  echo "✓ Copied mix-analyzer-p1.jsx → src/App.jsx"
else
  echo "⚠ Place mix-analyzer-p1.jsx next to this script, then copy manually:"
  echo "  cp mix-analyzer-p1.jsx mix-analyzer/src/App.jsx"
fi

# Fix main.jsx to remove CSS import
cat > src/main.jsx << 'EOF'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
EOF

# Minimal index.html
cat > index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mix Analyzer</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #0b0b16; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
EOF

# Create .gitignore
cat > .gitignore << 'EOF'
node_modules/
dist/
.DS_Store
*.log
EOF

# Init git
git init
git add -A
git commit -m "Initial setup: Mix Analyzer Phase 1"

echo ""
echo "✅ Project ready!"
echo ""
echo "Next steps:"
echo "  cd mix-analyzer"
echo "  npm run dev          # Start dev server"
echo "  claude               # Start Claude Code"
echo ""
echo "Claude Code will read CLAUDE.md and PROJECT.md automatically."
