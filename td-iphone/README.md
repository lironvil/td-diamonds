# TD Diamonds — iPhone app

Camera for the TD Diamonds software (same login, same database). Photograph or share a document, say what it is, and it goes to the software's Inbox — already read, ready to review and save on the computer.

- Scan (iPhone document scanner), Photos, or Files/PDF.
- Share sheet: WhatsApp / Mail / Files / Photos → Share → TD Diamonds.
- Types: supplier memo, supplier invoice, certificate, other.
- "Recently sent" shows each document's status (to review / saved / couldn't read).

## Build (no Mac needed)
1. `npm install`
2. `npx eas-cli@latest login` (Expo account)
3. `npx eas-cli@latest build --platform ios --profile production --auto-submit` (needs the Apple Developer account of TD Gems LLC)
4. Install from TestFlight.

Expo SDK 58. Checks: `npx tsc --noEmit`, `npx expo export --platform ios`.
