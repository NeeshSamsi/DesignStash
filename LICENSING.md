# Licensing Information

DesignStash is currently source-available under the **PolyForm Shield License 1.0.0**.

## Key Terms

- **Source-Available**: You can view, modify, and use the source code for permitted purposes.
- **Non-Compete**: You may not use this software to provide a product that competes with the software or any product provided by the licensors.
- **Phase 1 Status**: Usage during Phase 1 is free, as per specification §14.

## Planned Abandonment & Future Licensing

There is a planned transition for this project to become Open Source under the **Apache License 2.0**. This "planned abandonment" rider is currently pending final legal review. Once active, the project will transition to the Apache-2.0 license after a specified period or milestone.

## Third-party fonts

The app bundles two fonts, both under the **SIL Open Font License 1.1**:

- **Unbounded** (display and titles), Copyright 2022 The Unbounded Project Authors.
- **Funnel Sans** (everything else), Copyright 2023 The Funnel Project Authors.

Their licences are in `licenses/fonts/` and ship inside the app at `Contents/Resources/licenses/fonts/`. A font added later needs its licence there too; `scripts/packaging/licenses.test.ts` checks it.
