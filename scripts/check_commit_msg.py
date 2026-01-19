#!/usr/bin/env python3
import sys
import subprocess


def get_head_subject():
    try:
        # Get the subject of the HEAD commit
        result = subprocess.run(
            ["git", "log", "-1", "--format=%s"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        # No HEAD (first commit)
        return None


def get_all_subjects():
    try:
        # Get all subjects
        result = subprocess.run(
            ["git", "log", "--format=%s"], capture_output=True, text=True, check=True
        )
        return result.stdout.strip().split("\n")
    except subprocess.CalledProcessError:
        return []


def main():
    if len(sys.argv) < 2:
        return 0

    commit_msg_filepath = sys.argv[1]

    try:
        with open(commit_msg_filepath, "r") as f:
            content = f.read()
    except FileNotFoundError:
        return 0

    lines = [line for line in content.splitlines() if not line.strip().startswith("#")]
    if not lines:
        # Empty message or only comments
        return 0

    subject = lines[0].strip()
    if not subject:
        return 0

    # Get existing subjects
    existing_subjects = set(get_all_subjects())

    if subject not in existing_subjects:
        sys.exit(0)  # Not a duplicate

    # It is a duplicate.
    # Check if it matches HEAD
    head_subject = get_head_subject()

    if subject == head_subject:
        # It matches HEAD.
        # We assume this is an amend or a valid reuse of the last message.
        # This covers "unless we are in amend mode".
        sys.exit(0)

    # Subject exists and is NOT HEAD.
    print(
        f"Error: Commit message subject '{subject}' duplicates an older commit message."
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
