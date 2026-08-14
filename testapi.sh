#!/bin/bash
# ============================================================
# 🧪 COMPLETE API TEST SUITE - Meson Marinero Reservation System
# ============================================================
# Run individual commands or execute the whole file:
#   chmod +x testapi.sh && ./testapi.sh
#
# Requirements: curl, python3
# ============================================================

BASE="http://localhost:4000"
TODAY=$(date +%Y-%m-%d)
TOMORROW=$(date -d "+1 day" +%Y-%m-%d 2>/dev/null || date -v+1d +%Y-%m-%d)
NEXT_WEEK=$(date -d "+7 days" +%Y-%m-%d 2>/dev/null || date -v+7d +%Y-%m-%d)
YEAR=$(date +%Y)
MONTH=$(date +%-m)

# ============================================================
# COLORS
# ============================================================
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

# ============================================================
# HELPER: req <METHOD> <URL> [JSON_BODY]
#   - Prints formatted response body
#   - Prints HTTP status code with color (green=2xx, yellow=4xx, red=5xx)
#   - Returns the raw body in REQ_BODY and status in REQ_STATUS
# ============================================================
req() {
  local method="$1"
  local url="$2"
  local data="$3"
  local full_response

  if [ -n "$data" ]; then
    full_response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$url")
  else
    full_response=$(curl -s -w "\n%{http_code}" -X "$method" "$url")
  fi

  # Last line = status code, everything above = body
  REQ_STATUS=$(printf '%s' "$full_response" | tail -1)
  REQ_BODY=$(printf '%s' "$full_response" | head -n -1)

  # Print formatted body
  printf '%s' "$REQ_BODY" | python3 -m json.tool 2>/dev/null || printf '%s\n' "$REQ_BODY"

  # Print status with color
  if [[ "$REQ_STATUS" =~ ^2 ]]; then
    printf "${GREEN}▸ HTTP %s ✓${RESET}\n" "$REQ_STATUS"
  elif [[ "$REQ_STATUS" =~ ^4 ]]; then
    printf "${YELLOW}▸ HTTP %s ✗${RESET}\n" "$REQ_STATUS"
  elif [[ "$REQ_STATUS" =~ ^5 ]]; then
    printf "${RED}▸ HTTP %s ✗${RESET}\n" "$REQ_STATUS"
  else
    printf "${CYAN}▸ HTTP %s${RESET}\n" "$REQ_STATUS"
  fi
}

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║     🧪 API TEST SUITE - RESERVATION SYSTEM   ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "📅 Today: $TODAY"
echo "📅 Tomorrow: $TOMORROW"
echo "🌐 Base URL: $BASE"
echo ""

# ============================================================
# 1. HEALTH CHECKS
# ============================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  HEALTH CHECKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "▶ Root endpoint"
req GET "$BASE/"

echo ""
echo "▶ Health check (with DB connection)"
req GET "$BASE/health"

# ============================================================
# 2. DEBUG ENDPOINTS (Development only)
# ============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  DEBUG ENDPOINTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "▶ Get all zones and tables"
req GET "$BASE/api/debug/zones"

echo ""
echo "▶ Get recent customers"
req GET "$BASE/api/debug/customers"

# ============================================================
# 3. AVAILABILITY - CALENDAR
# ============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  AVAILABILITY - CALENDAR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "▶ Get available days this month (2 guests)"
req GET "$BASE/api/public/reservations/availability/calendar?year=$YEAR&month=$MONTH&pax=2"

echo ""
echo "▶ Get available days this month (4 guests)"
req GET "$BASE/api/public/reservations/availability/calendar?year=$YEAR&month=$MONTH&pax=4"

echo ""
echo "▶ Get available days this month (8 guests - large group)"
req GET "$BASE/api/public/reservations/availability/calendar?year=$YEAR&month=$MONTH&pax=8"

echo ""
echo "▶ ❌ ERROR CASE: Invalid pax (1 person - below minimum)"
req GET "$BASE/api/public/reservations/availability/calendar?year=$YEAR&month=$MONTH&pax=1"

echo ""
echo "▶ ❌ ERROR CASE: Invalid pax (13 people - above maximum)"
req GET "$BASE/api/public/reservations/availability/calendar?year=$YEAR&month=$MONTH&pax=13"

# ============================================================
# 4. AVAILABILITY - TIME SLOTS
# ============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  AVAILABILITY - TIME SLOTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "▶ Get time slots for tomorrow (2 guests)"
req POST "$BASE/api/public/reservations/availability/times" \
  "{\"date\": \"$TOMORROW\", \"pax\": 2}"

echo ""
echo "▶ Get time slots for next week (4 guests)"
req POST "$BASE/api/public/reservations/availability/times" \
  "{\"date\": \"$NEXT_WEEK\", \"pax\": 4}"

echo ""
echo "▶ ❌ ERROR CASE: Past date"
req POST "$BASE/api/public/reservations/availability/times" \
  '{"date": "2024-01-01", "pax": 2}'

