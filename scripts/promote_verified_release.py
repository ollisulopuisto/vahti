#!/usr/bin/env python3
"""Promote only the already verified Vahti 0.7.16 manual.96 bytes.

Default is read-only verification. --publish is reserved for the owner-dispatched
workflow using GITHUB_TOKEN, never a PAT (tag writes must not trigger packaging).
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

REPO = "ollisulopuisto/vahti"
SOURCE = "0c1a3edb76b71f15c906ca1e0e3f7cada12e52f1"
TAG = "v0.7.16"
RUN = 42518479976
DRAFT = 437430740
NAME = "Vahti-0.7.16-manual.96-macos-arm64.dmg"
SHA = "6a1586dc6647e2a7dfe57b0a94e7892fab64a276e36afdbe898eb99e4e3a1a4e"
ASSETS = {NAME: (725090527, 50967931), NAME + ".sha256": (725090526, 105)}


def gh(*args):
    return subprocess.check_output(["gh", *args])


def api(path):
    return json.loads(gh("api", f"repos/{REPO}/{path}"))


def validate_metadata(run, release):
    if run["head_sha"] != SOURCE or run["conclusion"] != "success":
        raise ValueError("Source build is not the verified successful run")
    if run["event"] != "workflow_dispatch" or run["path"] != ".github/workflows/build.yml":
        raise ValueError("Unexpected source workflow")
    if not release["draft"] or release["id"] != DRAFT:
        raise ValueError("Manual source draft changed")
    by_id = {a["id"]: a for a in release["assets"]}
    for name, (asset_id, size) in ASSETS.items():
        asset = by_id.get(asset_id, {})
        if asset.get("name") != name or asset.get("size") != size:
            raise ValueError("Verified source asset changed")


def validate_files(folder):
    if hashlib.sha256((folder / NAME).read_bytes()).hexdigest() != SHA:
        raise ValueError("DMG checksum mismatch")
    expected = f"{SHA}  {NAME}\n"
    if (folder / (NAME + ".sha256")).read_text() != expected:
        raise ValueError("Checksum file changed")


def require_publish_context():
    expected = {
        "GITHUB_ACTIONS": "true", "GITHUB_REPOSITORY": REPO,
        "GITHUB_EVENT_NAME": "workflow_dispatch", "GITHUB_REF": "refs/heads/main",
        "GITHUB_ACTOR": "ollisulopuisto", "GITHUB_TRIGGERING_ACTOR": "ollisulopuisto",
        "VAHTI_PROMOTION_TOKEN": "workflow-github-token",
    }
    if any(os.environ.get(k) != v for k, v in expected.items()):
        raise ValueError("Publish is only allowed in the owner-dispatched main workflow")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    if args.publish:
        require_publish_context()
    validate_metadata(api(f"actions/runs/{RUN}"), api(f"releases/{DRAFT}"))
    # A retry must never silently overwrite an existing release or retarget a tag.
    releases = json.loads(gh("api", "--paginate", "--slurp", f"repos/{REPO}/releases"))
    if any(r["tag_name"] == TAG for page in releases for r in page):
        raise ValueError("Target release already exists; inspect it before continuing")
    refs = json.loads(gh("api", f"repos/{REPO}/git/matching-refs/tags/{TAG}"))
    if any(r["ref"] == "refs/tags/" + TAG for r in refs):
        raise ValueError("Target tag already exists; inspect it before continuing")
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        for name, (asset_id, _) in ASSETS.items():
            (folder / name).write_bytes(gh("api", f"repos/{REPO}/releases/assets/{asset_id}",
                                          "-H", "Accept: application/octet-stream"))
        validate_files(folder)
        notes = Path(__file__).resolve().parents[1] / "docs/releases/0.7.16.md"
        if not args.publish:
            print(f"Verified {NAME}; {SHA}. Read-only: no tag or release created.")
            return
        # The workflow's repository GITHUB_TOKEN suppresses recursive tag/release
        # workflows. Never replace it with a PAT or GitHub App token.
        gh("release", "create", TAG, "--repo", REPO, "--target", SOURCE,
           "--draft", "--title", "Vahti 0.7.16 - An orb that stays visible",
           "--notes-file", str(notes), *[str(folder / name) for name in ASSETS])
        created = next(r for page in json.loads(gh("api", "--paginate", "--slurp",
                       f"repos/{REPO}/releases")) for r in page if r["tag_name"] == TAG)
        if (not created["draft"] or created["target_commitish"] != SOURCE or
                {a["name"] for a in created["assets"]} != set(ASSETS)):
            raise ValueError("Prepared release did not match; left unpublished")
        for asset in created["assets"]:
            data = gh("api", f"repos/{REPO}/releases/assets/{asset['id']}",
                      "-H", "Accept: application/octet-stream")
            if data != (folder / asset["name"]).read_bytes():
                raise ValueError("Uploaded bytes differ; left unpublished")
        gh("release", "edit", TAG, "--repo", REPO, "--draft=false", "--latest")
        final = api(f"releases/tags/{TAG}")
        ref = api(f"git/ref/tags/{TAG}")
        if final["draft"] or final["prerelease"] or ref["object"]["sha"] != SOURCE:
            raise ValueError("Publication needs inspection")
        print(final["html_url"])


if __name__ == "__main__":
    main()
