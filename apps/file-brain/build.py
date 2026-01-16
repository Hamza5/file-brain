"""
Build script for Poetry to automatically build the frontend before packaging.
"""

import shutil
import subprocess
import sys
from pathlib import Path


def build():
    """Build the frontend before packaging."""
    # Get the directory containing this script (project root)
    project_root = Path(__file__).parent
    frontend_dir = project_root / "frontend"
    package_dir = project_root / "file_brain"

    if not frontend_dir.exists():
        print("❌ Frontend directory not found!")
        sys.exit(1)

    print("🔨 Building frontend...")
    print(f"   Frontend directory: {frontend_dir}")

    try:
        # Check if we are in the monorepo and dependencies are installed at root
        # Repo root is ../../ relative to this script
        repo_root = project_root.parent.parent
        root_node_modules = repo_root / "node_modules"

        if root_node_modules.exists():
            print("✅ Detected monorepo environment with installed dependencies.")
        # Check if local node_modules exists (fallback)
        elif not (frontend_dir / "node_modules").exists():
            print("📦 Installing frontend dependencies...")
            subprocess.run(
                ["npm", "install"],
                cwd=frontend_dir,
                check=True,
                stdout=sys.stdout,
                stderr=sys.stderr,
            )

        # Build the frontend
        print("⚙️  Running npm build...")
        subprocess.run(
            ["npm", "run", "build"],
            cwd=frontend_dir,
            check=True,
            stdout=sys.stdout,
            stderr=sys.stderr,
        )

        # Verify dist directory was created
        dist_dir = frontend_dir / "dist"
        if dist_dir.exists():
            print(f"✅ Frontend built successfully: {dist_dir}")

            # Copy frontend dist to package directory for inclusion in wheel
            package_frontend_dir = package_dir / "frontend" / "dist"
            if package_frontend_dir.exists():
                print(f"🗑️  Removing existing package frontend: {package_frontend_dir}")
                shutil.rmtree(package_frontend_dir)

            print(f"📦 Copying frontend to package: {package_frontend_dir}")
            shutil.copytree(dist_dir, package_frontend_dir)
            print("✅ Frontend copied to package successfully")

            # Run poetry build
            print("🚀 Running poetry build...")
            subprocess.run(
                ["poetry", "build"],
                cwd=project_root,
                check=True,
                stdout=sys.stdout,
                stderr=sys.stderr,
            )
            print("✅ Package built successfully")

        else:
            print("⚠️  Warning: dist directory not found after build")

    except subprocess.CalledProcessError as e:
        print(f"❌ Build failed: {e}")
        sys.exit(1)
    except FileNotFoundError:
        print("❌ npm or poetry not found. Please install Node.js, npm, and poetry.")
        sys.exit(1)


if __name__ == "__main__":
    build()
