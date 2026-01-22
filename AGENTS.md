# Agents Guide

This document provides guidelines for AI agents working on this project.

## Core Principles

### High Code Quality

- Maintain the highest standards of code quality.
- Ensure code is readable, maintainable, and well-documented.
- Follow existing code styles and patterns found in the project.

### Design Principles

- **SOLID**: Adhere to SOLID principles:
  - **S**ingle Responsibility Principle
  - **O**pen/Closed Principle
  - **L**iskov Substitution Principle
  - **I**nterface Segregation Principle
  - **D**ependency Inversion Principle
- **DRY**: Don't Repeat Yourself. Refactor duplicated logic into reusable functions or components.

### Code Hygiene

- **Remove Unused Code**: Aggressively remove dead code, unused imports, and commented-out blocks.
- Keep the codebase clean and lean.

### Dependency Management

- **Update Lock File**: Whenever you modify `pyproject.toml` (e.g., adding/removing dependencies), you MUST run `poetry lock` to update the `poetry.lock` file. Failure to do so will break CI/CD workflows.
- **Use Poetry for Commands**: ALWAYS use `poetry run` prefix when running tests, scripts, or any Python commands in the backend. For example:
  - `poetry run pytest tests/` (NOT `pytest tests/`)
  - `poetry run python -m file_brain.main` (NOT `python -m file_brain.main`)
  - This ensures you're using the correct virtual environment with all dependencies installed.

### Testing

- **Run Full Test Suite**: Before submitting changes, run the full test suite:
  ```bash
  cd apps/file-brain
  poetry run pytest tests/ -v
  ```
- **Verify All Tests Pass**: Ensure all tests pass before considering your work complete. The project maintains 100% test pass rate.

## Technology Stack

When working on this project, strictly adhere to the following technologies and patterns. Do not introduce new libraries or frameworks without explicit permission.

### Frontend (`apps/website`, `apps/file-brain/frontend`)

- **Framework**: Next.js (Website), React (App)
- **UI Library**: PrimeReact (Always use PrimeReact components when possible instead of drawing custom ones. For example, use `Avatar` and `AvatarGroup` for profile pictures).
- **Styling**:
  - **PrimeFlex**: Use PrimeFlex utility classes for layout (e.g., `flex`, `grid`, `col-12`, `mb-4`).
  - **CSS Variables**: Use the global CSS variables defined in `globals.css` (e.g., `var(--primary-color)`, `var(--surface-ground)`) to maintain consistency.
  - **NO Tailwind defaults**: Do not use standard Tailwind colors because it is not used in the project.

### Backend (`apps/file-brain/file_brain`)

- **Language**: Python 3.11+
- **Search Engine**: Typesense
- **Containerization**: Docker / Podman

## Maintenance

- **Keep this file updated**: When making significant updates to the code or project structure, always check if this file needs to be updated to reflect the new state or conventions.
- **README Sync**: The root `README.md` and `apps/file-brain/README.md` must be kept in sync.
  - When updating the root `README.md`, apply the same changes to `apps/file-brain/README.md`.
  - **PyPI Compatibility**: `apps/file-brain/README.md` must use **absolute URLs** pointing to the GitHub `main` branch for all images to ensure they render correctly on PyPI (e.g., `https://raw.githubusercontent.com/hamza5/file-brain/main/docs/images/logo.svg`).
  - The root `README.md` may continue to use relative paths.
- **Website README Sync**: The `apps/website/README.md` must reflect the actual website structure and content.
  - When modifying website sections (Hero, Features, Use Cases, Pro Version, etc.), update the website README accordingly.
