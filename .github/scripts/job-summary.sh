#!/usr/bin/env bash
# 失敗したステップの名前とログ末尾50行を $GITHUB_STEP_SUMMARY に書く。
# 入力: STEPS_JSON (toJSON(steps))、RUNNER_TEMP、GITHUB_STEP_SUMMARY
set -euo pipefail

summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
log_dir="${RUNNER_TEMP:-/tmp}/logs"

step_name() {
  case "$1" in
    auth) echo "Configure AWS credentials" ;;
    cdk_deploy) echo "Deploy CDK stacks" ;;
    outputs) echo "Read stack outputs" ;;
    web_build) echo "Build web app" ;;
    s3_sync) echo "Sync web app to S3" ;;
    invalidate) echo "Invalidate CloudFront cache" ;;
    *) echo "$1" ;;
  esac
}

steps_json="${STEPS_JSON:-}"
[ -n "$steps_json" ] || steps_json='{}'
failed_ids=$(printf '%s' "$steps_json" | jq -r 'to_entries[] | select(.value.outcome == "failure") | .key')

{
  echo "## Deploy failed"
  echo
  if [ -z "$failed_ids" ]; then
    echo "No failed step was found in the steps context."
  fi
} >> "$summary"

for id in $failed_ids; do
  name=$(step_name "$id")
  log="$log_dir/$id.log"
  {
    echo "### Failed step: $name (\`$id\`)"
    echo
    if [ -f "$log" ]; then
      echo "Last 50 lines of the log:"
      echo
      echo '```'
      tail -n 50 "$log"
      echo '```'
    else
      echo "ログなし"
    fi
    echo
  } >> "$summary"
done
