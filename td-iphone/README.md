# TD Diamonds — iPhone app

Photo input for the TD Diamonds software (same login, same database).

- **Memo-in**: scan/photo/PDF of a supplier memo → memo-in.
- **Supplier invoice**: invoice → purchase ("Is this from a memo-in?" → match by GIA # then lot #; price differences confirmed).
- **Stone for a customer**: memo-in / invoice / certificate → find the stones in stock → customer memo or invoice.
- **Certificate**: GIA certificate → details and certificate attached to a stone in stock.
- Share sheet: WhatsApp / Mail / Files / Photos → Share → TD Diamonds.

## Build (no Mac needed)
1. `npm install`
2. `npx eas-cli@latest login` (Expo account)
3. `npx eas-cli@latest build --platform ios --profile production --auto-submit` (needs the Apple Developer account of TD Gems LLC)
4. Install from TestFlight.

Expo SDK 58. Checks: `npx tsc --noEmit`, `npx expo export --platform ios`.
