#!/bin/bash
# Grep for TODO/FIXME
# If found, exit 1
# If not found, exit 0

# pre-commit passes file args.
# grep returns 0 if match found, 1 if not found.

output=$(grep -HnE "TODO|FIXME" "$@")
exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo "$output"
    echo "Found TODO or FIXME."
    exit 1
else
    exit 0
fi