# ============================================================
# 5. AVAILABILITY - CHECK SPECIFIC TIME
# ============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  AVAILABILITY - CHECK SPECIFIC TIME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "▶ Check lunch slot (13:00) - should be available"
req POST "$BASE/api/public/reservations/availability/check" \
  "{\"date\": \"$NEXT_WEEK\", \"time\": \"13:00\", \"pax\": 2}"

echo ""
echo "▶ Check dinner slot (21:00)"
req POST "$BASE/api/public/reservations/availability/check" \
  "{\"date\": \"$TOMORROW\", \"time\": \"21:00\", \"pax\": 2}"

echo ""
echo "▶ ❌ ERROR CASE: Too soon (within 2h minimum advance)"
SOON=$(date +%H:%M)
req POST "$BASE/api/public/reservations/availability/check" \
  "{\"date\": \"$TODAY\", \"time\": \"$SOON\", \"pax\": 2}"

# ============================================================
# 6. CREATE RESERVATION (HAPPY PATH)
# ============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6️⃣  CREATE RESERVATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "▶ Create reservation for 2 guests (lunch)"
req POST "$BASE/api/public/reservations" \
  "{\"date\": \"$NEXT_WEEK\", \"time\": \"13:00\", \"pax\": 2, \"customer\": {\"email\": \"test.user@example.com\", \"firstName\": \"Test\", \"lastName\": \"User\", \"phone\": \"+34600123456\"}, \"specialRequests\": \"Window seat please\"}"

CONFIRMATION_CODE=$(printf '%s' "$REQ_BODY" | python3 -c "import sys,json; data=json.load(sys.stdin); print(data.get('data',{}).get('booking',{}).get('confirmationCode',''))" 2>/dev/null)
echo ""
echo "📌 Confirmation Code: $CONFIRMATION_CODE"

echo ""
echo "▶ Create reservation for 4 guests (dinner) with allergens"
req POST "$BASE/api/public/reservations" \
  "{\"date\": \"$NEXT_WEEK\", \"time\": \"20:00\", \"pax\": 4, \"customer\": {\"email\": \"family@example.com\", \"firstName\": \"Maria\", \"lastName\": \"Garcia\", \"phone\": \"+34611222333\", \"allergens\": [\"Gluten\", \"Lactosa\"]}}"

CONFIRMATION_CODE_2=$(printf '%s' "$REQ_BODY" | python3 -c "import sys,json; data=json.load(sys.stdin); print(data.get('data',{}).get('booking',{}).get('confirmationCode',''))" 2>/dev/null)
echo ""
echo "📌 Confirmation Code 2: $CONFIRMATION_CODE_2"

echo ""
echo "▶ Returning customer (same email as seed: juan@example.com)"
req POST "$BASE/api/public/reservations" \
  "{\"date\": \"$NEXT_WEEK\", \"time\": \"13:30\", \"pax\": 2, \"customer\": {\"email\": \"juan@example.com\", \"firstName\": \"Juan\", \"lastName\": \"Pérez\", \"phone\": \"+34600111222\"}}"

# ============================================================
# 7. CREATE RESERVATION (ERROR CASES)
# ============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "7️⃣  CREATE RESERVATION - ERROR CASES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "▶ ❌ Blacklisted customer (from seed: bloqueado@example.com)"
req POST "$BASE/api/public/reservations" \
  "{\"date\": \"$NEXT_WEEK\", \"time\": \"14:00\", \"pax\": 2, \"customer\": {\"email\": \"bloqueado@example.com\", \"firstName\": \"Denis\", \"lastName\": \"El Travieso\", \"phone\": \"+34000000000\"}}"

echo ""
echo "▶ ❌ Missing required fields"
req POST "$BASE/api/public/reservations" \
  '{"date": "2026-03-01", "pax": 2}'

echo ""
echo "▶ ❌ Invalid email format"
req POST "$BASE/api/public/reservations" \
  "{\"date\": \"$NEXT_WEEK\", \"time\": \"14:00\", \"pax\": 2, \"customer\": {\"email\": \"not-an-email\", \"firstName\": \"Test\", \"lastName\": \"User\", \"phone\": \"+34600123456\"}}"

# ============================================================
# 8. GET RESERVATION BY CODE
# ============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "8️⃣  GET RESERVATION BY CONFIRMATION CODE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -n "$CONFIRMATION_CODE" ]; then
  echo ""
  echo "▶ Get reservation details by code"
  req GET "$BASE/api/public/reservations/$CONFIRMATION_CODE"
else
  echo "⚠️  No confirmation code available (reservation creation may have failed)"
fi

echo ""
echo "▶ ❌ Invalid confirmation code"
req GET "$BASE/api/public/reservations/invalidcode123"

# ============================================================
# 9. CANCEL RESERVATION
# ============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "9️⃣  CANCEL RESERVATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -n "$CONFIRMATION_CODE_2" ]; then
  echo ""
  echo "▶ Cancel reservation 2"
  req PATCH "$BASE/api/public/reservations/$CONFIRMATION_CODE_2/cancel"

  echo ""
  echo "▶ ❌ Cancel already cancelled reservation (should fail)"
  req PATCH "$BASE/api/public/reservations/$CONFIRMATION_CODE_2/cancel"
