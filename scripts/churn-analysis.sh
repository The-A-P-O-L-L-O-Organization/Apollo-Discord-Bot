#!/usr/bin/env bash
set -euo pipefail

# Analyze git churn for the last 6 months
SINCE="6 months ago"
OUTPUT="docs/architecture/churn-report.md"

mkdir -p docs/architecture

echo "# Git Churn Analysis (last 6 months)" > "$OUTPUT"
echo "" >> "$OUTPUT"
echo "Generated: $(date)" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "## Top 20 Most Changed Files" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "| Rank | Changes | File |" >> "$OUTPUT"
echo "|------|---------|------|" >> "$OUTPUT"

git log --since="$SINCE" --pretty=format: --name-only \
  | grep -v '^$' \
  | sort \
  | uniq -c \
  | sort -rn \
  | head -20 \
  | awk '{print "| " NR " | " $1 " | " substr($0, index($0,$2)) " |"}' >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "## Files Changed >10 Times (Potential Hot Spots)" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "| Changes | File |" >> "$OUTPUT"
echo "|---------|------|" >> "$OUTPUT"

git log --since="$SINCE" --pretty=format: --name-only \
  | grep -v '^$' \
  | sort \
  | uniq -c \
  | awk '$1 > 10 {print "| " $1 " | " substr($0, index($0,$2)) " |"}' \
  | sort -rn >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "## Analysis Complete" >> "$OUTPUT"
echo "Review files with high churn for: technical debt, missing tests, coupling, or architectural issues." >> "$OUTPUT"

cat "$OUTPUT"