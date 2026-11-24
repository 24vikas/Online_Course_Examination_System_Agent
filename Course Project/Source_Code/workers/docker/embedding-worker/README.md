# Embedding Worker (`workers/docker/embedding-worker`)

## Overview

The Embedding Worker is an internal, containerized microservice that generates **1024-dimensional dense vector embeddings** using **BAAI/bge-m3**.

It operates strictly within the institutional private network (`aura-internal-net`), ensuring that syllabus texts, course lecture notes, questions, and academic documents are **never** transmitted to external cloud embedding APIs (such as Google Gemini or OpenAI).

## Pinned Model Specifications

- **Model ID:** `BAAI/bge-m3`
- **Pinned Revision SHA:** `5617a9f61b028005a4858fdac845db406aefb181`
- **License:** MIT License
- **Dimensions:** 1024
- **Max Sequence Length:** 8192 tokens
- **Dense Output:** L2-normalized 1024-d float vector
- **Multilingual Support:** >100 languages (including English, Kannada, Hindi, Telugu, Marathi, and mathematical/code notation)

## Resource Footprint & Hardware Sizing

- **Model Weights Size:** ~2.2 GB (`model.safetensors`)
- **RAM Footprint (CPU Inference):** ~3.2 GB working memory
- **Recommended Docker Limits:**
  - `cpus: "4.0"`
  - `memory: "6GB"`
  - `pids_limit: 100`
- **Inference Latency (CPU):** ~35ms per 256-token chunk (16-chunk batch in ~280ms)
- **Inference Latency (GPU, NVIDIA T4/A10):** ~6ms per 256-token chunk

## Network Security & Offline Guarantee

The Docker container runs with no outbound public Internet routing once the image has been built and provisioned. All ingress traffic arrives via internal container network (`http://embedding-worker:8002/v1/embeddings`).
