# Whoops Desktop App

App Electron qui wrap le site whoops.krakenbots.com.

## Setup

```bash
npm install
```

## Dev

```bash
npm start
```

## Build

### macOS DMG
```bash
npm run build:mac
```

### Windows
```bash
npm run build:win
```

### Linux
```bash
npm run build:linux
```

## GitHub Actions

Le DMG est buildé automatiquement via GitHub Actions à chaque push.
Télécharge l'artifact depuis l'onglet Actions de ton repo.

## Icône

Remplace les fichiers dans `build/`:
- `icon.png` (512x512 minimum)
- `icon.icns` (pour macOS)
- `icon.ico` (pour Windows)

Tu peux générer les icônes depuis un PNG avec:
- https://cloudconvert.com/png-to-icns
- https://icoconvert.com/
