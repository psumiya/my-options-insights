#!/bin/bash
# Deploy Option Insights to the shared sumiya.page site.
#
# The app is hosted as a subpath of sumiya.page rather than its own subdomain,
# to avoid a dedicated Route 53 hosted zone / CloudFront distribution / bucket.
#
# Live URL: https://sumiya.page/${S3_PREFIX}/index.html
#
# Usage:
#   S3_BUCKET=<bucket> S3_PREFIX=<prefix> CF_DISTRIBUTION_ID=<id> ./deploy.sh

set -e
set -o pipefail

for var in S3_BUCKET S3_PREFIX CF_DISTRIBUTION_ID; do
  if [ -z "${!var+x}" ]; then
    echo "Error: Environment variable '${var}' is not set." >&2
    exit 1
  fi
done

BUCKET="${S3_BUCKET}"
PREFIX="${S3_PREFIX}"
DISTRIBUTION_ID="${CF_DISTRIBUTION_ID}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Syncing to s3://${BUCKET}/${PREFIX}/ ..."
aws s3 sync "${ROOT_DIR}" "s3://${BUCKET}/${PREFIX}/" \
  --delete \
  --exclude '.*' \
  --exclude '.*/*' \
  --exclude 'tests/*' \
  --exclude 'docs/*' \
  --exclude 'infrastructure/*' \
  --exclude '.git/*' \
  --exclude '.kiro/*' \
  --exclude '.vscode/*' \
  --exclude 'node_modules/*' \
  --exclude '*.DS_Store' \
  --exclude 'deploy.sh' \
  --exclude 'README.md' \
  --exclude 'LICENSE' \
  --exclude 'package.json' \
  --exclude 'package-lock.json' \
  --exclude '.gitignore'

echo "Invalidating CloudFront cache for /${PREFIX}/* ..."
aws cloudfront create-invalidation \
  --distribution-id "${DISTRIBUTION_ID}" \
  --paths "/${PREFIX}/*" \
  --query "Invalidation.{Id:Id,Status:Status}" \
  --output table

echo "Done. Live at https://sumiya.page/${PREFIX}/index.html"
