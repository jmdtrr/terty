# Deploy Guide

## Current Structure

- index.html
- assets/30Icon.svg
- netlify.toml
- vercel.json

## Netlify (Git-based)

1. Push this folder to a GitHub repository.
2. In Netlify, choose Add new site > Import an existing project.
3. Select the repository.
4. Build command: leave empty.
5. Publish directory: .
6. Deploy.

Netlify reads netlify.toml automatically.

## Netlify (Drag and Drop)

1. Zip the full folder content (index.html, assets, netlify.toml).
2. In Netlify dashboard, drag and drop the zip.
3. Site goes live immediately.

## Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, choose Add New > Project.
3. Import the repository.
4. Framework preset: Other.
5. Build command: leave empty.
6. Output directory: .
7. Deploy.

Vercel reads vercel.json automatically.

## Optional CLI Deploy

### Netlify CLI

- Install: npm i -g netlify-cli
- Login: netlify login
- Deploy draft: netlify deploy --dir .
- Deploy production: netlify deploy --prod --dir .

### Vercel CLI

- Install: npm i -g vercel
- Login: vercel login
- Deploy: vercel
- Production deploy: vercel --prod
