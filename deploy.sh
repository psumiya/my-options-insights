#!/bin/bash
# Deploy Option Insights to a shared site.
#
# The app is hosted as a subpath of an existing site rather than its own
# subdomain, to avoid a dedicated Route 53 hosted zone / CloudFront
# distribution / bucket.
#
# Usage:
#   S3_BUCKET=<bucket> S3_PREFIX=<prefix> CF_DISTRIBUTION_ID=<id> ./deploy.sh
#
# SITE_DOMAIN is optional and only decides whether the closing line can name the
# live URL. It is not derivable from the bucket, which may be named for
# something other than the domain routed to it, and nothing in the deploy
# depends on it, so a missing value prints a shorter message rather than
# failing a deploy that would otherwise have succeeded.

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
DOMAIN="${SITE_DOMAIN:-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Syncing to s3://${BUCKET}/${PREFIX}/ ..."
aws s3 sync "${ROOT_DIR}" "s3://${BUCKET}/${PREFIX}/" \
  --delete \
  --exclude '.*' \
  --exclude '.*/*' \
  --exclude 'tests/*' \
  --exclude 'docs/*' \
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

if [ -n "${DOMAIN}" ]; then
  echo "Done. Live at https://${DOMAIN}/${PREFIX}/index.html"
else
  echo "Done. Deployed to s3://${BUCKET}/${PREFIX}/ (set SITE_DOMAIN to print the live URL)"
fi
