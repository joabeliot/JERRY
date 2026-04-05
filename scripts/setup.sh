#!/bin/bash
# Jerry COO — Fresh Install Setup
# Run from the coo/ directory: bash scripts/setup.sh

set -e

JERRY_DIR="jerry"


# Colors
BOLD='\033[1m'
DIM='\033[2m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Typing effect — because Jerry has personality
type_text() {
  local text="$1"
  local delay="${2:-0.03}"
  for ((i=0; i<${#text}; i++)); do
    printf "%s" "${text:$i:1}"
    sleep "$delay"
  done
  echo ""
}

type_color() {
  local color="$1"
  local text="$2"
  local delay="${3:-0.03}"
  printf "${color}"
  for ((i=0; i<${#text}; i++)); do
    printf "%s" "${text:$i:1}"
    sleep "$delay"
  done
  printf "${NC}"
  echo ""
}

pause() {
  sleep "${1:-0.8}"
}

# ============================================================
# THE SHOW BEGINS
# ============================================================

clear
sleep 0.5

echo ""
echo -e "${DIM}Initializing...${NC}"
sleep 1.2
clear

# ASCII Art intro
echo ""
echo -e "${CYAN}"
cat << 'LOGO'
     ██████╗ ████████╗████████╗ ██████╗
    ██╔═══██╗╚══██╔══╝╚══██╔══╝██╔═══██╗
    ██║   ██║   ██║      ██║   ██║   ██║
    ██║   ██║   ██║      ██║   ██║   ██║
    ╚██████╔╝   ██║      ██║   ╚██████╔╝
     ╚═════╝    ╚═╝      ╚═╝    ╚═════╝
LOGO
echo -e "${NC}"
echo -e "${DIM}          Chief Operating Officer v1.0${NC}"
echo ""
sleep 1.5

type_color "$WHITE" "Oh. New phone, who dis?" 0.04
pause 1.2
type_color "$DIM" "..." 0.3
pause 0.8
type_text "Just kidding. I know exactly who you are." 0.03
pause 0.6
type_text "You're my new boss. And I'm about to make your life significantly better." 0.03
pause 1

echo ""
type_color "$CYAN" "I'm Jerry. Your AI Chief Operating Officer." 0.03
pause 0.5
type_text "I handle the grind so you can handle the vision." 0.03
pause 0.5
type_text "Briefings. Pipeline. Comms. Calendar. Team. All of it." 0.03
pause 0.8

echo ""
type_color "$YELLOW" "But first — I need to know who I'm working for." 0.03
pause 0.5
type_text "Let's get you set up. This takes about 2 minutes." 0.03
pause 0.3
type_text "(I'd do it faster but I don't have hands.)" 0.03
pause 1.2

# ============================================================
# DIRECTORY CHECK
# ============================================================

echo ""
echo -e "${DIM}────────────────────────────────────────────${NC}"
echo ""

if [ ! -f "package.json" ] || [ ! -d "jerry" ]; then
  type_color "$RED" "Hold up. You're not in the right directory." 0.03
  echo ""
  echo -e "  Run this from the ${BOLD}coo/${NC} directory:"
  echo -e "  ${CYAN}cd jerry-mate/coo && bash scripts/setup.sh${NC}"
  echo ""
  type_text "I'll wait. I'm very patient. (I'm not.)" 0.03
  echo ""
  exit 1
fi

type_color "$GREEN" "✓ Directory looks right. We're in business." 0.03
pause 0.5

# ============================================================
# ENV FILE
# ============================================================

echo ""
type_color "$WHITE" "STEP 1: Your secrets (API keys)" 0.04
echo ""

if [ -f ".env" ]; then
  echo -e "${YELLOW}  ⚠ .env already exists — I'll leave it alone.${NC}"
  type_text "  (Smart. You came prepared.)" 0.03
else
  cp .env.example .env
  echo -e "${GREEN}  ✓ Created .env from template${NC}"
  type_text "  You'll need to fill this in. I put instructions inside." 0.03
fi
pause 0.5

# ============================================================
# KNOWLEDGE BASE
# ============================================================

echo ""
type_color "$WHITE" "STEP 2: Teaching me about your company" 0.04
echo ""
type_text "  I need to know who you are, what you're building, and what winning looks like." 0.03
pause 0.3
type_text "  Setting up your knowledge base..." 0.03
echo ""

KB_FILES=("persona.md" "company.md" "team.md" "goals.md" "playbook.md" "content_strategy.md")
KB_DESCRIPTIONS=(
  "persona.md       — who I am and who you are"
  "company.md       — what we're building"
  "team.md          — who's on the squad"
  "goals.md         — what winning looks like"
  "playbook.md      — how I operate day-to-day"
  "content_strategy  — your content game plan (optional)"
)

created=0
skipped=0
for i in "${!KB_FILES[@]}"; do
  file="${KB_FILES[$i]}"
  desc="${KB_DESCRIPTIONS[$i]}"
  if [ -f "$JERRY_DIR/$file" ]; then
    echo -e "  ${YELLOW}⚠ $desc — already exists${NC}"
    skipped=$((skipped + 1))
  elif [ -f "$JERRY_DIR/$file.example" ]; then
    cp "$JERRY_DIR/$file.example" "$JERRY_DIR/$file"
    echo -e "  ${GREEN}✓ $desc${NC}"
    created=$((created + 1))
  fi
done

# heartbeat.json
if [ -f "$JERRY_DIR/heartbeat.json" ]; then
  echo -e "  ${YELLOW}⚠ heartbeat.json    — cron schedule already exists${NC}"
  skipped=$((skipped + 1))
else
  cp "$JERRY_DIR/heartbeat.json.example" "$JERRY_DIR/heartbeat.json"
  echo -e "  ${GREEN}✓ heartbeat.json    — your daily/weekly schedule${NC}"
  created=$((created + 1))
fi

echo ""
if [ "$created" -gt 0 ]; then
  type_text "  Created $created files. These are templates — fill them in with YOUR context." 0.03
  type_text "  The more you tell me, the more dangerous I become." 0.03
else
  type_text "  Everything's already in place. You've done this before." 0.03
fi
pause 0.5

# ============================================================
# DATA DIRECTORIES
# ============================================================

echo ""
type_color "$WHITE" "STEP 3: Building my brain" 0.04
echo ""

for dir in memory tasks history scheduled approvals; do
  mkdir -p "$JERRY_DIR/$dir"
done
mkdir -p logs

echo -e "  ${GREEN}✓ memory/     — where I remember everything${NC}"
echo -e "  ${GREEN}✓ tasks/      — where I track what needs doing${NC}"
echo -e "  ${GREEN}✓ history/    — conversation history${NC}"
echo -e "  ${GREEN}✓ scheduled/  — one-off scheduled tasks${NC}"
echo -e "  ${GREEN}✓ logs/       — receipts${NC}"

pause 0.3
type_text "  Empty brain for now. Don't worry — I learn fast." 0.03
pause 0.5

# ============================================================
# DEPENDENCIES
# ============================================================

echo ""
type_color "$WHITE" "STEP 4: Installing my tools" 0.04
echo ""

if command -v pnpm &> /dev/null; then
  type_text "  Installing Node dependencies..." 0.02
  pnpm install --silent 2>/dev/null || pnpm install
  echo -e "  ${GREEN}✓ Dependencies installed${NC}"
else
  echo -e "  ${RED}✗ pnpm not found${NC}"
  echo -e "    Install it: ${CYAN}npm install -g pnpm${NC}"
  echo -e "    Then run: ${CYAN}pnpm install${NC}"
fi
pause 0.5

# ============================================================
# CLI TOOL CHECK
# ============================================================

echo ""
type_color "$WHITE" "STEP 5: Checking my toolkit" 0.04
echo ""

tools_ok=0
tools_missing=0

check_tool() {
  local name="$1"
  local fix="$2"
  local required="$3"
  if command -v "$name" &> /dev/null; then
    echo -e "  ${GREEN}✓ $name${NC}"
    tools_ok=$((tools_ok + 1))
  else
    if [ "$required" = "required" ]; then
      echo -e "  ${RED}✗ $name (required)${NC} — $fix"
    else
      echo -e "  ${DIM}○ $name (optional)${NC} — $fix"
    fi
    tools_missing=$((tools_missing + 1))
  fi
}

check_tool "node"   "https://nodejs.org (v18+)" "required"
check_tool "claude" "npm i -g @anthropic-ai/claude-cli && claude auth login" "required"
check_tool "gh"     "https://cli.github.com" "optional"

# Platform detection
echo ""
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo -e "  ${GREEN}✓ Platform: macOS${NC} — full feature set available"
  check_tool "gws" "brew install gws (for Gmail, Calendar, Google Chat)" "optional"
  echo -e "  ${GREEN}✓ iMessage: available${NC}"
else
  echo -e "  ${CYAN}✓ Platform: Linux${NC} — running in server mode"
  echo -e "  ${DIM}○ iMessage: disabled (macOS only — no worries, skipped automatically)${NC}"
  echo -e "  ${DIM}○ gws: may need manual install on Linux${NC}"
fi

pause 0.5

# ============================================================
# THE GRAND FINALE
# ============================================================

echo ""
echo -e "${DIM}────────────────────────────────────────────${NC}"
echo ""

sleep 0.5
type_color "$GREEN" "Setup complete." 0.04
pause 0.8

echo ""
type_text "Alright. Real talk." 0.03
pause 0.4
type_text "Right now I'm an empty suit. Talented, but clueless about YOUR business." 0.03
pause 0.6
type_text "Here's what makes me actually useful:" 0.03
echo ""

echo -e "${WHITE}  YOUR ONBOARDING CHECKLIST:${NC}"
echo ""
echo -e "  ${BOLD}1.${NC} Fill in your API keys"
echo -e "     ${DIM}nano .env${NC}"
echo -e "     ${DIM}(Telegram bot token is the only hard requirement)${NC}"
echo ""
echo -e "  ${BOLD}2.${NC} Tell me about your company"
echo -e "     ${DIM}nano jerry/persona.md     ← this is the big one${NC}"
echo -e "     ${DIM}nano jerry/company.md${NC}"
echo -e "     ${DIM}nano jerry/team.md${NC}"
echo -e "     ${DIM}nano jerry/goals.md${NC}"
echo -e "     ${DIM}nano jerry/playbook.md${NC}"
echo ""
echo -e "  ${BOLD}3.${NC} Customize my schedule"
echo -e "     ${DIM}nano jerry/heartbeat.json${NC}"
echo -e "     ${DIM}(Morning briefing, comms checks, EOD summary — add what you want)${NC}"
echo ""
echo -e "  ${BOLD}4.${NC} Start me up"
echo -e "     ${CYAN}pnpm dev${NC}     ${DIM}# development (watch mode)${NC}"
echo -e "     ${CYAN}pnpm start${NC}   ${DIM}# production${NC}"
echo ""
echo -e "  ${BOLD}5.${NC} Run me on boot ${DIM}(optional)${NC}"
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo -e "     ${DIM}# macOS: copy LaunchAgent plist to ~/Library/LaunchAgents/${NC}"
else
  echo -e "     ${CYAN}sudo cp scripts/jerry-coo.service /etc/systemd/system/${NC}"
  echo -e "     ${CYAN}sudo systemctl enable jerry-coo && sudo systemctl start jerry-coo${NC}"
fi

echo ""
echo -e "${DIM}────────────────────────────────────────────${NC}"
echo ""

sleep 0.3

type_text "One more thing." 0.03
pause 0.6
type_text "The persona.md file? That's where you define who I am." 0.03
pause 0.3
type_text "My name. My personality. My relationship with you." 0.03
pause 0.3
type_text "Make it weird. Make it funny. Make it yours." 0.03
pause 0.5
type_text "The more context you give me, the less you have to think." 0.03
pause 0.3
type_text "And that's the whole point." 0.03
pause 1

echo ""
echo -e "${CYAN}"
cat << 'OUTRO'
    ┌─────────────────────────────────────────┐
    │                                         │
    │   Jerry is ready when you are.           │
    │                                         │
    │   Fill in the files. Start me up.       │
    │   Let's build something worth building. │
    │                                         │
    │   — Jerry, your new COO                  │
    │     (the one who doesn't need coffee)   │
    │                                         │
    └─────────────────────────────────────────┘
OUTRO
echo -e "${NC}"
