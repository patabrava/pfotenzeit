# Vendor asset evaluation (staging for purchased or licensed third-party models)

Nothing in this directory is bought or downloaded until the user authorizes it (D-036, `docs/HANDOFF_PREMIUM_ASSET_SOURCING.md`). Layout per asset:

```
art/vendor-evaluation/<vendor>/<asset>/
  PROVENANCE.md         required, committed
  original/             purchased files exactly as delivered — NOT committed (.gitignore)
  blender/              editable .blend + conversion scripts — committed only if the license allows
  export/               GLBs exported from Blender, input to scripts/ingest-vendor.mjs — not committed
  staged/               output of ingest (glb, report.json, manifest-entry.json) — committed (derivative, see license)
  review/               runtime screenshots from the hero review harness — committed
```

`PROVENANCE.md` template (fill every line; "unknown" is an allowed value, a missing line is not):

```
Vendor / author:
Listing URL:
Purchased on (date) / order id / price paid:
License name and version (copy the exact label from the receipt):
Written permission for Three.js / open GLB delivery: yes (file: permission.pdf) | no | pending
AI-assisted local processing permitted: yes | no | unclear (quote the clause)
Delivered files (name, bytes, sha256):
Blender version used for conversion:
Conversion script(s):
Known restrictions (attribution, no redistribution of source, extraction measures):
```

Rules: keep paid originals and textures out of the public repository unless the license explicitly permits redistribution; compression or renaming is not compliance. Stage derivatives only after the license question for browser delivery is answered. The live manifest (`public/assets/manifest.json`) gets an entry only through `scripts/ingest-vendor.mjs` plus a human decision recorded in `docs/DECISIONS.md`.
