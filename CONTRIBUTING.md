# Contributing

Use [GitHub issues](https://github.com/viames/numbers-native/issues) for bugs and feature requests. Include the plugin, macOS, Numbers and Node versions, a minimal synthetic example and expected/actual behavior. Do not attach private spreadsheets, credentials or personal data.

Keep Numbers Native native-only: Apple Events and documented macOS APIs, no Excel conversion, private `.numbers` parsing, Accessibility/UI/clipboard driver or arbitrary script tool. Features absent from Numbers' scripting interface must be described honestly.

Run `npm ci`, `npm test` and `npm run build`. Native tests require a logged-in Mac with Numbers and Automation permission and must create only isolated synthetic documents. Report platform/locale verification separately from portable tests. New or changed chart templates require native readback, save/reopen and visual evidence before changing their version allowlist.

Submit focused pull requests with a clear problem, implementation and validation. Contributions are accepted under this repository's MIT license. Native failures can leave partial edits; preserve that evidence and avoid automatic mutation retries.
