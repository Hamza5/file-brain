<div align="center">
  <img src="https://raw.githubusercontent.com/hamza5/file-brain/main/docs/images/logo.svg" alt="File Brain Logo" width="120" />
  <h1>File Brain</h1>
  <p><strong>Your Local AI Search Engine</strong></p>

[![CI](https://github.com/hamza5/file-brain/actions/workflows/ci.yml/badge.svg)](https://github.com/hamza5/file-brain/actions/workflows/ci.yml)
[![Release](https://github.com/hamza5/file-brain/actions/workflows/release.yml/badge.svg)](https://github.com/hamza5/file-brain/actions/workflows/release.yml)
[![PyPI version](https://badge.fury.io/py/file-brain.svg)](https://badge.fury.io/py/file-brain)
[![PyPI - Python Version](https://img.shields.io/pypi/pyversions/file-brain.svg)](https://pypi.org/project/file-brain/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://github.com/hamza5/file-brain/blob/main/LICENSE)

</div>

<p align="center">
  Find what you mean, not just what you say. File Brain runs locally on your machine to index and understand your files.
</p>

## What is File Brain?

File Brain is a desktop application that helps you find files instantly using natural language. Instead of remembering exact filenames, you can ask questions like "flight ticket invoice", and File Brain uses AI to understand the meaning and show the relevant files.

## Key Features

- **🧠 Find what you mean**: Uses advanced Semantic Search -in addition to full text search- to understand the intent behind your query (e.g., search for "worker", find documents mentioning "employee").
- **📝 Typo Resistance**: Robust against typos. Search for "iphone" even if you typed "ipnone".
- **📄 Supports Everything**: Extracts the content of over 1400+ file formats (PDF, Word, Excel, PowerPoint, images, archives, and more).
- **🌍 Cross-Language Search**: Search in one language to find documents written in another (e.g., search for "Chair", find documents mentioning "Silla" -in Spanish-).
- **🚀 Fast Matching**: Search results are shown within milliseconds, not minutes.
- **👁️ OCR Support**: Automatically extracts text from screenshots, and scanned documents.
- **⚡ Auto-Indexing**: Detects changes in real-time and updates the index instantly.
- **🛡️ Read-Only & Safe**: File Brain only reads your files to index them. It never modifies, deletes, or alters your data in any way.
- **🔒 Privacy First**: All indexing and AI processing happens 100% locally on your machine. Your data never leaves your computer.

## Why File Brain?

Most search tools look for _exact matches_ of filenames or content. File Brain goes further by understanding _meaning_, tolerating typos, and extracting text from images. See how it compares to other popular tools:

| App Name       | Price    | OS                 | Indexing | Search Speed  | File Content Search | Fuzzy Search     | Semantic Search | OCR     |
| :------------- | :------- | :----------------- | :------- | :------------ | :------------------ | :--------------- | :-------------- | :------ |
| Everything     | Free     | Windows            | No       | Instant       | No                  | Wildcards/Regexp | No              | No      |
| Listary        | Free     | Windows            | No       | Instant       | No                  | Yes              | No              | No      |
| Alfred         | Free     | MacOS              | No       | Very fast     | No                  | Yes              | No              | Yes     |
| Copernic       | 25$/yr   | Windows            | Yes      | Fast          | 170+ formats        | Partial          | No              | Yes     |
| DocFetcher     | Free     | Cross-platform     | Yes      | Fast          | 32 formats          | No               | No              | No      |
| Agent Ransack  | Free     | Windows            | No       | Slow          | PDF and Office      | Wildcards/Regexp | No              | No      |
| **File Brain** | **Free** | **Cross-platform** | **Yes**  | **Very fast** | **1000+ formats**   | **Yes**          | **Yes**         | **Yes** |

## Prerequisites

- **Python 3.11** or higher
- **Docker** or **Podman** (Must be installed and running)

## Installation

Install File Brain easily using pip:

```bash
pip install -U file-brain
```

## Getting Started

1.  **Run the App**:

    ```bash
    file-brain
    ```

2.  **Initialization Wizard**:
    On the first run, a simple wizard will guide you:
    1.  **System Check**: Verifies Docker is running.
    2.  **Download Components**: Downloads the necessary search services.
    3.  **Initialize Engine**: Starts the background search components.
    4.  **Download Embedding (AI) Model**: Fetches the embedding (AI) model for intelligent search.
    5.  **Finalize Setup**: Initializes the search engine database.

    ![Initialization Wizard](https://raw.githubusercontent.com/hamza5/file-brain/main/docs/images/wizard.png)
    _The easy-to-use setup wizard that guides you through downloading models and initializing the search database._

> [!TIP]
> If the automatic wizard fails to start the services or download the models, see the [Manual Setup](#manual-setup) section below.

3.  **Select Folders**:
    Choose the folders you want to index via the dashboard settings.

4.  **Indexing**:
    - **Manual Indexing**: Performs a deep scan of all files. Great for initial setup.
    - **Auto-Indexing**: Watches for new or changed files and processes them instantly.

> [!NOTE]
> File Brain must be running for the background indexing to process your files.

## Visualizing the Interaction

### Dashboard

See all your indexed files, storage usage, and recently indexed files at a glance.

![Dashboard Overview](https://raw.githubusercontent.com/hamza5/file-brain/main/docs/images/dashboard.png)

### Semantic Search

Search naturally, like "Airplane ticket" to find relevant documents even if the filename is different.

![Semantic Search](https://raw.githubusercontent.com/hamza5/file-brain/main/docs/images/search.png)

## **PRO** Version

Want more power? The **PRO** version is on the way with advanced capabilities:

- **Chat with Files**: Ask questions and get answers from your documents.
- **Search by File**: Find semantically similar files.
- **Video Search**: Find scenes in your videos.
- **Cloud & Network Drives**: Connect Google Drive, Dropbox, Box, and network drives.

[Check out the website](https://file-brain.com/) to learn more.

## Manual Setup

If the initialization wizard fails, you can manually set up the background services:

### 1. Prepare Embedding (AI) Model Directory

File Brain expects the embedding model to be in a specific system directory. Create it manually:

**Linux / macOS:**

```bash
mkdir -p ~/.local/share/file-brain/typesense-data/models/ts_paraphrase-multilingual-mpnet-base-v2
```

**Windows (PowerShell):**

```powershell
New-Item -Path "$env:LOCALAPPDATA\file-brain\typesense-data\models\ts_paraphrase-multilingual-mpnet-base-v2" -ItemType Directory -Force
```

### 2. Download the Model Files

You can browse the files in the [Hugging Face repository](https://huggingface.co/typesense/models-moved/tree/main/paraphrase-multilingual-mpnet-base-v2). Download these three files into the directory created above:

- [config.json](https://huggingface.co/typesense/models-moved/resolve/main/paraphrase-multilingual-mpnet-base-v2/config.json)
- [model.onnx](https://huggingface.co/typesense/models-moved/resolve/main/paraphrase-multilingual-mpnet-base-v2/model.onnx)
- [sentencepiece.bpe.model](https://huggingface.co/typesense/models-moved/resolve/main/paraphrase-multilingual-mpnet-base-v2/sentencepiece.bpe.model)

### 3. Pull Docker Images

Run the following commands to manually pull the required services:

```bash
docker pull hamza5/tika:latest-full
docker pull hamza5/typesense-gpu:29.0-cuda11.8.0-cudnn8-runtime-ubuntu22.04
```

_Note: Once the images are pulled and the model files are in place, File Brain will handle starting the services automatically on the next run._