else
  echo "⚠️  No confirmation code available for cancellation test"
fi

# ============================================================
# 10. BACKOFFICE - LIST BOOKINGS
# ============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔟  BACKOFFICE - LIST BOOKINGS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "▶ Get all bookings"
req GET "$BASE/api/backoffice/bookings"

echo ""
echo "▶ Get bookings for tomorrow (should show seeded booking)"
req GET "$BASE/api/backoffice/bookings?date=$TOMORROW"

echo ""
echo "▶ Get only CONFIRMED bookings"
req GET "$BASE/api/backoffice/bookings?status=CONFIRMED"

echo ""
echo "▶ Get only CANCELLED bookings"
req GET "$BASE/api/backoffice/bookings?status=CANCELLED"

echo ""
echo "▶ Pagination: page 1, limit 2"
req GET "$BASE/api/backoffice/bookings?limit=2&page=1"

# ============================================================
# 11. BACKOFFICE - BOOKING DETAIL
# ============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣1️⃣  BACKOFFICE - BOOKING DETAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Get a booking ID first (silent call, no display)
BOOKING_RESP=$(curl -s "$BASE/api/backoffice/bookings?limit=1")
BOOKING_ID=$(printf '%s' "$BOOKING_RESP" | python3 -c "import sys,json; data=json.load(sys.stdin); bookings=data.get('data',{}).get('bookings',[]); print(bookings[0]['id'] if bookings else '')" 2>/dev/null)

if [ -n "$BOOKING_ID" ]; then
  echo ""
  echo "▶ Get booking detail (ID: $BOOKING_ID)"
  req GET "$BASE/api/backoffice/bookings/$BOOKING_ID"
else
  echo "⚠️  Could not get booking ID"
fi

echo ""
echo "▶ ❌ Invalid booking ID"
req GET "$BASE/api/backoffice/bookings/nonexistent-id"

# ============================================================
# 12. BACKOFFICE - STATUS UPDATE
# ============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣2️⃣  BACKOFFICE - STATUS UPDATE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -n "$BOOKING_ID" ]; then
  echo ""
  echo "▶ Change status to SEATED"
  req PATCH "$BASE/api/backoffice/bookings/$BOOKING_ID/status" \
    '{"status": "SEATED"}'

  echo ""
  echo "▶ Change status to COMPLETED"
  req PATCH "$BASE/api/backoffice/bookings/$BOOKING_ID/status" \
    '{"status": "COMPLETED"}'
fi

echo ""
echo "▶ ❌ Invalid status"
req PATCH "$BASE/api/backoffice/bookings/any-id/status" \
  '{"status": "INVALID_STATUS"}'

# ============================================================
# 13. BACKOFFICE - CREATE BOOKING (Walk-in / Phone)
# ============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣3️⃣  BACKOFFICE - CREATE BOOKING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "▶ Create walk-in booking"
req POST "$BASE/api/backoffice/bookings" \
  "{\"date\": \"$NEXT_WEEK\", \"time\": \"14:00\", \"pax\": 3, \"source\": \"WALK_IN\", \"assignedBy\": \"Staff María\", \"customer\": {\"email\": \"walkin@example.com\", \"firstName\": \"Carlos\", \"lastName\": \"López\", \"phone\": \"+34622333444\"}}"

echo ""
echo "▶ Create phone booking"
req POST "$BASE/api/backoffice/bookings" \
  "{\"date\": \"$NEXT_WEEK\", \"time\": \"21:00\", \"pax\": 6, \"source\": \"PHONE\", \"assignedBy\": \"Staff Pedro\", \"customer\": {\"email\": \"phone.booking@example.com\", \"firstName\": \"Ana\", \"lastName\": \"Martínez\", \"phone\": \"+34633444555\"}, \"specialRequests\": \"Birthday celebration, need a cake\"}"

# ============================================================
# 14. 404 HANDLER
# ============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣4️⃣  404 - NOT FOUND HANDLER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "▶ ❌ Unknown route"
req GET "$BASE/api/this/does/not/exist"

# ============================================================
# DONE
# ============================================================
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║           ✅ TEST SUITE COMPLETE              ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Legend:"
printf "  ${GREEN}▸ HTTP 2xx ✓${RESET}  → Success\n"
printf "  ${YELLOW}▸ HTTP 4xx ✗${RESET}  → Client error (expected for ❌ cases)\n"
printf "  ${RED}▸ HTTP 5xx ✗${RESET}  → Server error (investigate!)\n"
echo ""
echo "What to check:"
echo "  ✅ Health checks return {status: healthy}"
echo "  ✅ Calendar returns array of available dates"
echo "  ✅ Time slots return lunch (13:00-16:00) and dinner (20:00-23:00)"
echo "  ✅ Reservation creation returns confirmationCode"
echo "  ✅ Blacklisted customer gets 403 error"
echo "  ✅ Invalid inputs get 400 errors"
echo "  ✅ Backoffice bookings list returns paginated results"
echo "  ✅ Status updates work (SEATED, COMPLETED)"
echo ""