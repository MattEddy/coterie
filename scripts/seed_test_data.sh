#!/bin/bash

API_URL="http://127.0.0.1:54321/rest/v1"
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

# Insert companies
curl -s -X POST "$API_URL/objects" \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"type": "company", "name": "Disney", "data": {"company_type": "studio"}}'

curl -s -X POST "$API_URL/objects" \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"type": "company", "name": "Warner Bros", "data": {"company_type": "studio"}}'

curl -s -X POST "$API_URL/objects" \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"type": "company", "name": "Netflix", "data": {"company_type": "streamer"}}'

curl -s -X POST "$API_URL/objects" \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"type": "company", "name": "CAA", "data": {"company_type": "agency"}}'

curl -s -X POST "$API_URL/objects" \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"type": "person", "name": "Alan Bergman", "data": {"title": "Co-Chairman"}}'

curl -s -X POST "$API_URL/objects" \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"type": "person", "name": "Dana Walden", "data": {"title": "Co-Chairman"}}'

curl -s -X POST "$API_URL/objects" \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"type": "project", "name": "Avatar 3", "data": {"status": "production"}}'

echo ""
echo "Seed data inserted!"
echo ""
curl -s "$API_URL/objects?select=id,type,name" \
  -H "apikey: $API_KEY" | jq
